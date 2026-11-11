import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Allotment } from "../../subjects/models/Allotment";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { Timetable } from "../models/Timetable";

const base = "/api/v1/timetable";
const put = (token: string, unit: { classId: string; sectionId: string | null }, cells: object[]) => request(app).put(`${base}/grid`).set(auth(token)).send({ ...unit, cells });
const get = (token: string, unit: { classId: string; sectionId: string | null }) => request(app).get(`${base}/grid?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}`).set(auth(token));
const post = (token: string, path: string, body: object) => request(app).post(`${base}${path}`).set(auth(token)).send(body);
const lesson = (subjectId: string, over: object = {}) => ({ subjectId, ...over });
const cell = (day: number, period: number, ...lessons: object[]) => ({ day, period, lessons });
const details = (res: request.Response) => res.body.details as { path: string; message: string; code?: string }[];

/** Class 5 with sections A, B and C, the usual day, and Maths (6) / English (5) / Hindi (5) in each; Meena and Dev teach Maths and English in A and B. */
async function ready() {
  const s = await timetableSchool();
  const class5 = await addClass(s.token, "Class 5", ["A", "B", "C"]);
  await addTiming(s.token);
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const hindi = await addSubject(s.token, "Hindi");
  const meena = await addTeacher(s.token, "Meena Singh");
  const dev = await addTeacher(s.token, "Dev Patel");
  const asha = await addTeacher(s.token, "Asha Rao");
  const unit = (i: number) => ({ classId: class5.id, sectionId: class5.sections[i].id });
  const rows = (m: string, e: string, h: string | null) => [
    { subjectId: maths, periodsPerWeek: 6, teacherId: m },
    { subjectId: english, periodsPerWeek: 5, teacherId: e },
    { subjectId: hindi, periodsPerWeek: 5, teacherId: h },
  ];
  await saveAllotments(s.token, unit(0), rows(meena, dev, asha));
  await saveAllotments(s.token, unit(1), rows(dev, meena, asha));
  await saveAllotments(s.token, unit(2), rows(meena, dev, null));
  return { ...s, class5, a: unit(0), b: unit(1), c: unit(2), maths, english, hindi, meena, dev, asha };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("fill the empty periods", () => {
  it("proposes a full timetable without saving it, and says nothing is missing", async () => {
    const r = await ready();
    const res = await post(r.token, "/grid/autofill", { ...r.a, cells: [], seed: 3 });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.unplaced).toEqual([]);
    expect(d.dropped).toBe(0);
    expect(d.cells).toHaveLength(16);
    expect(d.stats).toMatchObject({ total: 40, filled: 16 });
    expect(d.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    // Nothing is stored until the person saves.
    expect(await Timetable.countDocuments({ tenantId: r.tenantId })).toBe(0);
    // And what it proposes can be saved as it is.
    expect((await put(r.token, r.a, d.cells)).status).toBe(200);
  });

  it("drops a lesson that is not allowed (the teacher is in another class then) and keeps the others", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    const res = await post(r.token, "/grid/autofill", { ...r.c, cells: [cell(1, 1, lesson(r.maths)), cell(1, 2, lesson(r.hindi))], seed: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.dropped).toBe(1);
    // The lesson that was allowed stays where it was; the one that was not is not put back (the fill may give that free period to another subject).
    const at = (period: number) => res.body.data.cells.find((c: { day: number; period: number }) => c.day === 1 && c.period === period)?.lessons[0].subjectId;
    expect(at(2)).toBe(r.hindi);
    expect(at(1)).not.toBe(r.maths);
  });

  it("gives another arrangement for another seed, the same one for the same seed", async () => {
    const r = await ready();
    const run = async (seed: number) => (await post(r.token, "/grid/autofill", { ...r.a, cells: [], seed })).body.data.cells;
    expect(await run(5)).toEqual(await run(5));
    const all = await Promise.all([1, 2, 3, 4, 5].map(run));
    expect(new Set(all.map((c) => JSON.stringify(c))).size).toBeGreaterThan(1);
  });

  it("works around the teachers' other classes: filling B after A never double-books a teacher", async () => {
    const r = await ready();
    const a = await post(r.token, "/grid/autofill", { ...r.a, cells: [] });
    await put(r.token, r.a, a.body.data.cells);
    const b = await post(r.token, "/grid/autofill", { ...r.b, cells: [] });
    expect(b.body.data.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    expect((await put(r.token, r.b, b.body.data.cells)).status).toBe(200);
    const c = await post(r.token, "/grid/autofill", { ...r.c, cells: [] });
    expect(c.body.data.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    expect((await put(r.token, r.c, c.body.data.cells)).status).toBe(200);
  });

  it("says which subjects could not get all their periods", async () => {
    const r = await ready();
    // Meena is booked in every period of the week elsewhere: her Maths cannot be placed in 5-A.
    const other = await addClass(r.token, "Class 6", ["A"]);
    const unit6 = { classId: other.id, sectionId: other.sections[0].id };
    await saveAllotments(r.token, unit6, [{ subjectId: r.maths, periodsPerWeek: 20, teacherId: r.meena }, { subjectId: r.english, periodsPerWeek: 20, teacherId: r.meena }]);
    const fill6 = await post(r.token, "/grid/autofill", { ...unit6, cells: [] });
    expect(fill6.body.data.unplaced).toEqual([]);
    await put(r.token, unit6, fill6.body.data.cells);
    const res = await post(r.token, "/grid/autofill", { ...r.a, cells: [] });
    expect(res.body.data.unplaced).toEqual([{ subjectId: r.maths, subjectName: "Mathematics", missing: 6 }]);
  });

  it("needs a timing, is for the people who make the timetable, and a class of the school", async () => {
    const s = await timetableSchool();
    const klass = await addClass(s.token, "Class 5", ["A"]);
    const unit = { classId: klass.id, sectionId: klass.sections[0].id };
    expect((await post(s.token, "/grid/autofill", { ...unit, cells: [] })).body.code).toBe("NO_TIMING");
    await addTiming(s.token);
    const teacher = await addColleague(s.tenantId, "teacher");
    expect((await post(teacher, "/grid/autofill", { ...unit, cells: [] })).status).toBe(403);
    expect((await post(s.token, "/grid/autofill", { classId: new Types.ObjectId().toString(), sectionId: null, cells: [] })).status).toBe(404);
  });
});

describe("give a timetable to the other sections", () => {
  it("copies the periods with each section's own teachers, leaves out a lesson that would put a teacher in two places, and says what was left", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(1, 2, lesson(r.english)), cell(1, 3, lesson(r.hindi))]);
    const res = await post(r.token, "/grid/copy", { ...r.a, toSections: [r.b.sectionId, r.c.sectionId] });
    expect(res.status).toBe(200);
    const [toB, toC] = res.body.data.results;
    // B: Dev teaches Maths and Meena English, and they are free then (A has Meena for Maths, Dev for English); Asha teaches Hindi in both.
    expect(toB).toMatchObject({ label: "Class 5 - B", status: "copied", copied: 2 });
    expect(toB.left).toEqual([{ day: 1, period: 3, reason: "Asha Rao is teaching Class 5 - A (Hindi) at the same time" }]);
    // C: Maths is Meena's, who is teaching 5-A's Maths in that period: that lesson is left out, English (Dev) too, Hindi (nobody) copies.
    expect(toC.status).toBe("copied");
    expect(toC.left.map((l: { day: number; period: number }) => `${l.day}.${l.period}`)).toEqual(["1.1", "1.2"]);
    expect(toC.left[0].reason).toBe("Meena Singh is teaching Class 5 - A (Mathematics) at the same time");
    expect((await get(r.token, r.b)).body.data.cells).toHaveLength(2);
    expect((await get(r.token, r.c)).body.data.cells).toHaveLength(1);
  });

  it("does not touch a section that already has lessons unless asked to replace them", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    await put(r.token, r.b, [cell(2, 1, lesson(r.english))]);
    const kept = await post(r.token, "/grid/copy", { ...r.a, toSections: [r.b.sectionId] });
    expect(kept.body.data.results[0]).toMatchObject({ status: "skipped", reason: "It already has lessons" });
    expect((await get(r.token, r.b)).body.data.cells).toHaveLength(1);
    const replaced = await post(r.token, "/grid/copy", { ...r.a, toSections: [r.b.sectionId], replace: true });
    expect(replaced.body.data.results[0].status).toBe("copied");
    expect((await get(r.token, r.b)).body.data.cells.map((c: { day: number }) => c.day)).toEqual([1]);
  });

  it("leaves out a subject the other section does not study, and does not copy rooms", async () => {
    const r = await ready();
    const art = await addSubject(r.token, "Art");
    await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.meena }, { subjectId: art, periodsPerWeek: 2 }]);
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths, { room: "Room 5" })), cell(2, 1, lesson(art))]);
    const res = await post(r.token, "/grid/copy", { ...r.a, toSections: [r.b.sectionId] });
    const result = res.body.data.results[0];
    expect(result.copied).toBe(1);
    expect(result.left).toEqual([{ day: 2, period: 1, reason: "Class 5 - B does not study Art" }]);
    const b = (await get(r.token, r.b)).body.data.cells;
    expect(b[0].lessons[0].room).toBeNull();
  });

  it("is for sections of the same class only, never the section itself, and needs lessons to copy", async () => {
    const r = await ready();
    const six = await addClass(r.token, "Class 6", ["A"]);
    expect((await post(r.token, "/grid/copy", { ...r.a, toSections: [r.b.sectionId] })).body.code).toBe("TIMETABLE_EMPTY");
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    expect((await post(r.token, "/grid/copy", { ...r.a, toSections: [six.sections[0].id] })).status).toBe(404);
    const self = await post(r.token, "/grid/copy", { ...r.a, toSections: [r.a.sectionId] });
    expect(self.body.data.results).toEqual([]);
    expect((await post(r.token, "/grid/copy", { ...r.a, toSections: [] })).status).toBe(400);
  });
});

