import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Enrolment } from "../models/Enrolment";
import { Guardian } from "../models/Guardian";
import { Student } from "../models/Student";
import { StudentStatusLog } from "../models/StudentStatusLog";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };
const AADHAAR = "234567890124";

beforeEach(async () => {
  await seedSuperAdmin();
});

/** A school with its year and Class 5 - A (40 seats). */
async function ready(name = "Sunrise Public School") {
  const s = await createSchool(name);
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  const klass = (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: "Class 5", capacity: 2000, sectionCount: 0 })).body.data;
  const section = (await request(app).post(`${academics}/classes/${klass.id}/sections`).set(auth(s.token)).send({ name: "A", capacity: 40, room: "5A" })).body.data;
  return { ...s, classId: klass.id as string, sectionId: section.id as string };
}
type School = Awaited<ReturnType<typeof ready>>;

const body = (s: School, firstName: string, over: Record<string, unknown> = {}, mobile = "9876543210") => ({
  firstName,
  lastName: "Verma",
  gender: "Female",
  dateOfBirth: "2016-05-14",
  address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  previousSchool: { name: "Little Flower School" },
  classId: s.classId,
  sectionId: s.sectionId,
  guardians: [{ name: `Father of ${firstName}`, relation: "Father", isPrimary: true, mobile }],
  ...over,
});

/** Admits a child into Class 5 - A; `mobile` is the father's. */
async function admit(s: School, firstName: string, over: Record<string, unknown> = {}, mobile = "9876543210") {
  const res = await post(s.token, "", body(s, firstName, over, mobile));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { id: string; name: string; admissionNumber: string; guardians: { id: string }[] };
}
/** The same father as another child (a parent is found by their mobile number, so a second child is linked to the one already there). */
const sameFather = (other: { guardians: { id: string }[] }, mobile = "9876543210") => ({
  guardians: [{ guardianId: other.guardians[0].id, name: "Father", relation: "Father", isPrimary: true, mobile }],
});
const listed = async (s: School) => ((await get(s.token, "?limit=50")).body.data.items as { name: string }[]).map((i) => i.name);

