import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addClass, addSubject, addTeacher, addTiming, auth, REGULAR_DAY, saveAllotments, timetableSchool } from "../../../test/timetable";
import { Timetable } from "../models/Timetable";

/**
 * One teacher, two classes, the same time (2026-11-18, user: "ek teacher ek class mein padha raha hai, usi ko doosri class mein same time par
 * assign karun to kya hoga? har scenario cover karo"). The rule is: nobody is in two places at the same moment, by the CLOCK, whichever way
 * the lesson got there. These scenarios go through every door that can put a teacher in a period, and through what can change under a timetable
 * that is already made (a timing, a day off), and through two people saving at the same moment (there are no transactions).
 */

const base = "/api/v1/timetable";
const grid = `${base}/grid`;
type Unit = { classId: string; sectionId: string | null };
const get = (token: string, unit: Unit) => request(app).get(`${grid}?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}`).set(auth(token));
const put = (token: string, unit: Unit, cells: object[]) => request(app).put(grid).set(auth(token)).send({ ...unit, cells });
const post = (token: string, path: string, body: object) => request(app).post(`${base}${path}`).set(auth(token)).send(body);
const lesson = (subjectId: string, over: object = {}) => ({ subjectId, ...over });
const cell = (day: number, period: number, ...lessons: object[]) => ({ day, period, lessons });
const codesOf = (res: request.Response) => ((res.body.details ?? []) as { code?: string }[]).map((d) => d.code);
const savedCells = async (token: string, unit: Unit) => (await get(token, unit)).body.data.cells as { day: number; period: number }[];