describe("a teacher's week", () => {
  it("lists their lessons across the classes, by day and time, with the class, the subject and whether it is published; and what they were given", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(2, 1, lesson(r.maths)), cell(1, 4, lesson(r.maths))]);
    await put(r.token, r.b, [cell(1, 2, lesson(r.english))]);
    const res = await request(app).get(`${base}/teachers/${r.meena}`).set(auth(r.token));
    expect(res.status).toBe(200);
    expect(res.body.data.teacher).toMatchObject({ name: "Meena Singh", isActive: true });
    expect(res.body.data.lessons).toEqual([
      expect.objectContaining({ day: 1, period: 2, start: "09:10", end: "09:50", label: "Class 5 - B", subjectName: "English", published: false }),
      expect.objectContaining({ day: 1, period: 4, start: "11:00", end: "11:40", label: "Class 5 - A", subjectName: "Mathematics" }),
      expect.objectContaining({ day: 2, period: 1, start: "08:30", end: "09:10", label: "Class 5 - A", subjectName: "Mathematics" }),
    ]);
    expect(res.body.data.perDay).toEqual({ "1": 2, "2": 1 });
    expect(res.body.data.week).toBe(3);
    expect(res.body.data.teaches.map((t: { label: string; subjectName: string }) => `${t.label} ${t.subjectName}`)).toEqual(["Class 5 - A Mathematics", "Class 5 - B English", "Class 5 - C Mathematics"]);
  });

  it("shows a teacher only the published lessons, and the one who made the timetable the drafts as well", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    await put(r.token, r.b, [cell(1, 2, lesson(r.english))]);
    await post(r.token, "/grid/publish", r.a);
    const teacher = await addColleague(r.tenantId, "teacher");
    const seen = await request(app).get(`${base}/teachers/${r.meena}`).set(auth(teacher));
    expect(seen.body.data.lessons.map((l: { label: string }) => l.label)).toEqual(["Class 5 - A"]);
    const all = await request(app).get(`${base}/teachers/${r.meena}`).set(auth(r.token));
    expect(all.body.data.lessons).toHaveLength(2);
    const list = await request(app).get(`${base}/published`).set(auth(teacher));
    expect(list.body.data.units).toEqual([{ classId: r.class5.id, sectionId: r.a.sectionId, label: "Class 5 - A" }]);
  });

  it("is a 404 for a teacher of another school", async () => {
    const r = await ready();
    const other = await timetableSchool("Moonrise Public School");
    const stranger = await addTeacher(other.token, "Someone Else");
    expect((await request(app).get(`${base}/teachers/${stranger}`).set(auth(r.token))).status).toBe(404);
  });
});

