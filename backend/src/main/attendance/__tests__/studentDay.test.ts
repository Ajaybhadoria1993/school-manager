import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { todayInIndia } from "../../students/schemas/students.schemas";

/**
 * Attendance > Student for the school, ONE day of EVERY class (2026-11-22, asked for: "saari class ke saare students dikhe, class upar, niche bacche;
 * search karun to har class ke bacche aa jayen; filter se ek class"): `GET /api/v1/attendance/students/day?date=&classId=&sectionId=&search=`.
 * The classes in teaching order, each with its children and their marks of the day; a class picked is only that class; a search finds children of
 * every class, each under their class, and leaves out a class with nobody found. A class's own numbers (and the summary's) never shrink to a search.
 */

const today = todayInIndia();
const day = (token: string, query: Record<string, string> = {}) => request(app).get("/api/v1/attendance/students/day").query({ date: today, ...query }).set(auth(token));
const save = (token: string, unit: { classId: string; sectionId: string | null }, marks: object[]) =>
  request(app).put("/api/v1/classroom/attendance").set(auth(token)).send({ ...unit, date: today, marks });
type Group = { classId: string; sectionId: string | null; label: string; total: number; saved: boolean; classTeacher: { name: string } | null; counts: Record<string, number>; students: { name: string; status: string; position: number; reason: string | null }[] };
const labels = (groups: Group[]) => groups.map((g) => [g.label, g.students.map((s) => s.name)]);

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the day of every class", () => {
  it("with no class picked: every class in teaching order, each with its children (roll, then name), its class teacher and whether its day was taken", async () => {
    const s = await classroomSchool();
    const res = await day(s.token);
    expect(res.status).toBe(200);
    const groups: Group[] = res.body.data.groups;
    expect(labels(groups)).toEqual([
      ["Class 1", ["Mira Shah"]],
      // Class 5 has one section: it is just "Class 5".
      ["Class 5", ["Asha Verma", "Kabir Rao"]],
    ]);
    expect(groups[1]).toMatchObject({ classId: s.a.classId, sectionId: s.a.sectionId, total: 2, saved: false, classTeacher: { name: "Meena Singh" } });
    expect(groups[0]).toMatchObject({ classId: s.one.classId, sectionId: null, total: 1, saved: false, classTeacher: null });
    expect(groups[1].students.map((c) => c.position)).toEqual([1, 2]);
    expect(res.body.data).toMatchObject({ date: today, holiday: null });
  });

  it("a class whose day was taken has its marks and reasons; the summary is of the whole school, counting only the classes that were taken", async () => {
    const s = await classroomSchool();
    await save(s.tokens.meena, s.a, [
      { studentId: s.asha.id, status: "present" },
      { studentId: s.kabir.id, status: "absent", reason: "Fever" },
    ]);
    const { groups, summary } = (await day(s.token)).body.data as { groups: Group[]; summary: object };
    expect(groups[1].saved).toBe(true);
    expect(groups[1].students.map((c) => [c.name, c.status, c.reason])).toEqual([
      ["Asha Verma", "present", null],
      ["Kabir Rao", "absent", "Fever"],
    ]);
    expect(groups[1].counts).toEqual({ present: 1, absent: 1, late: 0, leave: 0 });
    expect(groups[0].saved).toBe(false);
    expect(summary).toEqual({ students: 3, classes: 2, taken: 1, counts: { present: 1, absent: 1, late: 0, leave: 0 } });
  });

  it("a child on an approved leave that day is Leave in a class nobody took (as on one class's sheet)", async () => {
    const s = await classroomSchool();
    const leave = (await request(app).post(`/api/v1/parent/children/${s.kabir.id}/leaves`).set(auth(s.tokens.sita)).send({ fromDate: today, reason: "Fever" })).body.data;
    await request(app).post(`/api/v1/classroom/leaves/${leave.id}/decide`).set(auth(s.tokens.meena)).send({ status: "approved" });
    const groups: Group[] = (await day(s.token)).body.data.groups;
    expect(groups[1].students.find((c) => c.name === "Kabir Rao")?.status).toBe("leave");
  });

  it("a holiday says so", async () => {
    const s = await classroomSchool();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: today });
    expect((await day(s.token)).body.data.holiday).toEqual({ title: "Diwali" });
  });
});

