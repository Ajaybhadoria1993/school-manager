import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { auth } from "../../../test/timetable";

/**
 * The school reads the students' attendance of any class, section by section or the whole class, for any days (2026-11-06): each child's
 * marks of the days attendance was taken, with the reason of an absence, and the counts. Time is set with the clock seam.
 */

const api = "/api/v1/attendance";
const THU = "2026-11-05";
const FRI = "2026-11-06";
const NOW = new Date(`${FRI}T10:00:00+05:30`);

async function setUp() {
  const s = await classroomSchool();
  vi.spyOn(clock, "now").mockReturnValue(NOW);
  const take = (token: string, date: string, marks: object[], unit = s.a) => request(app).put("/api/v1/classroom/attendance").set(auth(token)).send({ ...unit, date, marks });
  // Section B of Class 5 with a child of its own is not made here: the school of test/classroom.ts has 5 - A and Class 1.
  const students = (token: string, unit: { classId: string; sectionId: string | "all" | null }, from: string, to: string) =>
    request(app).get(`${api}/students?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}&from=${from}&to=${to}`).set(auth(token));
  const child = (res: request.Response, id: string) => (res.body.data.students as { id: string; name: string; records: { date: string; status: string; reason: string | null }[]; tally: Record<string, number | null> }[]).find((c) => c.id === id)!;
  return { s, take, students, child };
}

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => vi.restoreAllMocks());

