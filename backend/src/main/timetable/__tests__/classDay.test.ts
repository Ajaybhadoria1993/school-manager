import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague } from "../../../test/schools";
import { addClass, addSubject, auth, REGULAR_DAY, saveAllotments, timetableSchool } from "../../../test/timetable";
import { BellSchedule } from "../models/BellSchedule";
import { Timetable } from "../models/Timetable";

const school = "/api/v1/timetable/school-day";
const api = "/api/v1/timetable/class-day";
const putSchool = (token: string, body: object) => request(app).put(school).set(auth(token)).send(body);
const put = (token: string, body: object) => request(app).put(api).set(auth(token)).send(body);
const grid = "/api/v1/timetable/grid";
const saveGrid = (token: string, unit: { classId: string; sectionId: string | null }, cells: object[]) => request(app).put(grid).set(auth(token)).send({ ...unit, cells });
const list = async (token: string) =>
  (await request(app).get("/api/v1/timetable/schedules").set(auth(token))).body.data.items as { name: string; days: number[]; scope: string; classIds: string[]; departmentId: string | null; periods: number; slots: unknown[] }[];
/** "1:5" = Monday has five periods; a day the class has no school is not listed. */
const gridDays = async (token: string, classId: string, sectionId = "none") =>
  ((await request(app).get(`${grid}?classId=${classId}&sectionId=${sectionId}`).set(auth(token))).body.data.days as { day: number; slots: { period: number | null }[] }[]).map(
    (d) => `${d.day}:${d.slots.filter((s) => s.period !== null).length}`
  );

const day = (d: number, slots: object[] = REGULAR_DAY) => ({ day: d, slots });
const holiday = (d: number) => ({ day: d, slots: [] });
/** The first five periods of the usual day (with the lunch where it is): what "five periods" is. */
const FIVE = REGULAR_DAY.slice(0, 6);
/** Four periods from 09:00, no lunch. */
const FOUR = [
  { kind: "period", start: "09:00", end: "09:40" },
  { kind: "period", start: "09:40", end: "10:20" },
  { kind: "period", start: "10:20", end: "11:00" },
  { kind: "period", start: "11:00", end: "11:40" },
];
const cell = (d: number, p: number, subjectId: string) => ({ day: d, period: p, lessons: [{ subjectId }] });

async function department(token: string, name: string, classIds: string[]): Promise<string> {
  return (await request(app).post("/api/v1/academics/departments/assign").set(auth(token)).send({ name, classIds })).body.data.department.id as string;
}