describe("marking students inactive", () => {
  it("takes them out of the list, the seats and the export, keeps their record whole, and writes who did it, when and why", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha", { rollNumber: 1 });
    const kabir = await admit(s, "Kabir", { rollNumber: 2 }, "9111111111");

    const res = await post(s.token, "/deactivate", { ids: [asha.id], reason: "Left the school" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ deactivated: 1, skipped: 0 });

    expect(await listed(s)).toEqual(["Kabir Verma"]);
    expect((await get(s.token, "/capacity")).body.data.totals.students).toBe(1);
    expect((await get(s.token, "/export/preview")).body.data).toMatchObject({ total: 1 });
    // The details are still there to read; they cannot be changed until the student is active again.
    const page = (await get(s.token, `/${asha.id}`)).body.data;
    expect(page).toMatchObject({ name: "Asha Verma", status: "inactive", inactive: { reason: "Left the school", by: { name: "Asha Verma", role: "school_admin" } } });
    expect(typeof page.inactive.at).toBe("string");
    expect((await get(s.token, `/${kabir.id}`)).body.data.inactive).toBeNull();
    expect((await patch(s.token, `/${asha.id}`, { firstName: "Changed" })).status).toBe(404);
    expect((await patch(s.token, `/${asha.id}/enrolment`, { rollNumber: 5 })).status).toBe(404);

    const kept = await Student.findOne({ _id: asha.id, tenantId: s.tenantId }).lean();
    expect(kept?.status).toBe("inactive");
    expect(kept?.inactive).toMatchObject({ reason: "Left the school", by: { name: "Asha Verma", role: "school_admin" } });
    const log = await StudentStatusLog.find({ tenantId: s.tenantId }).lean();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "deactivated", name: "Asha Verma", admissionNumber: asha.admissionNumber, className: "Class 5", sectionName: "A", reason: "Left the school", by: { name: "Asha Verma", role: "school_admin" } });
  });

  it("the reason is optional and short", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha");
    expect((await post(s.token, "/deactivate", { ids: [asha.id], reason: "x".repeat(201) })).status).toBe(400);
    expect((await post(s.token, "/deactivate", { ids: [asha.id] })).body.data).toEqual({ deactivated: 1, skipped: 0 });
    expect((await get(s.token, `/${asha.id}`)).body.data.inactive.reason).toBeNull();
  });

  it("frees the roll number, and a brother or sister no longer sees the inactive one", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha", { rollNumber: 1 });
    await post(s.token, "/deactivate", { ids: [asha.id] });
    const kabir = await admit(s, "Kabir", { rollNumber: 1, ...sameFather(asha) });
    expect((await get(s.token, `/${kabir.id}`)).body.data.siblings).toEqual([]);
    const lookup = await post(s.token, "/guardians/lookup", { mobile: "9876543210" });
    expect(lookup.body.data.guardian.children.map((c: { name: string }) => c.name)).toEqual(["Kabir Verma"]);
  });

  it("moves many at once, and says how many it could not (not found, another school's, already inactive)", async () => {
    const s = await ready();
    const other = await ready("Moonrise Public School");
    const a = await admit(s, "Asha");
    const b = await admit(s, "Bina", {}, "9222222222");
    const theirs = await admit(other, "Chitra", {}, "9333333333");
    expect((await post(s.token, "/deactivate", { ids: [a.id] })).body.data).toEqual({ deactivated: 1, skipped: 0 });
    const res = await post(s.token, "/deactivate", { ids: [a.id, b.id, theirs.id, "64b000000000000000000001"] });
    expect(res.body.data).toEqual({ deactivated: 1, skipped: 3 });
    expect(await listed(s)).toEqual([]);
    expect(await listed(other)).toEqual(["Chitra Verma"]);
  });

  it("is for the people who admit students; the body must be a list of ids", async () => {
    const s = await ready();
    const a = await admit(s, "Asha");
    for (const role of ["accountant", "teacher", "parent"] as const) {
      expect((await post(await addColleague(s.tenantId, role), "/deactivate", { ids: [a.id] })).status, role).toBe(403);
    }
    expect((await post(await addColleague(s.tenantId, "principal"), "/deactivate", { ids: [a.id] })).status).toBe(200);
    expect((await post(s.token, "/deactivate", { ids: [] })).status).toBe(400);
    expect((await post(s.token, "/deactivate", { ids: ["nope"] })).status).toBe(400);
    expect((await post(s.token, "/deactivate", {})).status).toBe(400);
  });

  it("there is no way to delete a student: nothing removes one", async () => {
    const s = await ready();
    const a = await admit(s, "Asha");
    await post(s.token, "/deactivate", { ids: [a.id] });
    for (const path of ["/inactive/purge", "/trash/purge", "/purge"]) expect((await post(s.token, path, { ids: [a.id] })).status, path).toBe(404);
    expect((await request(app).delete(`${api}/${a.id}`).set(auth(s.token))).status).toBe(404);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });
});

describe("the inactive students", () => {
  it("lists them with the class they were in, who made them inactive, when and why; the newest first; searchable", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha", { rollNumber: 1 });
    const kabir = await admit(s, "Kabir", {}, "9111111111");
    await post(s.token, "/deactivate", { ids: [asha.id], reason: "Transferred" });
    await post(s.token, "/deactivate", { ids: [kabir.id] });

    const res = await get(s.token, "/inactive");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 2, page: 1 });
    expect(res.body.data.items.map((i: { name: string }) => i.name)).toEqual(["Kabir Verma", "Asha Verma"]);
    expect(res.body.data.items[1]).toMatchObject({
      id: asha.id,
      admissionNumber: asha.admissionNumber,
      className: "Class 5",
      sectionName: "A",
      rollNumber: 1,
      reason: "Transferred",
      inactiveBy: { name: "Asha Verma", role: "school_admin" },
    });
    expect(typeof res.body.data.items[1].inactiveAt).toBe("string");
    expect((await get(s.token, "/inactive?q=asha")).body.data.items.map((i: { name: string }) => i.name)).toEqual(["Asha Verma"]);
  });

  it("is for the people who admit students, and each school sees only its own", async () => {
    const s = await ready();
    const other = await ready("Moonrise Public School");
    await post(s.token, "/deactivate", { ids: [(await admit(s, "Asha")).id] });
    expect((await get(await addColleague(s.tenantId, "accountant"), "/inactive")).status).toBe(403);
    expect((await get(other.token, "/inactive")).body.data.total).toBe(0);
  });
});