describe("a teacher who leaves", () => {
  it("gives their classes and lessons to another teacher, and can make them inactive in the same step", async () => {
    const r = await ready();
    const anil = await addTeacher(r.token, "Anil Rao");
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths, { teacherId: anil })), cell(2, 1, lesson(r.maths))]);
    await saveAllotments(r.token, r.c, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: anil }, { subjectId: r.english, periodsPerWeek: 5, teacherId: r.dev }]);
    const res = await post(r.token, `/teachers/${anil}/replace`, { withTeacherId: r.asha, deactivate: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ allotments: 1, lessons: 1 });
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, teacherId: anil })).toBe(0);
    const week = await request(app).get(`${base}/teachers/${r.asha}`).set(auth(r.token));
    expect(week.body.data.lessons.map((l: { label: string }) => l.label)).toEqual(["Class 5 - A"]);
    const gone = (await request(app).get("/api/v1/staff/teachers?status=inactive").set(auth(r.token))).body.data.items;
    expect(gone.map((t: { name: string }) => t.name)).toEqual(["Anil Rao"]);
  });

  it("is refused when the new teacher would be in two places, and then nothing is changed", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    await put(r.token, r.c, [cell(1, 1, lesson(r.english))]);
    // Meena (5-A Maths, Mon 1) is replaced by Dev, who teaches 5-C English then.
    const res = await post(r.token, `/teachers/${r.meena}/replace`, { withTeacherId: r.dev });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TIMETABLE_CLASHES");
    expect(res.body.message).toBe("Class 5 - A: Dev Patel is teaching Class 5 - C (English) at the same time");
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, teacherId: r.meena })).toBe(3);
  });

  it("needs another teacher who is still teaching, and not the same one", async () => {
    const r = await ready();
    const left = await addTeacher(r.token, "Anil Rao");
    await request(app).patch(`/api/v1/staff/teachers/${left}`).set(auth(r.token)).send({ isActive: false });
    expect(details(await post(r.token, `/teachers/${r.meena}/replace`, { withTeacherId: r.meena }))).toEqual([{ path: "withTeacherId", message: "Choose another teacher" }]);
    expect(details(await post(r.token, `/teachers/${r.meena}/replace`, { withTeacherId: left }))).toEqual([{ path: "withTeacherId", message: "Anil Rao is no longer teaching here" }]);
    expect((await post(r.token, `/teachers/${r.meena}/replace`, { withTeacherId: new Types.ObjectId().toString() })).status).toBe(400);
  });
});

