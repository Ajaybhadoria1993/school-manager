import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague } from "../../../test/schools";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";

/**
 * Giving a teacher a class from their page, with the days and periods (2026-11-13): one request gives the subject to the teacher AND puts its
 * periods in the class's timetable (`PUT /timetable/teacher-periods`). Everything is checked first; a refusal leaves the subject's teacher and
 * the timetable exactly as they were.
 */

const url = "/api/v1/timetable/teacher-periods";
const place = (token: string, body: object) => request(app).put(url).set(auth(token)).send(body);
const grid = (token: string, unit: { classId: string; sectionId: string | null }) => request(app).get(`/api/v1/timetable/grid?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}`).set(auth(token));
const putGrid = (token: string, unit: { classId: string; sectionId: string | null }, cells: object[]) => request(app).put("/api/v1/timetable/grid").set(auth(token)).send({ ...unit, cells });
const allotments = (token: string, unit: { classId: string; sectionId: string | null }) => request(app).get(`/api/v1/subjects/allotments?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}`).set(auth(token));
const details = (res: request.Response) => res.body.details as { path: string; message: string; code?: string }[];
const cell = (day: number, period: number, subjectId: string) => ({ day, period, lessons: [{ subjectId }] });
type Cell = { day: number; period: number; lessons: { subjectId: string; teacherId: string | null }[] };
const slotsOf = (res: request.Response, subjectId: string) =>
  (res.body.data.cells as Cell[]).filter((c) => c.lessons.some((l) => l.subjectId === subjectId)).map((c) => `${c.day}:${c.period}`);
const teacherOf = async (token: string, unit: { classId: string; sectionId: string | null }, subjectId: string) =>
  ((await allotments(token, unit)).body.data.rows as { subjectId: string; teacherId: string | null }[]).find((r) => r.subjectId === subjectId)?.teacherId ?? null;