describe("a class's students, for a range of days", () => {
  it("every child of the section with the marks of the days that were taken, the reasons, and the counts", async () => {
    const { s, take, students, child } = await setUp();
    await take(s.tokens.meena, "2026-11-03", [{ studentId: s.asha.id, status: "present" }, { studentId: s.kabir.id, status: "absent", reason: "Fever" }]);
    await take(s.tokens.meena, "2026-11-04", [{ studentId: s.asha.id, status: "late", reason: "Bus" }, { studentId: s.kabir.id, status: "present" }]);
    const res = await students(s.token, s.a, "2026-11-01", FRI);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ label: "Class 5 - A", from: "2026-11-01", to: FRI });
    expect(res.body.data.students.map((c: { name: string }) => c.name)).toEqual(["Asha Verma", "Kabir Rao"]);
    expect(child(res, s.asha.id).records).toEqual([
      { date: "2026-11-03", status: "present", reason: null },
      { date: "2026-11-04", status: "late", reason: "Bus" },
    ]);
    expect(child(res, s.kabir.id).records).toEqual([
      { date: "2026-11-03", status: "absent", reason: "Fever" },
      { date: "2026-11-04", status: "present", reason: null },
    ]);
    expect(child(res, s.asha.id).tally).toMatchObject({ present: 1, absent: 0, late: 1, leave: 0, days: 2, percent: 100 });
    expect(child(res, s.kabir.id).tally).toMatchObject({ present: 1, absent: 1, days: 2, percent: 50 });
  });

  it("the days of the range come with it: the days attendance was taken, the holidays; a day nobody took is just not taken", async () => {
    const { s, take, students } = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: "2026-11-02" });
    await take(s.tokens.meena, "2026-11-03", [{ studentId: s.asha.id, status: "present" }]);
    const res = await students(s.token, s.a, "2026-11-02", "2026-11-04");
    expect(res.body.data.days).toEqual([
      { date: "2026-11-02", weekday: 1, holiday: "Diwali", taken: false },
      { date: "2026-11-03", weekday: 2, holiday: null, taken: true },
      { date: "2026-11-04", weekday: 3, holiday: null, taken: false },
    ]);
  });

  it("the school's own totals for the class: how many children, the average, the absences and the late comings", async () => {
    const { s, take, students } = await setUp();
    await take(s.tokens.meena, "2026-11-03", [{ studentId: s.asha.id, status: "present" }, { studentId: s.kabir.id, status: "absent" }]);
    await take(s.tokens.meena, "2026-11-04", [{ studentId: s.asha.id, status: "late" }, { studentId: s.kabir.id, status: "absent" }]);
    const res = await students(s.token, s.a, "2026-11-01", FRI);
    expect(res.body.data.summary).toEqual({ students: 2, present: 1, absent: 2, late: 1, leave: 0, percent: 50 });
  });

  it("the whole class at once (every section), each child with the section they are in; a class with no sections as it is", async () => {
    const { s, take, students, child } = await setUp();
    await request(app).post(`/api/v1/academics/classes/${s.class5.id}/sections`).set(auth(s.token)).send({ name: "B" });
    await take(s.tokens.meena, THU, [{ studentId: s.asha.id, status: "absent", reason: "Wedding" }]);
    const all = await students(s.token, { classId: s.class5.id, sectionId: "all" }, THU, THU);
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(all.body.data.label).toBe("Class 5");
    expect(child(all, s.asha.id)).toMatchObject({ section: "A", records: [{ date: THU, status: "absent", reason: "Wedding" }] });
    const one = await students(s.token, s.one, THU, THU);
    expect(one.body.data.label).toBe("Class 1");
    expect(one.body.data.students.map((c: { name: string }) => c.name)).toEqual(["Mira Shah"]);
    // "all" on a class with no sections is just the class.
    expect((await students(s.token, { classId: s.class1.id, sectionId: "all" }, THU, THU)).body.data.students).toHaveLength(1);
  });

  it("one section of a class with sections: only its children", async () => {
    const { s, students } = await setUp();
    const b = (await request(app).post(`/api/v1/academics/classes/${s.class5.id}/sections`).set(auth(s.token)).send({ name: "B" })).body.data as { id: string };
    const res = await students(s.token, { classId: s.class5.id, sectionId: b.id }, THU, THU);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ label: "Class 5 - B", students: [] });
    expect((await students(s.token, s.a, THU, THU)).body.data.students).toHaveLength(2);
  });

  it("a day in the future is not in the range: it stops today", async () => {
    const { s, students } = await setUp();
    const res = await students(s.token, s.a, "2026-11-01", "2026-11-30");
    expect(res.body.data.to).toBe(FRI);
    expect(res.body.data.days).toHaveLength(6);
    expect((await students(s.token, s.a, "2026-11-20", "2026-11-30")).body.data.days).toEqual([]);
  });

  it("a child who came later has no marks before; a child who left is not in the list", async () => {
    const { s, take, students } = await setUp();
    await take(s.tokens.meena, THU, [{ studentId: s.asha.id, status: "present" }, { studentId: s.kabir.id, status: "present" }]);
    await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [s.kabir.id], reason: "Left" });
    const res = await students(s.token, s.a, THU, THU);
    expect(res.body.data.students.map((c: { name: string }) => c.name)).toEqual(["Asha Verma"]);
  });

  it("is for the people who run the school: the principal reads it; a teacher, a parent and a stranger cannot", async () => {
    const { s, students } = await setUp();
    expect((await students(await addColleague(s.tenantId, "principal"), s.a, THU, FRI)).status).toBe(200);
    expect((await students(s.tokens.meena, s.a, THU, FRI)).status).toBe(403);
    expect((await students(s.tokens.ravi, s.a, THU, FRI)).status).toBe(403);
    expect((await request(app).get(`${api}/students?classId=${s.a.classId}&from=${THU}&to=${FRI}`)).status).toBe(401);
  });

  it("a bad question is refused: no class, an unknown class, a range out of order, not real days, more than a year", async () => {
    const { s, students } = await setUp();
    expect((await request(app).get(`${api}/students?from=${THU}&to=${FRI}`).set(auth(s.token))).status).toBe(400);
    expect((await students(s.token, { classId: "64b64b64b64b64b64b64b64b", sectionId: "all" }, THU, FRI)).status).toBe(404);
    expect((await students(s.token, s.a, FRI, THU)).status).toBe(400);
    expect((await students(s.token, s.a, "2026-02-31", FRI)).status).toBe(400);
    expect((await students(s.token, s.a, "2025-01-01", FRI)).status).toBe(400);
    expect((await request(app).get(`${api}/students?classId=${s.a.classId}&sectionId=nope&from=${THU}&to=${FRI}`).set(auth(s.token))).status).toBe(400);
  });
});

describe("a child's history follows the child (2026-11-06)", () => {
  it("a child who moved to another class keeps the days that were taken in the first: the new class's list shows them", async () => {
    const { s, take, students, child } = await setUp();
    await take(s.tokens.meena, "2026-11-03", [{ studentId: s.asha.id, status: "absent", reason: "Fever" }, { studentId: s.kabir.id, status: "present" }]);
    const moved = await request(app).patch(`/api/v1/students/${s.asha.id}/enrolment`).set(auth(s.token)).send({ classId: s.class1.id, sectionId: null });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const res = await students(s.token, s.one, "2026-11-01", FRI);
    expect(child(res, s.asha.id).records).toEqual([{ date: "2026-11-03", status: "absent", reason: "Fever" }]);
    expect(child(res, s.asha.id).tally).toMatchObject({ absent: 1, days: 1, percent: 0 });
    // The old class no longer lists her.
    expect((await students(s.token, s.a, "2026-11-01", FRI)).body.data.students.map((c: { name: string }) => c.name)).toEqual(["Kabir Rao"]);
  });
});
