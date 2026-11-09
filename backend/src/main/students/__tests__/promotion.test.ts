import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Enrolment } from "../models/Enrolment";
import { PromotionBatch } from "../models/PromotionBatch";
import { Student } from "../models/Student";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);
const acad = (token: string, path: string, body: object = {}) => request(app).post(`${academics}${path}`).set(auth(token)).send(body);

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };
const NEXT = { name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

/**
 * A school with Class 5 (A of 40 seats, B of 40), Class 6 (A of 40) and its next year already made (sections copied). Asha is in 5-A,
 * Bina in 5-B and Chitra in 6-A (the last class).
 */
async function ready(name = "Sunrise Public School", sixSeats = 40) {
  const s = await createSchool(name);
  await acad(s.token, "/academic-years/initial", YEAR);
  const klass = async (className: string) => (await acad(s.token, "/classes", { name: className, capacity: 2000, sectionCount: 0 })).body.data.id as string;
  const section = async (classId: string, sectionName: string, capacity: number) =>
    (await acad(s.token, `/classes/${classId}/sections`, { name: sectionName, capacity, room: `Room ${sectionName}` })).body.data.id as string;
  const c5 = await klass("Class 5");
  const c6 = await klass("Class 6");
  const a5 = await section(c5, "A", 40);
  const b5 = await section(c5, "B", 40);
  const a6 = await section(c6, "A", sixSeats);
  const admit = async (firstName: string, classId: string, sectionId: string, mobile: string, rollNumber: number) => {
    const res = await post(s.token, "", {
      firstName,
      lastName: "Verma",
      gender: "Female",
      dateOfBirth: "2012-05-14",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      previousSchool: { name: "Little Flower School" },
      classId,
      sectionId,
      rollNumber,
      guardians: [{ name: `Father of ${firstName}`, relation: "Father", isPrimary: true, mobile }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  };
  const asha = await admit("Asha", c5, a5, "9000000001", 1);
  const bina = await admit("Bina", c5, b5, "9000000002", 1);
  const chitra = await admit("Chitra", c6, a6, "9000000003", 1);
  const next = (await acad(s.token, "/academic-years", NEXT)).body.data as { id: string };
  return { ...s, c5, c6, a5, b5, a6, asha, bina, chitra, nextId: next.id };
}
type School = Awaited<ReturnType<typeof ready>>;

type Promotion = { id: string; status: string; summary: Record<string, number>; entries: { studentId: string; name: string; outcome: string; from: { className: string; sectionName: string | null }; to: { classId: string; className: string; sectionId: string | null; sectionName: string | null } | null }[]; targets: { classId: string; className: string; sections: { id: string; name: string }[] }[]; decision: { outcome: string; note: string | null; by: { name: string } } | null };
const start = async (s: School) => (await post(s.token, "/promotions", { toAcademicYearId: s.nextId })).body.data as Promotion;
const current = async (s: School) => (await get(s.token, `/promotions?toAcademicYearId=${s.nextId}`)).body.data as Promotion | null;
/** A section of the next year's copy of a class (the sections are copies with their own ids). */
const sectionOfNext = (p: Promotion, className: string, name: string) => p.targets.find((t) => t.className === className)!.sections.find((x) => x.name === name)!.id;
const entryOf = (p: Promotion, studentId: string) => p.entries.find((e) => e.studentId === studentId)!;
const toPlace = (p: Promotion, studentId: string) => {
  const t = entryOf(p, studentId).to;
  return t ? `${t.className} ${t.sectionName ?? "-"}` : null;
};

describe("starting a promotion", () => {
  it("suggests, for every student of the running year, the next class (the same section when it has one), and 'leave' from the last class", async () => {
    const s = await ready();
    const res = await post(s.token, "/promotions", { toAcademicYearId: s.nextId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const p = res.body.data as Promotion;
    expect(p).toMatchObject({ status: "draft", summary: { total: 3, promote: 2, retain: 0, leave: 1 } });
    expect(entryOf(p, s.asha)).toMatchObject({ name: "Asha Verma", outcome: "promote", from: { className: "Class 5", sectionName: "A" } });
    // Class 6 has only an A: Bina (5-B) goes to its first section.
    expect([toPlace(p, s.asha), toPlace(p, s.bina), toPlace(p, s.chitra)]).toEqual(["Class 6 A", "Class 6 A", null]);
    expect(entryOf(p, s.chitra).outcome).toBe("leave");
    expect(p.targets.map((t) => [t.className, t.sections.map((x) => x.name)])).toEqual([["Class 5", ["A", "B"]], ["Class 6", ["A"]]]);
    // Nothing is enrolled yet.
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, academicYearId: s.nextId })).toBe(0);
  });

  it("is found again by the year it is for", async () => {
    const s = await ready();
    expect(await current(s)).toBeNull();
    const p = await start(s);
    expect((await current(s))?.id).toBe(p.id);
  });

  it("leaves out students who are inactive", async () => {
    const s = await ready();
    await post(s.token, "/deactivate", { ids: [s.bina] });
    const p = await start(s);
    expect(p.entries.map((e) => e.studentId).sort()).toEqual([s.asha, s.chitra].sort());
  });

  it("is refused for a year that is not waiting, another school's year or a second time; and for the wrong people", async () => {
    const s = await ready();
    const other = await ready("Moonrise Public School");
    const running = (await get(s.token, "/capacity")).body.data.academicYear.id;
    expect((await post(s.token, "/promotions", { toAcademicYearId: running })).status).toBe(409);
    expect((await post(other.token, "/promotions", { toAcademicYearId: s.nextId })).status).toBe(404);
    expect((await post(s.token, "/promotions", { toAcademicYearId: "nope" })).status).toBe(400);
    expect((await post(await addColleague(s.tenantId, "accountant"), "/promotions", { toAcademicYearId: s.nextId })).status).toBe(403);
    expect((await post(await addColleague(s.tenantId, "principal"), "/promotions", { toAcademicYearId: s.nextId })).status).toBe(201);
    const again = await post(s.token, "/promotions", { toAcademicYearId: s.nextId });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("PROMOTION_EXISTS");
  });
});

describe("changing the list", () => {
  it("one student stays in the class, another leaves, another goes to a section chosen: every change is checked", async () => {
    const s = await ready();
    const p = await start(s);
    const res = await patch(s.token, `/promotions/${p.id}`, {
      entries: [
        { studentId: s.asha, outcome: "retain" },
        { studentId: s.bina, outcome: "leave" },
        { studentId: s.chitra, outcome: "promote", classId: s.c5, sectionId: sectionOfNext(p, "Class 5", "B") },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const q = res.body.data as Promotion;
    expect([toPlace(q, s.asha), toPlace(q, s.bina), toPlace(q, s.chitra)]).toEqual(["Class 5 A", null, "Class 5 B"]);
    expect(q.summary).toMatchObject({ promote: 1, retain: 1, leave: 1 });
  });

  it("refuses a class or section that is not the school's, a section of another class, and a student who is not on the list", async () => {
    const s = await ready();
    const p = await start(s);
    const bad = async (entry: object) => (await patch(s.token, `/promotions/${p.id}`, { entries: [entry] })).status;
    expect(await bad({ studentId: s.asha, outcome: "promote", classId: "64b000000000000000000001" })).toBe(400);
    expect(await bad({ studentId: s.asha, outcome: "promote", classId: s.c6, sectionId: s.a5 })).toBe(400);
    expect(await bad({ studentId: "64b000000000000000000001", outcome: "leave" })).toBe(400);
    expect(await bad({ studentId: s.asha, outcome: "sideways" })).toBe(400);
    expect((await patch(s.token, `/promotions/${p.id}`, { entries: [] })).status).toBe(400);
    expect(toPlace((await current(s))!, s.asha)).toBe("Class 6 A");
  });

  it("is only for the people who admit, and only while it is a draft", async () => {
    const s = await ready();
    const p = await start(s);
    expect((await patch(await addColleague(s.tenantId, "accountant"), `/promotions/${p.id}`, { entries: [{ studentId: s.asha, outcome: "retain" }] })).status).toBe(403);
    await post(s.token, `/promotions/${p.id}/submit`);
    const late = await patch(s.token, `/promotions/${p.id}`, { entries: [{ studentId: s.asha, outcome: "retain" }] });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("PROMOTION_NOT_DRAFT");
  });
});

describe("the school admin's approval", () => {
  it("the principal sends the list for approval, only the school admin approves, and approval enrols the students in the next year", async () => {
    const s = await ready();
    const principal = await addColleague(s.tenantId, "principal");
    const p = (await post(principal, "/promotions", { toAcademicYearId: s.nextId })).body.data as Promotion;
    expect((await post(principal, `/promotions/${p.id}/submit`)).body.data.status).toBe("submitted");
    expect((await post(principal, `/promotions/${p.id}/approve`)).status).toBe(403);
    expect((await post(principal, `/promotions/${p.id}/reject`, { note: "no" })).status).toBe(403);

    const res = await post(s.token, `/promotions/${p.id}/approve`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ status: "approved", decision: { outcome: "approved", by: { name: "Asha Verma" } } });

    // Asha and Bina now have a place in the next year; Chitra (leaving) has none; the running year is exactly as it was.
    const next = await Enrolment.find({ tenantId: s.tenantId, academicYearId: s.nextId }).lean();
    expect(next).toHaveLength(2);
    expect(next.every((e) => e.rollNumber === null && e.status === "active" && String(e.classId) === s.c6 && String(e.sectionId) === sectionOfNext(p, "Class 6", "A"))).toBe(true);
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, academicYearId: { $ne: s.nextId } })).toBe(3);
    // The students are still in the running year's list, in their own classes.
    expect((await get(s.token, "")).body.data.total).toBe(3);
    // Their page now shows both years.
    const page = (await get(s.token, `/${s.asha}`)).body.data;
    expect(page.enrolments.map((e: { academicYear: { name: string }; className: string }) => [e.academicYear.name, e.className])).toEqual([["2027-2028", "Class 6"], ["2026-2027", "Class 5"]]);
    expect(page.place.className).toBe("Class 5");
  });

  it("a list must be sent for approval before it can be approved or rejected", async () => {
    const s = await ready();
    const p = await start(s);
    expect((await post(s.token, `/promotions/${p.id}/approve`)).status).toBe(409);
    expect((await post(s.token, `/promotions/${p.id}/reject`, { note: "x" })).status).toBe(409);
    expect((await post(s.token, `/promotions/${p.id}/submit`)).status).toBe(200);
    expect((await post(s.token, `/promotions/${p.id}/submit`)).status).toBe(409);
  });

  it("a rejection sends it back to the draft with the admin's words; it can be changed and sent again", async () => {
    const s = await ready();
    const p = await start(s);
    await post(s.token, `/promotions/${p.id}/submit`);
    const rejected = await post(s.token, `/promotions/${p.id}/reject`, { note: "Keep Bina in Class 5" });
    expect(rejected.body.data).toMatchObject({ status: "draft", decision: { outcome: "rejected", note: "Keep Bina in Class 5" } });
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, academicYearId: s.nextId })).toBe(0);
    await patch(s.token, `/promotions/${p.id}`, { entries: [{ studentId: s.bina, outcome: "retain" }] });
    expect((await post(s.token, `/promotions/${p.id}/submit`)).body.data.status).toBe("submitted");
    expect((await post(s.token, `/promotions/${p.id}/approve`)).body.data.status).toBe("approved");
  });

  it("a section that would be over its seats stops the approval, unless the admin says to go over", async () => {
    const s = await ready("Sunrise Public School", 1);
    const p = await start(s);
    await post(s.token, `/promotions/${p.id}/submit`);
    const full = await post(s.token, `/promotions/${p.id}/approve`);
    expect(full.status).toBe(409);
    expect(full.body.code).toBe("SECTION_FULL");
    expect(full.body.message).toContain("Class 6 - A");
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, academicYearId: s.nextId })).toBe(0);
    expect((await post(s.token, `/promotions/${p.id}/approve`, { allowOverCapacity: true })).status).toBe(200);
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, academicYearId: s.nextId })).toBe(2);
  });

  it("can be cancelled, even after approval (while the next year is not on), and then takes its enrolments back", async () => {
    const s = await ready();
    const p = await start(s);
    await post(s.token, `/promotions/${p.id}/submit`);
    await post(s.token, `/promotions/${p.id}/approve`);
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, academicYearId: s.nextId })).toBe(2);
    const res = await post(s.token, `/promotions/${p.id}/cancel`);
    expect(res.status).toBe(200);
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, academicYearId: s.nextId })).toBe(0);
    expect(await current(s)).toBeNull();
    // A new list can be made.
    expect((await post(s.token, "/promotions", { toAcademicYearId: s.nextId })).status).toBe(201);
  });

  it("one school cannot see or change another school's promotion", async () => {
    const s = await ready();
    const other = await ready("Moonrise Public School");
    const p = await start(s);
    expect((await get(other.token, `/promotions?toAcademicYearId=${s.nextId}`)).body.data).toBeNull();
    for (const path of ["submit", "approve", "cancel"]) expect((await post(other.token, `/promotions/${p.id}/${path}`)).status, path).toBe(404);
    expect((await patch(other.token, `/promotions/${p.id}`, { entries: [{ studentId: s.asha, outcome: "leave" }] })).status).toBe(404);
    expect(await PromotionBatch.countDocuments({ tenantId: other.tenantId })).toBe(0);
  });
});

