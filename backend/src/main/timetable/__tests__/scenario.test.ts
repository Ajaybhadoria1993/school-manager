import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";

const base = "/api/v1/timetable";
const get = (token: string, path: string) => request(app).get(`${base}${path}`).set(auth(token));
const post = (token: string, path: string, body: object) => request(app).post(`${base}${path}`).set(auth(token)).send(body);
const put = (token: string, body: object) => request(app).put(`${base}/grid`).set(auth(token)).send(body);

interface Unit {
  classId: string;
  sectionId: string | null;
  label: string;
}

/**
 * A whole school in one test, the way a head would set it up: a regular timing Monday to Friday, a half-day Saturday for everyone but the
 * little ones, a different (shorter, later) timing for the little ones; sections that share teachers; a lab in double periods; a choice of
 * third language; a part-time teacher. Every class is filled by the program one after the other and saved; at the end nobody is in two
 * places by the clock, every subject has its periods, and every timetable can be published.
 */
async function school() {
  const s = await timetableSchool();
  const nursery = await addClass(s.token, "Nursery", []);
  const class1 = await addClass(s.token, "Class 1", ["A", "B"]);
  const class5 = await addClass(s.token, "Class 5", ["A", "B"]);
  const class9 = await addClass(s.token, "Class 9", ["A", "B"]);

  const timing = async (body: object) => (await request(app).post(`${base}/schedules`).set(auth(s.token)).send(body)).status;
  const regular = [
    { kind: "period", start: "08:30", end: "09:10" },
    { kind: "period", start: "09:10", end: "09:50" },
    { kind: "period", start: "09:50", end: "10:30" },
    { kind: "lunch", start: "10:30", end: "11:00" },
    { kind: "period", start: "11:00", end: "11:40" },
    { kind: "period", start: "11:40", end: "12:20" },
    { kind: "period", start: "12:20", end: "13:00" },
    { kind: "period", start: "13:00", end: "13:40" },
    { kind: "period", start: "13:40", end: "14:20" },
  ];
  expect(await timing({ name: "Regular", days: [1, 2, 3, 4, 5], slots: regular })).toBe(201);
  // The little ones: 30-minute periods from 09:00, no school on Saturday (the Saturday timing is for all classes but them).
  expect(
    await timing({
      name: "Little ones",
      days: [1, 2, 3, 4, 5],
      scope: "only",
      classIds: [nursery.id],
      slots: [
        { kind: "period", start: "09:00", end: "09:30" },
        { kind: "period", start: "09:30", end: "10:00" },
        { kind: "break", label: "Snack", start: "10:00", end: "10:20" },
        { kind: "period", start: "10:20", end: "10:50" },
        { kind: "period", start: "10:50", end: "11:20" },
        { kind: "period", start: "11:20", end: "11:50" },
      ],
    })
  ).toBe(201);
  expect(
    await timing({
      name: "Saturday",
      days: [6],
      scope: "except",
      classIds: [nursery.id],
      slots: [
        { kind: "period", start: "08:30", end: "09:10" },
        { kind: "period", start: "09:10", end: "09:50" },
        { kind: "break", label: "Break", start: "09:50", end: "10:05" },
        { kind: "period", start: "10:05", end: "10:45" },
        { kind: "period", start: "10:45", end: "11:25" },
      ],
    })
  ).toBe(201);

  const subject = (name: string, over: object = {}) => addSubject(s.token, name, over);
  const english = await subject("English");
  const hindi = await subject("Hindi");
  const maths = await subject("Mathematics");
  const science = await subject("Science");
  const computer = await subject("Computer Science", { category: "activity" });
  const pe = await subject("Physical Education", { category: "activity" });
  const sanskrit = await subject("Sanskrit");
  const french = await subject("French");
  const rhymes = await subject("Rhymes", { category: "activity" });

  const teacher = (name: string, over: object = {}) => addTeacher(s.token, name, over);
  const t = {
    meena: await teacher("Meena Singh"),
    sunita: await teacher("Sunita Sharma"),
    dev: await teacher("Dev Patel"),
    pooja: await teacher("Pooja Nair"),
    asha: await teacher("Asha Rao"),
    geeta: await teacher("Geeta Iyer"),
    rohit: await teacher("Rohit Menon"),
    neha: await teacher("Neha Kapoor"),
    kiran: await teacher("Kiran Joshi", { offDays: [1], maxPeriodsPerDay: 6 }),
    madhu: await teacher("Madhu Bala"),
    ravi: await teacher("Ravi Kumar"),
  };

  const units: Unit[] = [];
  const give = async (unit: { id: string; name: string; sectionId?: string }, rows: object[]) => {
    const ref = { classId: unit.id, sectionId: unit.sectionId ?? null };
    const res = await saveAllotments(s.token, ref, rows as never);
    expect(res.status, `${unit.name}: ${JSON.stringify(res.body)}`).toBe(200);
    units.push({ ...ref, label: res.body.data.unit.label });
  };

  await give(nursery, [
    { subjectId: english, periodsPerWeek: 5, teacherId: t.sunita },
    { subjectId: rhymes, periodsPerWeek: 5, teacherId: t.ravi },
    { subjectId: maths, periodsPerWeek: 5, teacherId: t.meena },
    { subjectId: pe, periodsPerWeek: 3, teacherId: t.dev },
  ]);
  // The A sections and the B sections of a class each have their own teachers, and a teacher teaches the same subject in every A (or every B).
  for (const klass of [class1, class5]) {
    for (const [i, section] of klass.sections.entries()) {
      const a = i === 0;
      await give({ id: klass.id, name: klass.name, sectionId: section.id }, [
        { subjectId: english, periodsPerWeek: 6, teacherId: a ? t.dev : t.pooja },
        { subjectId: hindi, periodsPerWeek: 5, teacherId: a ? t.asha : t.geeta },
        { subjectId: maths, periodsPerWeek: 6, teacherId: a ? t.meena : t.sunita },
        { subjectId: science, periodsPerWeek: 5, teacherId: a ? t.rohit : t.neha },
        { subjectId: computer, periodsPerWeek: 2, blockSize: 2, teacherId: t.kiran },
        { subjectId: pe, periodsPerWeek: 2, teacherId: t.ravi },
      ]);
    }
  }
  for (const [i, section] of class9.sections.entries()) {
    const a = i === 0;
    await give({ id: class9.id, name: class9.name, sectionId: section.id }, [
      { subjectId: english, periodsPerWeek: 6, teacherId: a ? t.dev : t.pooja },
      { subjectId: maths, periodsPerWeek: 7, teacherId: a ? t.meena : t.sunita },
      { subjectId: science, periodsPerWeek: 6, teacherId: a ? t.rohit : t.neha },
      { subjectId: sanskrit, periodsPerWeek: 4, group: "Third language", teacherId: t.asha },
      { subjectId: french, periodsPerWeek: 4, group: "Third language", teacherId: t.madhu },
      { subjectId: computer, periodsPerWeek: 4, blockSize: 2, teacherId: t.kiran },
      { subjectId: pe, periodsPerWeek: 2, teacherId: t.ravi },
    ]);
  }
  return { ...s, units, t };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a whole school's timetables, made one after the other", () => {
  it("fills every class, saves each, and leaves nobody in two places by the clock, every subject with its periods, and every timetable publishable", async () => {
    const r = await school();

    for (const [i, unit] of r.units.entries()) {
      const section = unit.sectionId ?? "none";
      const view = (await get(r.token, `/grid?classId=${unit.classId}&sectionId=${section}`)).body.data;
      const fill = await post(r.token, "/grid/autofill", { classId: unit.classId, sectionId: unit.sectionId, cells: [], seed: i + 1 });
      expect(fill.status, `${unit.label}: ${JSON.stringify(fill.body)}`).toBe(200);
      const answer = fill.body.data;
      // Whatever the program could not place is only said when a teacher really has no free period left.
      expect(answer.issues.filter((x: { level: string }) => x.level === "error"), `${unit.label} errors`).toEqual([]);
      const saved = await put(r.token, { classId: unit.classId, sectionId: unit.sectionId, cells: answer.cells });
      expect(saved.status, `${unit.label}: ${JSON.stringify(saved.body)}`).toBe(200);
      // Every subject has exactly the periods it was given, or the program said which is short.
      const missing = new Map<string, number>(answer.unplaced.map((u: { subjectId: string; missing: number }) => [u.subjectId, u.missing]));
      for (const a of view.allotments as { subjectId: string; periodsPerWeek: number }[]) {
        const placed = saved.body.data.stats.placed[a.subjectId] ?? 0;
        expect(placed + (missing.get(a.subjectId) ?? 0), `${unit.label} ${a.subjectId}`).toBe(a.periodsPerWeek);
      }
      expect(answer.unplaced, `${unit.label} could not place everything`).toEqual([]);
    }

    // Nobody is in two places: each teacher's lessons never overlap in time on a day, read independently of the program's own check.
    const teachers = (await request(app).get("/api/v1/staff/teachers").set(auth(r.token))).body.data.items as { id: string; name: string; offDays: number[]; maxPeriodsPerDay: number | null }[];
    for (const teacher of teachers) {
      const week = (await get(r.token, `/teachers/${teacher.id}`)).body.data;
      const lessons = week.lessons as { day: number; start: string; end: string; label: string }[];
      for (const a of lessons) {
        expect(teacher.offDays.includes(a.day), `${teacher.name} on a day off`).toBe(false);
        for (const b of lessons) {
          if (a === b || a.day !== b.day) continue;
          expect(a.start < b.end && b.start < a.end, `${teacher.name} is in ${a.label} and ${b.label} at once on day ${a.day} (${a.start}-${a.end} / ${b.start}-${b.end})`).toBe(false);
        }
      }
      if (teacher.maxPeriodsPerDay) for (const [day, n] of Object.entries(week.perDay as Record<string, number>)) expect(n, `${teacher.name} on day ${day}`).toBeLessThanOrEqual(teacher.maxPeriodsPerDay);
    }

    // The overview agrees: nothing to fix anywhere, and all can be published.
    const overview = (await get(r.token, "/overview")).body.data;
    expect(overview.units.map((u: { errors: number }) => u.errors)).toEqual(overview.units.map(() => 0));
    for (const unit of r.units) {
      const res = await post(r.token, "/grid/publish", { classId: unit.classId, sectionId: unit.sectionId });
      expect(res.status, `${unit.label}: ${JSON.stringify(res.body)}`).toBe(200);
    }
    expect((await get(r.token, "/overview?status=published")).body.data.units).toHaveLength(r.units.length);
  }, 180_000);

  it("keeps each class to the days and the times of its own timing: the little ones' 30-minute periods and no Saturday, the others' Saturday half day", async () => {
    const r = await school();
    const nursery = r.units[0];
    const little = (await get(r.token, `/grid?classId=${nursery.classId}&sectionId=none`)).body.data;
    expect(little.days.map((d: { name: string }) => d.name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(little.days[0].slots.map((s: { kind: string; start: string; end: string }) => `${s.kind[0]} ${s.start}-${s.end}`)).toEqual(["p 09:00-09:30", "p 09:30-10:00", "b 10:00-10:20", "p 10:20-10:50", "p 10:50-11:20", "p 11:20-11:50"]);
    expect(little.stats.total).toBe(25);
    const class1a = r.units[1];
    const bigger = (await get(r.token, `/grid?classId=${class1a.classId}&sectionId=${class1a.sectionId}`)).body.data;
    expect(bigger.days.map((d: { name: string }) => d.name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
    expect(bigger.stats.total).toBe(8 * 5 + 4);
    // A lesson on Saturday period 5 does not exist for the little ones (no Saturday) nor for the others (4 periods).
    expect((await put(r.token, { classId: nursery.classId, sectionId: null, cells: [{ day: 6, period: 1, lessons: [{ subjectId: little.allotments[0].subjectId }] }] })).status).toBe(409);
    expect((await put(r.token, { classId: class1a.classId, sectionId: class1a.sectionId, cells: [{ day: 6, period: 5, lessons: [{ subjectId: bigger.allotments[0].subjectId }] }] })).status).toBe(409);
  }, 120_000);

  it("a teacher who teaches the little ones and a big class is never put where the clock puts them in two places (30-minute and 40-minute periods overlap)", async () => {
    const r = await school();
    const nursery = r.units[0];
    const class1a = r.units[1];
    // Meena teaches Nursery Maths (30-minute periods from 09:00) and Class 1 - A Maths (40-minute periods from 08:30).
    const nurseryView = (await get(r.token, `/grid?classId=${nursery.classId}&sectionId=none`)).body.data;
    const nurseryMaths = nurseryView.allotments.find((a: { subjectName: string }) => a.subjectName === "Mathematics").subjectId;
    expect((await put(r.token, { classId: nursery.classId, sectionId: null, cells: [{ day: 1, period: 1, lessons: [{ subjectId: nurseryMaths }] }] })).status).toBe(200);
    // Nursery period 1 is 09:00-09:30; Class 1 period 1 (08:30-09:10) and period 2 (09:10-09:50) both overlap it; period 3 (09:50-10:30) does not.
    const class1View = (await get(r.token, `/grid?classId=${class1a.classId}&sectionId=${class1a.sectionId}`)).body.data;
    const class1Maths = class1View.allotments.find((a: { subjectName: string }) => a.subjectName === "Mathematics").subjectId;
    const at = (period: number) => put(r.token, { classId: class1a.classId, sectionId: class1a.sectionId, cells: [{ day: 1, period, lessons: [{ subjectId: class1Maths }] }] });
    expect((await at(1)).status).toBe(409);
    expect((await at(2)).status).toBe(409);
    expect((await at(3)).status).toBe(200);
  }, 120_000);
});
