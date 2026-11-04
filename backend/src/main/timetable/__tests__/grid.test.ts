import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague } from "../../../test/schools";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { BellSchedule } from "../models/BellSchedule";
import { Timetable } from "../models/Timetable";

const api = "/api/v1/timetable/grid";
const get = (token: string, classId: string, sectionId: string | null) => request(app).get(`${api}?classId=${classId}&sectionId=${sectionId ?? "none"}`).set(auth(token));
const put = (token: string, unit: { classId: string; sectionId: string | null }, cells: object[]) => request(app).put(api).set(auth(token)).send({ ...unit, cells });
const post = (token: string, path: string, body: object) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string; code?: string }[];
const lesson = (subjectId: string, over: object = {}) => ({ subjectId, ...over });
const cell = (day: number, period: number, ...lessons: object[]) => ({ day, period, lessons });
const codes = (res: request.Response) => (res.body.data.issues as { code: string; level: string }[]).map((i) => i.code);

/**
 * A school with the usual day Monday to Friday (8 periods, lunch after the third), Class 5 with sections A and B, Class 1 without
 * sections, and what 5-A and 5-B study: Maths (6 a week, Meena), English (5, Dev) and Hindi (5, nobody yet).
 */
async function ready() {
  const s = await timetableSchool();
  const class5 = await addClass(s.token, "Class 5", ["A", "B"]);
  const class1 = await addClass(s.token, "Class 1");
  await addTiming(s.token);
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const hindi = await addSubject(s.token, "Hindi");
  const meena = await addTeacher(s.token, "Meena Singh");
  const dev = await addTeacher(s.token, "Dev Patel");
  const a = { classId: class5.id, sectionId: class5.sections[0].id };
  const b = { classId: class5.id, sectionId: class5.sections[1].id };
  const one = { classId: class1.id, sectionId: null };
  const rows = [
    { subjectId: maths, periodsPerWeek: 6, teacherId: meena },
    { subjectId: english, periodsPerWeek: 5, teacherId: dev },
    { subjectId: hindi, periodsPerWeek: 5 },
  ];
  await saveAllotments(s.token, a, rows);
  await saveAllotments(s.token, b, rows);
  await saveAllotments(s.token, one, rows);
  return { ...s, a, b, one, maths, english, hindi, meena, dev };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a class's timetable: who may see and change it", () => {
  it("needs a signed-in user; a teacher sees only what is published; the accountant sees nothing; a teacher cannot change it", async () => {
    const r = await ready();
    expect((await request(app).get(`${api}?classId=${r.a.classId}&sectionId=${r.a.sectionId}`)).status).toBe(401);
    const teacher = await addColleague(r.tenantId, "teacher");
    const accountant = await addColleague(r.tenantId, "accountant");
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);

    const draft = await get(teacher, r.a.classId, r.a.sectionId);
    expect(draft.status).toBe(404);
    expect(draft.body.code).toBe("TIMETABLE_NOT_PUBLISHED");
    await post(r.token, "/publish", r.a);
    expect((await get(teacher, r.a.classId, r.a.sectionId)).status).toBe(200);

    expect((await get(accountant, r.a.classId, r.a.sectionId)).status).toBe(403);
    expect((await put(teacher, r.a, [])).status).toBe(403);
    expect((await post(teacher, "/publish", r.a)).status).toBe(403);
  });

  it("lets the principal make and publish it as well as the school admin", async () => {
    const r = await ready();
    const principal = await addColleague(r.tenantId, "principal");
    expect((await put(principal, r.a, [cell(1, 1, lesson(r.maths))])).status).toBe(200);
    expect((await post(principal, "/publish", r.a)).status).toBe(200);
  });
});