/** The whole school Monday to Saturday with eight periods: Nursery (no sections), Class 1 (no sections), Class 2 with sections A and B. */
async function ready() {
  const s = await timetableSchool();
  const nursery = await addClass(s.token, "Nursery");
  const one = await addClass(s.token, "Class 1");
  const two = await addClass(s.token, "Class 2", ["A", "B"]);
  await putSchool(s.token, { days: [1, 2, 3, 4, 5, 6].map((d) => day(d)) });
  const maths = await addSubject(s.token, "Mathematics");
  await saveAllotments(s.token, { classId: two.id, sectionId: two.sections[0].id }, [{ subjectId: maths, periodsPerWeek: 6 }]);
  await saveAllotments(s.token, { classId: two.id, sectionId: two.sections[1].id }, [{ subjectId: maths, periodsPerWeek: 6 }]);
  return { ...s, nursery: nursery.id, one: one.id, two, a: { classId: two.id, sectionId: two.sections[0].id }, b: { classId: two.id, sectionId: two.sections[1].id }, maths };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a class's own periods in a day", () => {
  it("makes one day of one class shorter and leaves every other class and every other day as the school has them", async () => {
    const r = await ready();
    const res = await put(r.token, { classId: r.nursery, days: [day(1, FIVE)] });
    expect(res.status).toBe(200);
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:5", "2:8", "3:8", "4:8", "5:8", "6:8"]);
    expect(await gridDays(r.token, r.one)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
    // The answer is every timing as it is now: the school's, and the class's own, named after the class.
    const own = res.body.data.items.find((t: { name: string }) => t.name === "Nursery");
    expect(own).toMatchObject({ days: [1], scope: "only", classIds: [r.nursery], departmentId: null, periods: 5 });
    expect(res.body.data.items).toHaveLength(2);
  });

  it("gives the days that have the same rows one timing, and a different day its own", async () => {
    const r = await ready();
    await put(r.token, { classId: r.nursery, days: [day(1, FIVE), day(2, FIVE), day(6, FOUR)] });
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:5", "2:5", "3:8", "4:8", "5:8", "6:4"]);
    const own = (await list(r.token)).filter((t) => t.scope === "only");
    expect(own.map((t) => `${t.name} ${t.days.join(",")} ${t.periods}`)).toEqual(["Nursery 1,2 5", "Nursery - Saturday 6 4"]);
  });

  it("can give a class more periods than the school's day has, after the last one", async () => {
    const r = await ready();
    const ten = [...REGULAR_DAY, { kind: "period", start: "14:20", end: "15:00" }, { kind: "period", start: "15:00", end: "15:40" }];
    expect((await put(r.token, { classId: r.one, days: [day(3, ten)] })).status).toBe(200);
    expect(await gridDays(r.token, r.one)).toEqual(["1:8", "2:8", "3:10", "4:8", "5:8", "6:8"]);
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
  });

  it("a day sent with no rows is a holiday for the class (the school and the other classes still have school), and a day that had none can be given rows", async () => {
    const r = await ready();
    await put(r.token, { classId: r.nursery, days: [holiday(6), day(7, FOUR)] });
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "7:4"]);
    expect(await gridDays(r.token, r.one)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
  });

  it("replaces what the class had of its own: only the days sent are its own, the rest follow the school again", async () => {
    const r = await ready();
    await put(r.token, { classId: r.nursery, days: [day(1, FIVE), day(2, FIVE)] });
    await put(r.token, { classId: r.nursery, days: [day(3, FOUR)] });
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:8", "2:8", "3:4", "4:8", "5:8", "6:8"]);
    expect((await list(r.token)).filter((t) => t.scope === "only")).toHaveLength(1);
  });

  it("no days at all: the class follows the school's timing again, and the school's own timings are left alone", async () => {
    const r = await ready();
    await put(r.token, { classId: r.nursery, days: [day(1, FIVE)] });
    const res = await put(r.token, { classId: r.nursery, days: [] });
    expect(res.status).toBe(200);
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
    expect(res.body.data.items.map((t: { scope: string }) => t.scope)).toEqual(["all"]);
    // Nothing to remove: still fine.
    expect((await put(r.token, { classId: r.nursery, days: [] })).status).toBe(200);
  });

  it("keeps the timings made for other classes, and the class's own do not touch them", async () => {
    const r = await ready();
    await put(r.token, { classId: r.one, days: [day(1, FOUR)] });
    await put(r.token, { classId: r.nursery, days: [day(1, FIVE)] });
    expect(await gridDays(r.token, r.one)).toEqual(["1:4", "2:8", "3:8", "4:8", "5:8", "6:8"]);
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:5", "2:8", "3:8", "4:8", "5:8", "6:8"]);
    // A name taken by another timing of the school is not used twice.
    await request(app).post("/api/v1/timetable/schedules").set(auth(r.token)).send({ name: "Nursery - Saturday", days: [7], scope: "all", slots: FOUR });
    await put(r.token, { classId: r.nursery, days: [day(1, FIVE), day(6, FOUR)] });
    const names = (await list(r.token)).map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("beats the timing of the class's department on the day it names; the other days stay the department's", async () => {
    const r = await ready();
    const pre = await department(r.token, "Pre-Primary", [r.nursery]);
    await putSchool(r.token, { departmentId: pre, days: [1, 2, 3, 4, 5].map((d) => day(d, FOUR)).concat([holiday(6), holiday(7)]) });
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:4", "2:4", "3:4", "4:4", "5:4"]);
    const res = await put(r.token, { classId: r.nursery, days: [day(1, FIVE), day(6, FOUR)] });
    expect(res.status).toBe(200);
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:5", "2:4", "3:4", "4:4", "5:4", "6:4"]);
    // The department's own week is still the department's (and can be saved again: the class's own days do not clash with it).
    expect((await putSchool(r.token, { departmentId: pre, days: [1, 2, 3, 4, 5].map((d) => day(d, FOUR)).concat([holiday(6), holiday(7)]) })).status).toBe(200);
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:5", "2:4", "3:4", "4:4", "5:4", "6:4"]);
  });

  it("refuses a day another timing made for named classes already has for this class, and says which", async () => {
    const r = await ready();
    await request(app).post("/api/v1/timetable/schedules").set(auth(r.token)).send({ name: "Little ones", days: [1], scope: "only", classIds: [r.nursery, r.one], slots: FOUR });
    const res = await put(r.token, { classId: r.nursery, days: [day(1, FIVE)] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHEDULE_CLASH");
    expect(res.body.message).toContain('Nursery already follows "Little ones" on Monday');
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:4", "2:8", "3:8", "4:8", "5:8", "6:8"]);
  });

  it("is limited by the number of timings a school can have, and says so, changing nothing", async () => {
    const r = await ready();
    await put(r.token, { classId: r.nursery, days: [day(1, FIVE)] });
    await BellSchedule.insertMany(
      Array.from({ length: 70 }, (_, i) => ({ tenantId: r.tenantId, name: `Filler ${i}`, nameKey: `filler ${i}`, days: [7], scope: "all", classIds: [], slots: FOUR.map((s) => ({ kind: s.kind, label: "", start: 540, end: 580 })) }))
    );
    const res = await put(r.token, { classId: r.one, days: [day(1, FIVE)] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LIMIT_REACHED");
    // (The fillers are a timing for Sunday, so the class has that day too; Monday is still its own five periods.)
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:5", "2:8", "3:8", "4:8", "5:8", "6:8", "7:4"]);
  });
});

describe("a class's own periods: what is refused", () => {
  it("rows that make no sense, said by the day and box they are about", async () => {
    const r = await ready();
    const res = await put(r.token, { classId: r.nursery, days: [day(1, FIVE), day(2, [{ kind: "period", start: "09:00", end: "08:00" }])] });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path)).toContain("days.1.slots.0.end");
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
  });

  it("a class that is not the school's, a day twice, and a missing class", async () => {
    const r = await ready();
    expect((await put(r.token, { classId: "64b7f0f0f0f0f0f0f0f0f0f0", days: [] })).status).toBe(404);
    expect((await put(r.token, { classId: "not-an-id", days: [] })).status).toBe(400);
    const twice = await put(r.token, { classId: r.nursery, days: [day(1, FIVE), day(1, FOUR)] });
    expect(twice.status).toBe(400);
    expect(twice.body.details.some((d: { message: string }) => /each day once/i.test(d.message))).toBe(true);
    expect((await put(r.token, { classId: r.nursery })).status).toBe(400);
  });

  it("is for a school admin or a principal, not a teacher", async () => {
    const r = await ready();
    const teacher = await addColleague(r.tenantId, "teacher");
    expect((await put(teacher, { classId: r.nursery, days: [] })).status).toBe(403);
    const principal = await addColleague(r.tenantId, "principal");
    expect((await put(principal, { classId: r.nursery, days: [] })).status).toBe(200);
  });
});

describe("a class's own periods when lessons are already in the timetable", () => {
  async function withLessons() {
    const r = await ready();
    // Section A: Monday periods 1, 6 and 8, Tuesday period 7. Section B: Monday period 7.
    await saveGrid(r.token, r.a, [cell(1, 1, r.maths), cell(1, 6, r.maths), cell(1, 8, r.maths), cell(2, 7, r.maths)]);
    await saveGrid(r.token, r.b, [cell(1, 7, r.maths)]);
    return r;
  }
  const cellsOf = async (tenantId: string, classId: string, sectionId: string) =>
    (await Timetable.findOne({ tenantId, classId, sectionId }).lean())?.cells.map((c) => `${c.day}:${c.period}`) ?? [];

  it("will not take periods away from lessons without asking: 409 that says how many lessons, where, and changes nothing", async () => {
    const r = await withLessons();
    const res = await put(r.token, { classId: r.two.id, days: [day(1, FIVE)] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LESSONS_IN_REMOVED_PERIODS");
    expect(res.body.message).toBe("Class 2 has 3 lessons in periods that would no longer be there (Class 2 - A: 2, Class 2 - B: 1).");
    expect(res.body.details).toEqual([{ path: "lessons", message: "Class 2 - A: 2, Class 2 - B: 1", lessons: 3 }]);
    expect(await gridDays(r.token, r.two.id, r.two.sections[0].id)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
    expect(await cellsOf(r.tenantId, r.two.id, r.two.sections[0].id)).toEqual(["1:1", "1:6", "1:8", "2:7"]);
  });

  it("takes those lessons out, and only those, in every section of the class, when asked to", async () => {
    const r = await withLessons();
    const res = await put(r.token, { classId: r.two.id, days: [day(1, FIVE)], removeLessons: true });
    expect(res.status).toBe(200);
    expect(await gridDays(r.token, r.two.id, r.two.sections[0].id)).toEqual(["1:5", "2:8", "3:8", "4:8", "5:8", "6:8"]);
    expect(await cellsOf(r.tenantId, r.two.id, r.two.sections[0].id)).toEqual(["1:1", "2:7"]);
    expect(await cellsOf(r.tenantId, r.two.id, r.two.sections[1].id)).toEqual([]);
  });

  it("says so in the same way for a day that becomes a holiday, and removing a class's own periods (following the school again)", async () => {
    const r = await withLessons();
    const holidayRes = await put(r.token, { classId: r.two.id, days: [holiday(2)] });
    expect(holidayRes.status).toBe(409);
    expect(holidayRes.body.message).toBe("Class 2 has 1 lesson in periods that would no longer be there (Class 2 - A: 1).");
    expect((await put(r.token, { classId: r.two.id, days: [holiday(2)], removeLessons: true })).status).toBe(200);
    expect(await gridDays(r.token, r.two.id, r.two.sections[0].id)).toEqual(["1:8", "3:8", "4:8", "5:8", "6:8"]);

    // Its own Monday has ten periods and a lesson in the ninth; following the school (eight) again loses it.
    const ten = [...REGULAR_DAY, { kind: "period", start: "14:20", end: "15:00" }, { kind: "period", start: "15:00", end: "15:40" }];
    await put(r.token, { classId: r.one, days: [day(1, ten)] });
    await saveGrid(r.token, { classId: r.one, sectionId: null }, [cell(1, 9, r.maths)]);
    const back = await put(r.token, { classId: r.one, days: [] });
    expect(back.status).toBe(409);
    expect(back.body.message).toBe("Class 1 has 1 lesson in periods that would no longer be there.");
    expect((await put(r.token, { classId: r.one, days: [], removeLessons: true })).status).toBe(200);
    expect(await gridDays(r.token, r.one)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
  });

  it("does not touch other classes' lessons, nor lessons in periods that stay", async () => {
    const r = await withLessons();
    await saveGrid(r.token, { classId: r.one, sectionId: null }, [cell(1, 8, r.maths)]);
    expect((await put(r.token, { classId: r.two.id, days: [day(1, FIVE)], removeLessons: true })).status).toBe(200);
    const one = await Timetable.findOne({ tenantId: r.tenantId, classId: r.one }).lean();
    expect(one?.cells.map((c) => `${c.day}:${c.period}`)).toEqual(["1:8"]);
  });

  it("makes more periods without asking anything (nothing is lost)", async () => {
    const r = await withLessons();
    const ten = [...REGULAR_DAY, { kind: "period", start: "14:20", end: "15:00" }, { kind: "period", start: "15:00", end: "15:40" }];
    expect((await put(r.token, { classId: r.two.id, days: [day(1, ten)] })).status).toBe(200);
    expect(await cellsOf(r.tenantId, r.two.id, r.two.sections[0].id)).toEqual(["1:1", "1:6", "1:8", "2:7"]);
  });
});