/** Class 5 (sections A and B) studying Maths (6 a week, Meena), English (5, Dev) and Hindi (5, nobody yet); the usual day Monday to Friday. */
async function ready() {
  const s = await timetableSchool();
  const class5 = await addClass(s.token, "Class 5", ["A", "B"]);
  await addTiming(s.token);
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const hindi = await addSubject(s.token, "Hindi");
  const art = await addSubject(s.token, "Art");
  const meena = await addTeacher(s.token, "Meena Singh", { mobile: "9000000001" });
  const dev = await addTeacher(s.token, "Dev Patel", { mobile: "9000000002" });
  const kiran = await addTeacher(s.token, "Kiran Rao", { mobile: "9000000003", offDays: [3] });
  const a = { classId: class5.id, sectionId: class5.sections[0].id };
  const b = { classId: class5.id, sectionId: class5.sections[1].id };
  const rows = [
    { subjectId: maths, periodsPerWeek: 6, teacherId: meena },
    { subjectId: english, periodsPerWeek: 5, teacherId: dev },
    { subjectId: hindi, periodsPerWeek: 5 },
  ];
  await saveAllotments(s.token, a, rows);
  await saveAllotments(s.token, b, rows);
  return { ...s, a, b, maths, english, hindi, art, meena, dev, kiran };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a teacher given a subject and its periods in one request", () => {
  it("gives the subject to the teacher and puts its periods in the class's timetable together; the answer is the class's timetable", async () => {
    const r = await ready();
    const res = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [1, 2, 3, 4, 5].map((day) => ({ day, period: 3 })) });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(slotsOf(res, r.hindi)).toEqual(["1:3", "2:3", "3:3", "4:3", "5:3"]);
    expect(await teacherOf(r.token, r.a, r.hindi)).toBe(r.meena);
    // The lessons follow the subject's teacher (they name nobody of their own), so the teacher's week has them.
    const week = await request(app).get(`/api/v1/timetable/teachers/${r.meena}`).set(auth(r.token));
    expect((week.body.data.lessons as { subjectName: string; day: number; period: number }[]).filter((l) => l.subjectName === "Hindi").map((l) => `${l.day}:${l.period}`)).toEqual(["1:3", "2:3", "3:3", "4:3", "5:3"]);
    // The other section was not touched.
    expect(await teacherOf(r.token, r.b, r.hindi)).toBeNull();
  });

  it("adds to the periods already in the timetable: what is there stays, a period that already has the subject is not an error", async () => {
    const r = await ready();
    await putGrid(r.token, r.a, [cell(1, 1, r.hindi), cell(2, 1, r.maths)]);
    const res = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 1, period: 1 }, { day: 3, period: 1 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(slotsOf(res, r.hindi)).toEqual(["1:1", "3:1"]);
    expect(slotsOf(res, r.maths)).toEqual(["2:1"]);
  });

  it("a subject the class does not study yet is added with its periods a week (what the days say when none is given)", async () => {
    const r = await ready();
    const res = await place(r.token, { ...r.a, subjectId: r.art, teacherId: r.meena, periodsPerWeek: 3, slots: [{ day: 1, period: 8 }, { day: 3, period: 8 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(slotsOf(res, r.art)).toEqual(["1:8", "3:8"]);
    const art = ((await allotments(r.token, r.a)).body.data.rows as { subjectId: string; periodsPerWeek: number; teacherId: string | null }[]).find((x) => x.subjectId === r.art)!;
    expect(art).toMatchObject({ periodsPerWeek: 3, teacherId: r.meena });

    const none = await place(r.token, { ...r.b, subjectId: r.art, teacherId: r.dev, slots: [{ day: 2, period: 8 }, { day: 4, period: 8 }] });
    expect(none.status, JSON.stringify(none.body)).toBe(200);
    const art2 = ((await allotments(r.token, r.b)).body.data.rows as { subjectId: string; periodsPerWeek: number }[]).find((x) => x.subjectId === r.art)!;
    expect(art2.periodsPerWeek).toBe(2);
  });

  it("refuses a period the class already uses for another subject, and changes nothing", async () => {
    const r = await ready();
    await putGrid(r.token, r.a, [cell(1, 3, r.maths)]);
    const res = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 2, period: 3 }, { day: 1, period: 3 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PERIOD_TAKEN");
    expect(details(res)[0]).toMatchObject({ path: "slots", message: "Monday period 3 already has Mathematics" });
    expect(await teacherOf(r.token, r.a, r.hindi)).toBeNull();
    expect(slotsOf(await grid(r.token, r.a), r.hindi)).toEqual([]);
  });

  it("refuses a teacher who is teaching another class at that time, and the subject keeps its teacher", async () => {
    const r = await ready();
    await putGrid(r.token, r.b, [cell(1, 3, r.maths)]);
    const res = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 1, period: 3 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TIMETABLE_CLASHES");
    expect(res.body.message).toContain("Meena Singh is teaching Class 5 - B");
    expect(await teacherOf(r.token, r.a, r.hindi)).toBeNull();
    expect(slotsOf(await grid(r.token, r.a), r.hindi)).toEqual([]);
  });

  it("refuses a day the teacher does not come", async () => {
    const r = await ready();
    const res = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.kiran, slots: [{ day: 3, period: 2 }] });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Kiran Rao does not come on Wednesday");
    expect(await teacherOf(r.token, r.a, r.hindi)).toBeNull();
  });

  it("refuses a period the class does not have", async () => {
    const r = await ready();
    const res = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 1, period: 9 }] });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Monday has no period 9");
    expect(await teacherOf(r.token, r.a, r.hindi)).toBeNull();
  });

  it("refuses more periods than the subject has a week (the ones in the timetable already count)", async () => {
    const r = await ready();
    await putGrid(r.token, r.a, [1, 2, 3, 4].map((d) => cell(d, 1, r.hindi)));
    const res = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 5, period: 1 }, { day: 1, period: 2 }] });
    expect(res.status).toBe(400);
    expect(details(res)[0]).toMatchObject({ path: "slots", message: "Hindi has 5 periods a week and 4 are in the timetable already: 1 more can be placed" });
    expect(await teacherOf(r.token, r.a, r.hindi)).toBeNull();
  });

  it("a subject new to the class needs its periods a week or the days", async () => {
    const r = await ready();
    const res = await place(r.token, { ...r.a, subjectId: r.art, teacherId: r.meena, slots: [] });
    expect(res.status).toBe(400);
    expect(details(res).map((d) => d.path)).toContain("periodsPerWeek");
  });

  it("a teacher who left, or one of another school, is refused with the box named", async () => {
    const r = await ready();
    // (A teacher who has classes cannot leave before they are handed over, so it is the one with none.)
    expect((await request(app).patch(`/api/v1/staff/teachers/${r.kiran}`).set(auth(r.token)).send({ isActive: false })).status).toBe(200);
    const left = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.kiran, slots: [{ day: 1, period: 1 }] });
    expect(left.status).toBe(400);
    expect(details(left)[0]).toMatchObject({ path: "teacherId", message: "Kiran Rao is no longer teaching here" });

    const other = await timetableSchool("Moonrise Public School");
    const stranger = await addTeacher(other.token, "Outsider", { mobile: "9000000009" });
    const foreign = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: stranger, slots: [{ day: 1, period: 1 }] });
    expect(foreign.status).toBe(400);
    expect(details(foreign)[0].path).toBe("teacherId");
  });

  it("the days are checked as a request: a day or period out of range, the same period twice, too many", async () => {
    const r = await ready();
    expect((await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 8, period: 1 }] })).status).toBe(400);
    expect((await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 1, period: 0 }] })).status).toBe(400);
    const twice = await place(r.token, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 1, period: 1 }, { day: 1, period: 1 }] });
    expect(twice.status).toBe(400);
    expect(details(twice)[0].message).toBe("Monday period 1 is in the list twice");
  });

  it("only a person who may change the timetable can use it: a teacher, and nobody signed in, cannot", async () => {
    const r = await ready();
    const teacher = await addColleague(r.tenantId, "teacher");
    expect((await request(app).put(url).send({})).status).toBe(401);
    expect((await place(teacher, { ...r.a, subjectId: r.hindi, teacherId: r.meena, slots: [{ day: 1, period: 1 }] })).status).toBe(403);
    expect(await teacherOf(r.token, r.a, r.hindi)).toBeNull();
  });
});