describe("the empty grid", () => {
  it("shows the days the class has school, each day's rows with their times, what is studied and who may teach", async () => {
    const r = await ready();
    const res = await get(r.token, r.a.classId, r.a.sectionId);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ exists: false, status: "draft", cells: [], publishedAt: null, updatedAt: null });
    expect(d.unit).toMatchObject({ label: "Class 5 - A", academicYear: { name: "2026-2027" } });
    expect(d.days.map((x: { name: string }) => x.name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(d.days[0].slots[3]).toEqual({ kind: "lunch", label: "Lunch", start: "10:30", end: "11:00", period: null });
    expect(d.days[0].slots[4]).toEqual({ kind: "period", label: "Period 4", start: "11:00", end: "11:40", period: 4 });
    expect(d.allotments.map((a: { subjectName: string; periodsPerWeek: number }) => `${a.subjectName} ${a.periodsPerWeek}`)).toEqual(["Mathematics 6", "English 5", "Hindi 5"]);
    expect(d.teachers.map((t: { name: string }) => t.name)).toEqual(["Dev Patel", "Meena Singh"]);
    expect(d.stats).toEqual({ total: 40, filled: 0, free: 40, placed: {} });
    // Nothing is placed, so each subject is short of its periods.
    expect(codes(res)).toEqual(["TOO_FEW", "TOO_FEW", "TOO_FEW"]);
  });

  it("is the class's own for a class without sections", async () => {
    const r = await ready();
    const res = await get(r.token, r.one.classId, null);
    expect(res.status).toBe(200);
    expect(res.body.data.unit).toMatchObject({ label: "Class 1", sectionId: null });
  });

  it("says the school has no timing when it has none, and is a 404 for a class that is not its", async () => {
    const s = await timetableSchool();
    const klass = await addClass(s.token, "Class 5", ["A"]);
    const empty = await get(s.token, klass.id, klass.sections[0].id);
    expect(empty.status).toBe(200);
    expect(empty.body.data.days).toEqual([]);
    const save = await put(s.token, { classId: klass.id, sectionId: klass.sections[0].id }, [cell(1, 1, lesson(new Types.ObjectId().toString()))]);
    expect(save.status).toBe(409);
    expect(save.body.code).toBe("NO_TIMING");
    expect((await get(s.token, new Types.ObjectId().toString(), null)).status).toBe(404);
  });
});

describe("saving a timetable", () => {
  it("keeps the lessons in order of day and period, and reads them back with the counts and the stamps", async () => {
    const r = await ready();
    const res = await put(r.token, r.a, [cell(2, 1, lesson(r.english)), cell(1, 2, lesson(r.maths)), cell(1, 1, lesson(r.english))]);
    expect(res.status).toBe(200);
    expect(res.body.data.cells.map((c: { day: number; period: number }) => `${c.day}.${c.period}`)).toEqual(["1.1", "1.2", "2.1"]);
    expect(res.body.data).toMatchObject({ exists: true, status: "draft", stats: { filled: 3, free: 37 } });
    expect(res.body.data.stats.placed).toEqual({ [r.english]: 2, [r.maths]: 1 });
    expect(res.body.data.updatedAt).toEqual(expect.any(String));
    expect((await get(r.token, r.a.classId, r.a.sectionId)).body.data.cells).toHaveLength(3);
  });

  it("replaces the whole grid each time, and an empty one clears it", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(1, 2, lesson(r.maths))]);
    const second = await put(r.token, r.a, [cell(3, 1, lesson(r.english))]);
    expect(second.body.data.cells).toHaveLength(1);
    const cleared = await put(r.token, r.a, []);
    expect(cleared.body.data.cells).toEqual([]);
    expect(await Timetable.countDocuments({ tenantId: r.tenantId })).toBe(1);
  });

  it("keeps a timetable of the same class's other section, and of a class without sections, apart", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    expect((await put(r.token, r.one, [cell(2, 1, lesson(r.maths))])).status).toBe(200);
    expect((await get(r.token, r.b.classId, r.b.sectionId)).body.data.cells).toEqual([]);
    expect(await Timetable.countDocuments({ tenantId: r.tenantId })).toBe(2);
  });

  it("does not keep a teacher's name on a lesson when it is the one the class's subject list names, so a later change of teacher follows", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths, { teacherId: r.meena })), cell(1, 2, lesson(r.maths, { teacherId: r.dev }))]);
    const stored = await Timetable.findOne({ tenantId: r.tenantId }).lean();
    expect(stored!.cells.map((c) => c.lessons[0].teacherId?.toString() ?? null)).toEqual([null, r.dev]);
  });

  it("refuses a period the class does not have, a day it has no school and a period given twice", async () => {
    const r = await ready();
    const res = await put(r.token, r.a, [cell(1, 9, lesson(r.maths)), cell(6, 1, lesson(r.maths)), cell(1, 1, lesson(r.maths)), cell(1, 1, lesson(r.english))]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TIMETABLE_CLASHES");
    expect(res.body.message).toBe("Monday period 1 is given twice (and 2 more)");
    expect(details(res).map((d) => `${d.path} ${d.code}`)).toEqual(["d1p1 CELL_TWICE", "d1p9 CELL_OUTSIDE", "d6p1 CELL_OUTSIDE"]);
    // Nothing was kept.
    expect(await Timetable.countDocuments({ tenantId: r.tenantId })).toBe(0);
  });

  it("says what is wrong with a lesson's boxes before looking at the school's rules", async () => {
    const r = await ready();
    const bad = await put(r.token, r.a, [{ day: 0, period: 0, lessons: [] }, { day: 1, period: 1, lessons: [{ subjectId: "nope" }] }]);
    expect(bad.status).toBe(400);
    expect(details(bad).map((d) => d.path)).toEqual(["cells.0.day", "cells.0.period", "cells.0.lessons", "cells.1.lessons.0.subjectId"]);
  });

  it("only takes a section of the class, and the class itself only when it has no sections", async () => {
    const r = await ready();
    expect((await put(r.token, { classId: r.a.classId, sectionId: null }, [])).status).toBe(409);
    const other = await addClass(r.token, "Class 6", ["A"]);
    expect((await put(r.token, { classId: r.a.classId, sectionId: other.sections[0].id }, [])).status).toBe(404);
  });
});