describe("the set-up at a glance", () => {
  it("lists the timings, and each class or section with its subjects, periods, teachers and where its timetable stands", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(2, 1, lesson(r.maths))]);
    await put(r.token, r.b, [cell(1, 2, lesson(r.english))]);
    await post(r.token, "/grid/publish", r.b);
    const res = await request(app).get(`${base}/overview`).set(auth(r.token));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.academicYear.name).toBe("2026-2027");
    expect(d.counts).toEqual({ subjects: 3, teachers: 3, timings: 1 });
    expect(d.timings).toEqual([{ id: expect.any(String), name: "Regular", days: [1, 2, 3, 4, 5], scope: "all", classNames: [], periods: 8, start: "08:30", end: "14:20", lunch: { start: "10:30", end: "11:00" } }]);
    expect(d.units.map((u: { label: string }) => u.label)).toEqual(["Class 5 - A", "Class 5 - B", "Class 5 - C"]);
    const [a, b, c] = d.units;
    expect(a).toMatchObject({ hasTiming: true, subjects: 3, periodsToPlace: 16, periodsAvailable: 40, withoutTeacher: 0, status: "draft", filled: 2, total: 40 });
    expect(b).toMatchObject({ status: "published", filled: 1 });
    expect(c).toMatchObject({ status: "none", withoutTeacher: 1, filled: 0, errors: 0 });
    expect(a.warnings).toBeGreaterThan(0);
  });

  it("counts the whole school and filters the class list by name and by where the timetable stands, on the server", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    await put(r.token, r.b, [cell(1, 2, lesson(r.english))]);
    await post(r.token, "/grid/publish", r.b);
    const labels = async (query: string) => ((await request(app).get(`${base}/overview${query}`).set(auth(r.token))).body.data.units as { label: string }[]).map((u) => u.label);

    expect(await labels("")).toEqual(["Class 5 - A", "Class 5 - B", "Class 5 - C"]);
    expect(await labels("?status=draft")).toEqual(["Class 5 - A"]);
    expect(await labels("?status=published")).toEqual(["Class 5 - B"]);
    expect(await labels("?status=none")).toEqual(["Class 5 - C"]);
    expect(await labels("?search=- b")).toEqual(["Class 5 - B"]);
    expect(await labels("?search=class%205&status=none")).toEqual(["Class 5 - C"]);
    expect(await labels("?search=nothing")).toEqual([]);
    // The summary is the whole school's, whatever is asked for.
    const filtered = await request(app).get(`${base}/overview?status=published`).set(auth(r.token));
    expect(filtered.body.data.summary).toEqual({ units: 3, withSubjects: 3, withTiming: 3, none: 1, draft: 1, published: 1 });
    expect((await request(app).get(`${base}/overview?status=wrong`).set(auth(r.token))).status).toBe(400);
  });

  it("says a class has no timing, and is for the people who make the timetable only", async () => {
    const s = await timetableSchool();
    await addClass(s.token, "Class 5", ["A"]);
    const res = await request(app).get(`${base}/overview`).set(auth(s.token));
    expect(res.body.data.units[0]).toMatchObject({ hasTiming: false, periodsAvailable: null, status: "none" });
    const teacher = await addColleague(s.tenantId, "teacher");
    expect((await request(app).get(`${base}/overview`).set(auth(teacher))).status).toBe(403);
  });

  it("is empty for a school with no running academic year", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await request(app).get(`${base}/overview`).set(auth(s.token));
    expect(res.status).toBe(200);
    expect(res.body.data.academicYear).toBeNull();
    expect(res.body.data.units).toEqual([]);
  });
});