/** Class 5 (sections A and B), Class 1 (no sections), the usual day Monday to Friday, and Maths (Meena) / English (Dev) / Hindi (nobody) in each. */
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
  const asha = await addTeacher(s.token, "Asha Rao");
  const a: Unit = { classId: class5.id, sectionId: class5.sections[0].id };
  const b: Unit = { classId: class5.id, sectionId: class5.sections[1].id };
  const one: Unit = { classId: class1.id, sectionId: null };
  const rows = [
    { subjectId: maths, periodsPerWeek: 6, teacherId: meena },
    { subjectId: english, periodsPerWeek: 5, teacherId: dev },
    { subjectId: hindi, periodsPerWeek: 5 },
  ];
  for (const unit of [a, b, one]) await saveAllotments(s.token, unit, rows);
  return { ...s, class5, class1, a, b, one, maths, english, hindi, meena, dev, asha };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the question: the same teacher in a second class at the same time", () => {
  it("is refused when the lesson names the teacher: 409, the other class and subject named, and nothing of the refused timetable is kept", async () => {
    const r = await ready();
    expect((await put(r.token, r.a, [cell(1, 1, lesson(r.hindi, { teacherId: r.asha }))])).status).toBe(200);
    const clash = await put(r.token, r.b, [cell(1, 1, lesson(r.english, { teacherId: r.asha })), cell(2, 1, lesson(r.maths))]);
    expect(clash.status).toBe(409);
    expect(clash.body.message).toBe("Asha Rao is teaching Class 5 - A (Hindi) at the same time");
    expect(codesOf(clash)).toEqual(["TEACHER_BUSY"]);
    // All or nothing: the good lesson in the same request was not kept either, and the first class is as it was.
    expect(await savedCells(r.token, r.b)).toEqual([]);
    expect(await savedCells(r.token, r.a)).toHaveLength(1);
  });

  it("is refused when the teacher comes from the class's subject list, not from the lesson (the usual teacher of Maths in two classes)", async () => {
    const r = await ready();
    expect((await put(r.token, r.a, [cell(3, 4, lesson(r.maths))])).status).toBe(200);
    const clash = await put(r.token, r.one, [cell(3, 4, lesson(r.maths))]);
    expect(clash.status).toBe(409);
    expect(clash.body.message).toBe("Meena Singh is teaching Class 5 - A (Mathematics) at the same time");
  });

  it("is refused in the other direction too, and for any pair of units: a section and a class with no sections, two sections", async () => {
    const r = await ready();
    expect((await put(r.token, r.one, [cell(2, 2, lesson(r.english))])).status).toBe(200);
    expect(codesOf(await put(r.token, r.a, [cell(2, 2, lesson(r.english))]))).toEqual(["TEACHER_BUSY"]);
    expect(codesOf(await put(r.token, r.b, [cell(2, 2, lesson(r.english))]))).toEqual(["TEACHER_BUSY"]);
  });

  it("is fine on another day, in another period, and in the periods either side (the end of one is the start of the next)", async () => {
    const r = await ready();
    expect((await put(r.token, r.a, [cell(1, 2, lesson(r.maths))])).status).toBe(200);
    expect((await put(r.token, r.b, [cell(2, 2, lesson(r.maths))])).status).toBe(200); // another day
    expect((await put(r.token, r.b, [cell(1, 1, lesson(r.maths)), cell(1, 3, lesson(r.maths))])).status).toBe(200); // the periods before and after
    expect((await put(r.token, r.one, [cell(1, 4, lesson(r.maths))])).status).toBe(200); // after the lunch
  });

  it("is by the clock: a class on another timing, starting exactly when the other's period ends, is fine", async () => {
    const r = await ready();
    // 5-A period 1 is 08:30-09:10. Class 1 has a period at 09:10-09:50: it touches, it does not overlap.
    await addTiming(r.token, { name: "Little", scope: "only", classIds: [r.one.classId], days: [1], slots: [{ kind: "period", start: "09:10", end: "09:50" }] });
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    expect((await put(r.token, r.one, [cell(1, 1, lesson(r.maths))])).status).toBe(200);
  });

  it("is by the clock: a period one minute earlier than that overlaps by a minute and is refused", async () => {
    const r = await ready();
    await addTiming(r.token, { name: "Little", scope: "only", classIds: [r.one.classId], days: [1], slots: [{ kind: "period", start: "09:09", end: "09:49" }] });
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    const clash = await put(r.token, r.one, [cell(1, 1, lesson(r.maths))]);
    expect(clash.status).toBe(409);
    expect(codesOf(clash)).toEqual(["TEACHER_BUSY"]);
  });

  it("saving the same timetable again (a double click, a retry) is not a clash with itself", async () => {
    const r = await ready();
    const cells = [cell(1, 1, lesson(r.maths)), cell(1, 2, lesson(r.english))];
    expect((await put(r.token, r.a, cells)).status).toBe(200);
    expect((await put(r.token, r.a, cells)).status).toBe(200);
    expect((await put(r.token, r.a, cells)).status).toBe(200);
    expect(await savedCells(r.token, r.a)).toHaveLength(2);
  });

  it("a whole day given to one teacher (a Pre-Primary class's mother teacher) is refused when she is teaching elsewhere in any of its periods", async () => {
    const r = await ready();
    expect((await put(r.token, r.one, [cell(1, 5, lesson(r.maths))])).status).toBe(200); // Meena has Class 1 on Monday period 5
    const day = [1, 2, 3, 4, 5, 6, 7, 8].map((p) => cell(1, p, lesson(r.hindi, { teacherId: r.meena })));
    const refused = await put(r.token, r.a, day);
    expect(refused.status).toBe(409);
    expect(refused.body.details).toEqual([{ path: "d1p5", message: "Meena Singh is teaching Class 1 (Mathematics) at the same time", code: "TEACHER_BUSY" }]);
    expect(await savedCells(r.token, r.a)).toEqual([]);
  });

  it("two subjects of one choice cannot have the same teacher in one period, but the same teacher in two different periods is fine", async () => {
    const r = await ready();
    const sanskrit = await addSubject(r.token, "Sanskrit");
    const french = await addSubject(r.token, "French");
    for (const unit of [r.a]) {
      await saveAllotments(r.token, unit, [
        { subjectId: sanskrit, periodsPerWeek: 2, group: "third language", teacherId: r.asha },
        { subjectId: french, periodsPerWeek: 2, group: "third language", teacherId: r.dev },
      ]);
    }
    const twice = await put(r.token, r.a, [cell(1, 1, lesson(sanskrit), lesson(french, { teacherId: r.asha }))]);
    expect(twice.status).toBe(409);
    expect(codesOf(twice)).toContain("TEACHER_TWICE");
    expect((await put(r.token, r.a, [cell(1, 1, lesson(sanskrit), lesson(french)), cell(2, 1, lesson(sanskrit), lesson(french))])).status).toBe(200);
  });
});