describe("teachers in the timetable", () => {
  it("cannot be in two classes at the same moment: the second timetable is refused, naming the class, and what is kept stays", async () => {
    const r = await ready();
    expect((await put(r.token, r.a, [cell(1, 1, lesson(r.maths))])).status).toBe(200);
    const clash = await put(r.token, r.b, [cell(1, 1, lesson(r.maths))]);
    expect(clash.status).toBe(409);
    expect(clash.body.message).toBe("Meena Singh is teaching Class 5 - A (Mathematics) at the same time");
    expect(details(clash)).toEqual([{ path: "d1p1", message: "Meena Singh is teaching Class 5 - A (Mathematics) at the same time", code: "TEACHER_BUSY" }]);
    // Another period, or another teacher, is fine.
    expect((await put(r.token, r.b, [cell(1, 2, lesson(r.maths))])).status).toBe(200);
    expect((await put(r.token, r.b, [cell(1, 1, lesson(r.maths, { teacherId: r.dev }))])).status).toBe(200);
  });

  it("is told a teacher is busy elsewhere before saving: the grid lists them by period, and what they already have in the week", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(1, 2, lesson(r.english))]);
    const view = (await get(r.token, r.b.classId, r.b.sectionId)).body.data;
    expect(view.busy).toEqual([
      { day: 1, period: 1, teacherId: r.meena, room: null, where: "Class 5 - A", subjectName: "Mathematics" },
      { day: 1, period: 2, teacherId: r.dev, room: null, where: "Class 5 - A", subjectName: "English" },
    ]);
    expect(view.load).toEqual([
      { teacherId: r.meena, perDay: { "1": 1 }, week: 1 },
      { teacherId: r.dev, perDay: { "1": 1 }, week: 1 },
    ]);
  });

  it("is busy by the clock: a class on another timing clashes where its period overlaps, not where the number matches", async () => {
    const r = await ready();
    // Class 1 starts at 08:45 with periods of 40 minutes: its period 1 (08:45-09:25) overlaps 5-A's periods 1 and 2.
    await addTiming(r.token, { name: "Primary", scope: "only", classIds: [r.one.classId], days: [1, 2, 3, 4, 5], slots: [{ kind: "period", start: "08:45", end: "09:25" }, { kind: "period", start: "09:25", end: "10:05" }] });
    await put(r.token, r.a, [cell(1, 2, lesson(r.maths))]);
    const clash = await put(r.token, r.one, [cell(1, 1, lesson(r.maths, { teacherId: r.meena }))]);
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain("Meena Singh is teaching Class 5 - A (Mathematics) at the same time");
    // Class 1's period 2 (09:25-10:05) overlaps 5-A's period 3 (09:50-10:30) but not period 2 (09:10-09:50) ... it does overlap 09:25-09:50.
    expect((await put(r.token, r.one, [cell(1, 2, lesson(r.maths, { teacherId: r.meena }))])).status).toBe(409);
  });

  it("must come on that day (a part-time teacher's days off) and must still be teaching here", async () => {
    const r = await ready();
    await request(app).patch(`/api/v1/staff/teachers/${r.meena}`).set(auth(r.token)).send({ offDays: [1] });
    const off = await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(2, 1, lesson(r.maths))]);
    expect(off.status).toBe(409);
    expect(details(off)).toEqual([{ path: "d1p1", message: "Meena Singh does not come on Monday", code: "TEACHER_OFF" }]);

    const left = await addTeacher(r.token, "Anil Rao");
    await request(app).patch(`/api/v1/staff/teachers/${left}`).set(auth(r.token)).send({ isActive: false });
    const gone = await put(r.token, r.a, [cell(2, 1, lesson(r.hindi, { teacherId: left }))]);
    expect(details(gone)).toEqual([{ path: "d2p1", message: "Anil Rao is no longer teaching here", code: "TEACHER_GONE" }]);
  });

  it("a teacher over their daily or weekly limit is a warning, not a refusal", async () => {
    const r = await ready();
    await request(app).patch(`/api/v1/staff/teachers/${r.meena}`).set(auth(r.token)).send({ maxPeriodsPerDay: 1 });
    const res = await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(1, 3, lesson(r.maths))]);
    expect(res.status).toBe(200);
    expect(res.body.data.issues.find((i: { code: string }) => i.code === "TEACHER_DAY_FULL").message).toBe("Meena Singh has 2 periods on Monday: the most is 1");
  });
});