describe("the search: children of every class, each under their class", () => {
  it("finds the words (any case) in the names and admission numbers of every class; a class with nobody found is left out", async () => {
    const s = await classroomSchool();
    // "sha": Mira SHAh in Class 1, aSHA Verma in Class 5.
    expect(labels((await day(s.token, { search: " SHA " })).body.data.groups)).toEqual([
      ["Class 1", ["Mira Shah"]],
      ["Class 5", ["Asha Verma"]],
    ]);
    expect(labels((await day(s.token, { search: s.kabir.admissionNumber.toLowerCase() })).body.data.groups)).toEqual([["Class 5", ["Kabir Rao"]]]);
    // Plain text, not a pattern.
    expect((await day(s.token, { search: "a(.*[" })).body.data.groups).toEqual([]);
  });

  it("a class's own numbers and the summary stay whole: a child found keeps the place in the class", async () => {
    const s = await classroomSchool();
    await save(s.tokens.meena, s.a, [
      { studentId: s.asha.id, status: "present" },
      { studentId: s.kabir.id, status: "late" },
    ]);
    const { groups, summary } = (await day(s.token, { search: "kabir" })).body.data as { groups: Group[]; summary: { students: number; counts: object } };
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: "Class 5", total: 2, counts: { present: 1, absent: 0, late: 1, leave: 0 } });
    expect(groups[0].students[0]).toMatchObject({ name: "Kabir Rao", position: 2 });
    expect(summary).toMatchObject({ students: 3, counts: { present: 1, absent: 0, late: 1, leave: 0 } });
    const none = (await day(s.token, { search: "zzz" })).body.data;
    expect(none.groups).toEqual([]);
    expect(none.summary.students).toBe(3);
  });

  it("a search over 60 letters, or a day that is not a day, is refused", async () => {
    const s = await classroomSchool();
    expect((await day(s.token, { search: "a".repeat(61) })).status).toBe(400);
    expect((await day(s.token, { date: "22-11-2026" })).status).toBe(400);
  });
});

describe("a class (or a section) picked", () => {
  it("is only that class; a section picked is only that section; the search works inside it", async () => {
    const s = await classroomSchool();
    expect(labels((await day(s.token, { classId: s.one.classId })).body.data.groups)).toEqual([["Class 1", ["Mira Shah"]]]);
    expect(labels((await day(s.token, { classId: s.a.classId, sectionId: s.a.sectionId! })).body.data.groups)).toEqual([["Class 5", ["Asha Verma", "Kabir Rao"]]]);
    expect(labels((await day(s.token, { classId: s.a.classId, search: "asha" })).body.data.groups)).toEqual([["Class 5", ["Asha Verma"]]]);
    // The summary is of what was picked.
    expect((await day(s.token, { classId: s.one.classId })).body.data.summary).toMatchObject({ students: 1, classes: 1 });
  });

  it("a class or section that is not this school's is not found, and one school never sees another's children", async () => {
    const s = await classroomSchool();
    const other = await classroomSchool("Moonlight Public School", "moon.");
    const foreign = await day(other.token, { classId: s.a.classId });
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("CLASS_NOT_FOUND");
    expect((await day(other.token, { classId: other.a.classId, sectionId: s.a.sectionId! })).status).toBe(404);
    const own: Group[] = (await day(other.token)).body.data.groups;
    expect(own.flatMap((g) => [g.classId, ...g.students.map((c) => c.name)])).not.toContain(s.a.classId);
    expect(own.map((g) => g.classId).sort()).toEqual([other.one.classId, other.a.classId].sort());
  });
});

describe("who may look", () => {
  it("the people who run the school; a teacher is held to their own class's sheet, a parent never", async () => {
    const s = await classroomSchool();
    expect((await day(s.tokens.admin)).status).toBe(200);
    expect((await day(s.tokens.meena)).status).toBe(403);
    expect((await day(s.tokens.ravi)).status).toBe(403);
  });
});