describe("switching the next year on after the promotion", () => {
  async function approved(s: School) {
    const p = await start(s);
    await post(s.token, `/promotions/${p.id}/submit`);
    await post(s.token, `/promotions/${p.id}/approve`);
    return p;
  }

  it("the promoted students are in their new classes, the leaving ones are inactive, the old year is closed and its records are kept", async () => {
    const s = await ready();
    await approved(s);
    const res = await acad(s.token, `/academic-years/${s.nextId}/activate`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ name: "2027-2028", status: "active", leftSchool: 1 });

    const list = (await get(s.token, "?limit=50")).body.data;
    expect(list.academicYear.name).toBe("2027-2028");
    expect(list.items.map((i: { name: string; place: { className: string; sectionName: string } }) => [i.name, i.place.className, i.place.sectionName])).toEqual([
      ["Asha Verma", "Class 6", "A"],
      ["Bina Verma", "Class 6", "A"],
    ]);
    // Chitra finished Class 6: inactive, with the reason, and her old class history is intact.
    const chitra = (await get(s.token, `/${s.chitra}`)).body.data;
    expect(chitra).toMatchObject({ status: "inactive", inactive: { reason: "Passed out after 2026-2027" } });
    expect(chitra.enrolments.map((e: { className: string; academicYear: { name: string } }) => [e.academicYear.name, e.className])).toEqual([["2026-2027", "Class 6"]]);
    expect((await get(s.token, "/inactive")).body.data.items[0]).toMatchObject({ name: "Chitra Verma", className: null });

    const asha = (await get(s.token, `/${s.asha}`)).body.data;
    expect(asha.enrolments.map((e: { academicYear: { name: string }; className: string; current: boolean }) => [e.academicYear.name, e.className, e.current])).toEqual([["2027-2028", "Class 6", true], ["2026-2027", "Class 5", false]]);
    expect((await AcademicYear.findOne({ tenantId: s.tenantId, name: "2026-2027" }).lean())?.status).toBe("closed");
    expect((await PromotionBatch.findOne({ tenantId: s.tenantId }).lean())?.status).toBe("applied");
    // The capacity and the class counts are the new year's.
    expect((await get(s.token, "/capacity")).body.data.totals.students).toBe(2);
  });

  it("is refused while a student has no place in the next year, and says how many", async () => {
    const s = await ready();
    const p = await start(s);
    expect((await acad(s.token, `/academic-years/${s.nextId}/activate`)).status).toBe(409);
    const res = await acad(s.token, `/academic-years/${s.nextId}/activate`);
    expect(res.body.code).toBe("UNPLACED_STUDENTS");
    expect(res.body.message).toContain("3 students");
    // Still the running year, nothing closed.
    expect((await AcademicYear.findOne({ tenantId: s.tenantId, name: "2026-2027" }).lean())?.status).toBe("active");
    // A promotion that is only a draft does not place anyone either.
    expect(p.status).toBe("draft");
  });

  it("a student who left (inactive) before the switch needs no place; a student made inactive is not counted", async () => {
    const s = await ready();
    await post(s.token, "/deactivate", { ids: [s.asha, s.bina, s.chitra] });
    expect((await acad(s.token, `/academic-years/${s.nextId}/activate`)).status).toBe(200);
  });

  it("a student who left can come back in the new year: Make active asks for the class, and enrols them there", async () => {
    const s = await ready();
    await approved(s);
    await acad(s.token, `/academic-years/${s.nextId}/activate`);
    const without = await post(s.token, "/reactivate", { ids: [s.chitra] });
    expect(without.body.data).toEqual({ reactivated: 0, skipped: 0, rollNumbersLost: 0, needsPlacement: 1 });
    expect((await get(s.token, `/${s.chitra}`)).body.data.status).toBe("inactive");

    const next = (await get(s.token, "/capacity")).body.data;
    expect(next.academicYear.name).toBe("2027-2028");
    const structure = (await request(app).get(`${academics}/structure`).set(auth(s.token))).body.data;
    const newSection = structure.classes.find((c: { id: string }) => c.id === s.c6).sections[0].id as string;
    const back = await post(s.token, "/reactivate", { ids: [s.chitra], placement: { classId: s.c6, sectionId: newSection } });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body.data).toEqual({ reactivated: 1, skipped: 0, rollNumbersLost: 0 });
    const page = (await get(s.token, `/${s.chitra}`)).body.data;
    expect(page).toMatchObject({ status: "active", inactive: null, place: { className: "Class 6", sectionName: "A" } });
    expect(page.enrolments).toHaveLength(2);
    expect(await Student.countDocuments({ tenantId: s.tenantId, status: "active" })).toBe(3);
  });

  it("a wrong placement is refused and nobody is changed", async () => {
    const s = await ready();
    await approved(s);
    await acad(s.token, `/academic-years/${s.nextId}/activate`);
    const bad = await post(s.token, "/reactivate", { ids: [s.chitra], placement: { classId: s.c6, sectionId: s.a5 } });
    expect(bad.status).toBe(400);
    expect((await get(s.token, `/${s.chitra}`)).body.data.status).toBe("inactive");
  });
});