describe("rooms, choices and double periods", () => {
  it("a room is for one class at a time", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.hindi, { room: "Computer Lab" }))]);
    const clash = await put(r.token, r.b, [cell(1, 1, lesson(r.english, { room: "computer  lab" }))]);
    expect(clash.status).toBe(409);
    expect(details(clash)[0]).toMatchObject({ path: "d1p1", code: "ROOM_BUSY" });
  });

  it("subjects of a choice share a period, each with its own teacher; others cannot", async () => {
    const s = await timetableSchool();
    const klass = await addClass(s.token, "Class 9", ["A"]);
    await addTiming(s.token);
    const sanskrit = await addSubject(s.token, "Sanskrit");
    const french = await addSubject(s.token, "French");
    const maths = await addSubject(s.token, "Mathematics");
    const t1 = await addTeacher(s.token, "Meena Singh");
    const t2 = await addTeacher(s.token, "Dev Patel");
    const unit = { classId: klass.id, sectionId: klass.sections[0].id };
    await saveAllotments(s.token, unit, [
      { subjectId: sanskrit, periodsPerWeek: 4, group: "Third language", teacherId: t1 },
      { subjectId: french, periodsPerWeek: 4, group: "Third language", teacherId: t2 },
      { subjectId: maths, periodsPerWeek: 6, teacherId: t2 },
    ]);
    const ok = await put(s.token, unit, [cell(1, 1, lesson(sanskrit), lesson(french)), cell(2, 1, lesson(sanskrit), lesson(french))]);
    expect(ok.status).toBe(200);
    expect(ok.body.data.stats.placed).toEqual({ [sanskrit]: 2, [french]: 2 });
    const bad = await put(s.token, unit, [cell(1, 1, lesson(sanskrit), lesson(maths))]);
    expect(bad.status).toBe(409);
    expect(details(bad)).toEqual([{ path: "d1p1", message: "Only the subjects of one choice can share a period", code: "NOT_A_CHOICE" }]);
  });

  it("warns when a subject given in blocks is not in a block, and when a subject is in two periods in a row", async () => {
    const r = await ready();
    await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 4, blockSize: 2, teacherId: r.meena }, { subjectId: r.english, periodsPerWeek: 5, teacherId: r.dev }]);
    const res = await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(2, 1, lesson(r.maths)), cell(3, 1, lesson(r.english)), cell(3, 2, lesson(r.english))]);
    expect(res.status).toBe(200);
    expect(codes(res)).toEqual(expect.arrayContaining(["BLOCK_BROKEN", "BACK_TO_BACK", "TOO_FEW"]));
  });
});

describe("publishing", () => {
  it("makes a draft published (with who and when), and takes it back", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    const published = await post(r.token, "/publish", r.a);
    expect(published.status).toBe(200);
    expect(published.body.data).toMatchObject({ status: "published", publishedAt: expect.any(String) });
    const back = await post(r.token, "/unpublish", r.a);
    expect(back.body.data).toMatchObject({ status: "draft", publishedAt: null });
  });

  it("a published timetable stays published when it is changed (live at once), and keeps its stamp", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    const first = (await post(r.token, "/publish", r.a)).body.data.publishedAt;
    const changed = await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(2, 1, lesson(r.english))]);
    expect(changed.body.data).toMatchObject({ status: "published", publishedAt: first });
  });

  it("is refused for a timetable with no lessons, and for one that has never been saved", async () => {
    const r = await ready();
    const none = await post(r.token, "/publish", r.a);
    expect(none.status).toBe(409);
    expect(none.body.code).toBe("TIMETABLE_EMPTY");
    await put(r.token, r.a, []);
    expect((await post(r.token, "/publish", r.a)).status).toBe(409);
  });

  it("is refused when a clash has come up since it was saved (the timing lost a period)", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 8, lesson(r.maths))]);
    // Shorten the day to 7 periods straight in the database (the API refuses it while lessons use the period).
    const timing = (await BellSchedule.findOne({ tenantId: r.tenantId }))!;
    await BellSchedule.updateOne({ _id: timing._id, tenantId: r.tenantId }, { $set: { slots: timing.slots.slice(0, 8) } });
    const res = await post(r.token, "/publish", r.a);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TIMETABLE_CLASHES");
    expect(details(res)[0]).toMatchObject({ path: "d1p8", code: "CELL_OUTSIDE" });
  });
});