describe("the other doors that put a teacher in a period", () => {
  it("Assign class (a teacher's days and periods in one request): refused where the teacher is busy by the clock, and the class's subject keeps its teacher", async () => {
    const r = await ready();
    await addTiming(r.token, { name: "Little", scope: "only", classIds: [r.one.classId], days: [1], slots: [{ kind: "period", start: "08:50", end: "09:30" }, { kind: "period", start: "09:30", end: "10:10" }] });
    expect((await put(r.token, r.a, [cell(1, 1, lesson(r.maths))])).status).toBe(200); // Meena 08:30-09:10
    // Class 1's period 1 (08:50-09:30) overlaps it by 20 minutes.
    const res = await request(app).put(`${base}/teacher-periods`).set(auth(r.token)).send({ ...r.one, teacherId: r.meena, subjectId: r.hindi, periodsPerWeek: 2, slots: [{ day: 1, period: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Meena Singh is teaching Class 5 - A (Mathematics) at the same time");
    expect(await savedCells(r.token, r.one)).toEqual([]);
    const list = (await request(app).get(`/api/v1/subjects/allotments?classId=${r.one.classId}&sectionId=none`).set(auth(r.token))).body.data.rows as { subjectId: string; teacherId: string | null }[];
    expect(list.find((x) => x.subjectId === r.hindi)?.teacherId ?? null).toBeNull();
  });

  it("the fill never double-books: a teacher busy at the first period of a class is not given it, and a class teacher of two sections gets the first period in one of them only", async () => {
    const r = await ready();
    // Dev is the class teacher of both sections of Class 5 and teaches English in both.
    for (const unit of [r.a, r.b]) expect((await request(app).put("/api/v1/staff/class-teachers").set(auth(r.token)).send({ ...unit, teacherId: r.dev })).status).toBe(200);
    const fillA = await post(r.token, "/grid/autofill", { ...r.a, cells: [], seed: 4 });
    expect(fillA.status).toBe(200);
    expect((await put(r.token, r.a, fillA.body.data.cells)).status).toBe(200);
    const fillB = await post(r.token, "/grid/autofill", { ...r.b, cells: [], seed: 4 });
    expect(fillB.status).toBe(200);
    expect(fillB.body.data.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    expect((await put(r.token, r.b, fillB.body.data.cells)).status).toBe(200);
    // Nobody in two places: the second section's first periods are not Dev's English where section A already has it.
    const first = (cells: { day: number; period: number; lessons: { subjectId: string }[] }[]) => cells.filter((c) => c.period === 1 && c.lessons[0].subjectId === r.english).map((c) => c.day);
    const inA = first(fillA.body.data.cells);
    const inB = first(fillB.body.data.cells);
    expect(inA.filter((d) => inB.includes(d))).toEqual([]);
  });
});

describe("what changes under a timetable that is already made", () => {
  it("a timing change that would put a teacher in two places is refused, naming the clash, and the timing stays as it was", async () => {
    const r = await ready();
    // Class 1 has its own timing, two periods (09:30-10:10, 10:10-10:50); Meena teaches 5-A period 2 (09:10-09:50) and Class 1 period 1 (09:30-10:10): they overlap!
    // Make them not overlap first: Class 1 period 1 starts at 09:50.
    await addTiming(r.token, { name: "Little", scope: "only", classIds: [r.one.classId], days: [1], slots: [{ kind: "period", start: "09:50", end: "10:30" }] });
    await put(r.token, r.a, [cell(1, 2, lesson(r.maths))]); // 09:10-09:50
    expect((await put(r.token, r.one, [cell(1, 1, lesson(r.maths))])).status).toBe(200); // 09:50-10:30: touches, fine
    // Now Class 1 is moved a quarter of an hour earlier: 09:35-10:15 overlaps 09:10-09:50.
    const moved = await request(app).put(`${base}/class-day`).set(auth(r.token)).send({ classId: r.one.classId, days: [{ day: 1, slots: [{ kind: "period", start: "09:35", end: "10:15" }] }] });
    expect(moved.status, JSON.stringify(moved.body)).toBe(409);
    expect(moved.body.message).toContain("Meena Singh");
    const own = ((await request(app).get(`${base}/schedules`).set(auth(r.token))).body.data.items as { name: string; slots: { start: string }[] }[]).find((t) => t.name === "Little");
    expect(own?.slots[0].start).toBe("09:50");
  });

  it("a school-wide change of the usual day that puts a class on the usual day on top of another class's own hours is refused too", async () => {
    const r = await ready();
    await addTiming(r.token, { name: "Little", scope: "only", classIds: [r.one.classId], days: [1, 2, 3, 4, 5], slots: [{ kind: "period", start: "09:50", end: "10:30" }] });
    await put(r.token, r.a, [cell(1, 2, lesson(r.maths))]); // 5-A (the usual day) period 2: 09:10-09:50
    expect((await put(r.token, r.one, [cell(1, 1, lesson(r.maths))])).status).toBe(200); // Class 1 (own hours) 09:50-10:30
    // The usual day starts half an hour later: 5-A period 2 becomes 09:40-10:20 and meets Class 1's 09:50-10:30.
    const usual = REGULAR_DAY.map((s) => ({ ...s, start: shift(s.start, 30), end: shift(s.end, 30) }));
    const res = await request(app).put(`${base}/school-day`).set(auth(r.token)).send({ days: [1, 2, 3, 4, 5].map((day) => ({ day, slots: usual })) });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.message).toContain("Meena Singh");
  });

  it("the winter shift (everything an hour later together) is NOT a clash: the same lessons, the same gaps", async () => {
    const r = await ready();
    await addTiming(r.token, { name: "Little", scope: "only", classIds: [r.one.classId], days: [1, 2, 3, 4, 5], slots: [{ kind: "period", start: "09:50", end: "10:30" }] });
    await put(r.token, r.a, [cell(1, 2, lesson(r.maths))]);
    await put(r.token, r.one, [cell(1, 1, lesson(r.maths))]);
    const usual = REGULAR_DAY.map((s) => ({ ...s, start: shift(s.start, 60), end: shift(s.end, 60) }));
    const res = await request(app).put(`${base}/school-day`).set(auth(r.token)).send({ days: [1, 2, 3, 4, 5].map((day) => ({ day, slots: usual })), shiftOthers: 60 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("a clash that was already there is not blamed on an unrelated timing change (only what a change brings new is held against it)", async () => {
    const r = await ready();
    expect((await put(r.token, r.a, [cell(1, 1, lesson(r.maths))])).status).toBe(200);
    // A double booking made behind the API's back (an old record): Class 1 also has Meena at Monday period 1.
    const class1 = await request(app).get(`${grid}?classId=${r.one.classId}&sectionId=none`).set(auth(r.token));
    expect(class1.status).toBe(200);
    await put(r.token, r.one, [cell(1, 2, lesson(r.maths))]);
    await Timetable.updateOne({ tenantId: r.tenantId, classId: r.one.classId, sectionId: null }, { $set: { cells: [{ day: 1, period: 1, lessons: [{ subjectId: r.maths, teacherId: null, room: null }] }] } });
    // A change that touches neither class's hours (Saturday gets its own short day) must not be refused for the old clash.
    const usual = REGULAR_DAY;
    const res = await request(app).put(`${base}/school-day`).set(auth(r.token)).send({ days: [...[1, 2, 3, 4, 5].map((day) => ({ day, slots: usual })), { day: 6, slots: [{ kind: "period", start: "09:00", end: "09:40" }] }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("a teacher given a day off after lessons are on it: the timetable then says so (an error on that day) and cannot be published", async () => {
    const r = await ready();
    expect((await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(2, 1, lesson(r.maths))])).status).toBe(200);
    const off = await request(app).patch(`/api/v1/staff/teachers/${r.meena}`).set(auth(r.token)).send({ offDays: [1] });
    // The day off is kept (a person can be given a day off at any time); what it does to the timetable is SAID, not hidden.
    expect(off.status).toBe(200);
    const view = (await get(r.token, r.a)).body.data;
    expect(view.issues.map((i: { code: string }) => i.code)).toContain("TEACHER_OFF");
    expect(view.issues.find((i: { code: string }) => i.code === "TEACHER_OFF")).toMatchObject({ level: "error", day: 1, period: 1 });
    expect((await post(r.token, "/grid/publish", r.a)).status).toBe(409);
  });
});

describe("two people saving at the same moment (there are no transactions)", () => {
  it("two classes saved at the same moment with the same teacher at the same time: at least one is refused, and nobody is left in two places", async () => {
    const r = await ready();
    const lessons = [cell(1, 1, lesson(r.hindi, { teacherId: r.asha }))];
    const [first, second] = await Promise.all([put(r.token, r.a, lessons), put(r.token, r.b, lessons)]);
    const statuses = [first.status, second.status].sort();
    // At least one is refused: both kept would be a teacher in two places.
    expect(statuses).not.toEqual([200, 200]);
    const kept = [(await savedCells(r.token, r.a)).length, (await savedCells(r.token, r.b)).length];
    expect(kept[0] + kept[1]).toBeLessThanOrEqual(1);
  });

  it("the same teacher given to two classes by Assign class at the same moment: at most one keeps the period", async () => {
    const r = await ready();
    const assign = (unit: Unit) => request(app).put(`${base}/teacher-periods`).set(auth(r.token)).send({ ...unit, teacherId: r.asha, subjectId: r.hindi, periodsPerWeek: 2, slots: [{ day: 2, period: 3 }] });
    const [first, second] = await Promise.all([assign(r.a), assign(r.b)]);
    expect([first.status, second.status].sort()).not.toEqual([200, 200]);
    expect((await savedCells(r.token, r.a)).length + (await savedCells(r.token, r.b)).length).toBeLessThanOrEqual(1);
  });

  it("many saves at once for many classes all with the same teacher: still never two in one period", async () => {
    const r = await ready();
    const units = [r.a, r.b, r.one];
    const results = await Promise.all(units.map((u) => put(r.token, u, [cell(4, 2, lesson(r.hindi, { teacherId: r.asha }))])));
    const kept = results.filter((x) => x.status === 200).length;
    expect(kept).toBeLessThanOrEqual(1);
    let held = 0;
    for (const u of units) held += (await savedCells(r.token, u)).length;
    expect(held).toBeLessThanOrEqual(1);
  });
});

/** "08:30" + minutes. */
function shift(clock: string, minutes: number): string {
  const [h, m] = clock.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