describe("making them active again", () => {
  it("puts them back in their class and section with their roll number, and the log says so", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha", { rollNumber: 7 });
    await post(s.token, "/deactivate", { ids: [asha.id], reason: "Left the school" });

    const res = await post(s.token, "/reactivate", { ids: [asha.id] });
    expect(res.body.data).toEqual({ reactivated: 1, skipped: 0, rollNumbersLost: 0 });
    expect(await listed(s)).toEqual(["Asha Verma"]);
    const page = (await get(s.token, `/${asha.id}`)).body.data;
    expect(page).toMatchObject({ status: "active", inactive: null, place: { className: "Class 5", sectionName: "A", rollNumber: 7 } });
    expect((await get(s.token, "/inactive")).body.data.total).toBe(0);
    expect((await patch(s.token, `/${asha.id}`, { firstName: "Asha" })).status).toBe(200);
    const log = await StudentStatusLog.find({ tenantId: s.tenantId }).sort({ createdAt: 1 }).lean();
    expect(log.map((l) => l.action)).toEqual(["deactivated", "reactivated"]);
  });

  it("gives the roll number back only when nobody has taken it meanwhile", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha", { rollNumber: 7 });
    await post(s.token, "/deactivate", { ids: [asha.id] });
    await admit(s, "Kabir", { rollNumber: 7 }, "9111111111");
    const res = await post(s.token, "/reactivate", { ids: [asha.id] });
    expect(res.body.data).toEqual({ reactivated: 1, skipped: 0, rollNumbersLost: 1 });
    expect((await get(s.token, `/${asha.id}`)).body.data.place.rollNumber).toBeNull();
  });

  it("only touches inactive students, and is for the people who admit", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha");
    expect((await post(s.token, "/reactivate", { ids: [asha.id] })).body.data).toMatchObject({ reactivated: 0, skipped: 1 });
    expect((await post(await addColleague(s.tenantId, "accountant"), "/reactivate", { ids: [asha.id] })).status).toBe(403);
  });
});

describe("one school never reaches another school's inactive students", () => {
  it("cannot reactivate a student of another school, and does not see them in its own list", async () => {
    const a = await ready();
    const b = await ready("Moonrise Public School");
    const asha = await admit(a, "Asha");
    await post(a.token, "/deactivate", { ids: [asha.id] });
    expect((await post(b.token, "/reactivate", { ids: [asha.id] })).body.data).toMatchObject({ reactivated: 0, skipped: 1 });
    expect((await get(b.token, "/inactive")).body.data.total).toBe(0);
    expect((await get(a.token, "/inactive")).body.data.total).toBe(1);
    expect(await StudentStatusLog.countDocuments({ tenantId: b.tenantId })).toBe(0);
    expect(await Enrolment.countDocuments({ tenantId: b.tenantId })).toBe(0);
    expect(await Guardian.countDocuments({ tenantId: a.tenantId })).toBe(1);
  });
});

describe("a child who comes back", () => {
  it("is not admitted as a new student: the number they hold is refused and the message says they are inactive", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha", { aadhaarNumber: AADHAAR });
    await post(s.token, "/deactivate", { ids: [asha.id] });
    const again = await post(s.token, "", body(s, "Meera", { lastName: "Joshi", aadhaarNumber: AADHAAR }, "9444444444"));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("AADHAAR_TAKEN");
    expect(again.body.message).toContain("inactive");
  });

  it("the same child admitted again is caught as a possible duplicate, and the answer says the other record is inactive", async () => {
    const s = await ready();
    const asha = await admit(s, "Asha");
    await post(s.token, "/deactivate", { ids: [asha.id] });
    const again = await post(s.token, "", body(s, "Asha", { ...sameFather(asha) }));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("DUPLICATE_STUDENT");
    expect(again.body.message).toContain("inactive");
    expect(again.body.details[0].student).toMatchObject({ id: asha.id, inactive: true });
    // After "reactivate" it is the usual answer, without the word.
    await post(s.token, "/reactivate", { ids: [asha.id] });
    const active = await post(s.token, "", body(s, "Asha", { ...sameFather(asha) }));
    expect(active.body.code).toBe("DUPLICATE_STUDENT");
    expect(active.body.details[0].student.inactive).toBe(false);
  });
});
