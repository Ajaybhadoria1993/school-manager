import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague } from "../../../test/schools";
import { addClass, addSubject, addTeacher, addTiming, auth, REGULAR_DAY, saveAllotments, timetableSchool } from "../../../test/timetable";

const api = "/api/v1/timetable/school-day";
const put = (token: string, body: object) => request(app).put(api).set(auth(token)).send(body);
const list = async (token: string) =>
  (await request(app).get("/api/v1/timetable/schedules").set(auth(token))).body.data.items as { name: string; days: number[]; scope: string; periods: number; slots: unknown[] }[];

/** A short Saturday: four periods, no lunch. */
const SHORT_DAY = REGULAR_DAY.filter((s) => s.kind === "period").slice(0, 4);
const day = (d: number, slots: object[] = REGULAR_DAY) => ({ day: d, slots });

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the school day: one save for every day of the week", () => {
  it("makes one timing of the days that are the same, and one for a day that is different; a day not sent is a holiday", async () => {
    const s = await timetableSchool();
    const res = await put(s.token, { days: [day(1), day(2), day(3), day(4), day(5), day(6, SHORT_DAY)] });
    expect(res.status).toBe(200);
    const items = await list(s.token);
    expect(items).toHaveLength(2);
    expect(items.find((t) => t.days.length === 5)).toMatchObject({ name: "Regular", days: [1, 2, 3, 4, 5], scope: "all", periods: 8 });
    expect(items.find((t) => t.days.length === 1)).toMatchObject({ name: "Saturday", days: [6], scope: "all", periods: 4 });
    expect(res.body.data.items).toHaveLength(2);
  });

  it("joins days that end up the same, and replaces what was there instead of adding to it", async () => {
    const s = await timetableSchool();
    await put(s.token, { days: [day(1), day(2), day(3), day(4), day(5), day(6, SHORT_DAY)] });
    // Saturday is now a full day like the others.
    expect((await put(s.token, { days: [1, 2, 3, 4, 5, 6].map((d) => day(d)) })).status).toBe(200);
    const items = await list(s.token);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Regular", days: [1, 2, 3, 4, 5, 6] });
  });

  it("keeps the name of the school's usual timing", async () => {
    const s = await timetableSchool();
    await addTiming(s.token, { name: "Main day" });
    await put(s.token, { days: [day(1), day(2), day(3), day(4), day(5), day(6, SHORT_DAY)] });
    expect((await list(s.token)).map((t) => t.name).sort()).toEqual(["Main day", "Saturday"]);
  });

  it("leaves a timing made for some classes as it is", async () => {
    const s = await timetableSchool();
    const nursery = await addClass(s.token, "Nursery");
    await addTiming(s.token, { name: "Little ones", scope: "only", classIds: [nursery.id], days: [1, 2, 3, 4, 5], slots: SHORT_DAY });
    expect((await put(s.token, { days: [1, 2, 3, 4, 5].map((d) => day(d)) })).status).toBe(200);
    const items = await list(s.token);
    expect(items.map((t) => t.name).sort()).toEqual(["Little ones", "Regular"]);
    expect(items.find((t) => t.name === "Little ones")).toMatchObject({ scope: "only", periods: 4 });
  });

  it("refuses a change that would leave lessons without a period, says where, and changes nothing", async () => {
    const s = await timetableSchool();
    const klass = await addClass(s.token, "Class 5", ["A"]);
    await addTiming(s.token, { days: [1, 2, 3, 4, 5, 6] });
    const maths = await addSubject(s.token, "Mathematics");
    const teacherId = await addTeacher(s.token, "Meena Singh");
    const unit = { classId: klass.id, sectionId: klass.sections[0].id };
    await saveAllotments(s.token, unit, [{ subjectId: maths, periodsPerWeek: 6, teacherId }]);
    await request(app).put("/api/v1/timetable/grid").set(auth(s.token)).send({ ...unit, cells: [{ day: 6, period: 7, lessons: [{ subjectId: maths }] }] });

    const res = await put(s.token, { days: [day(1), day(2), day(3), day(4), day(5), day(6, SHORT_DAY)] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHEDULE_IN_USE");
    expect(res.body.message).toContain("Class 5 - A, Saturday period 7");
    const items = await list(s.token);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Regular", days: [1, 2, 3, 4, 5, 6], periods: 8 });
  });

  it("says which box is wrong, by day", async () => {
    const s = await timetableSchool();
    const res = await put(s.token, { days: [day(1, [{ kind: "period", start: "08:30", end: "08:35" }])] });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: "days.0.slots.0.end", message: "A period lasts 10 to 120 minutes" }]);
  });

  it("needs at least one school day, each day once", async () => {
    const s = await timetableSchool();
    expect((await put(s.token, { days: [] })).status).toBe(400);
    expect((await put(s.token, { days: [day(1), day(1)] })).status).toBe(400);
    expect((await put(s.token, { days: [day(8)] })).status).toBe(400);
  });

  it("does not let a school-wide day clash with a timing for all classes but some", async () => {
    const s = await timetableSchool();
    const nursery = await addClass(s.token, "Nursery");
    await addTiming(s.token, { name: "Big ones", scope: "except", classIds: [nursery.id], days: [6], slots: SHORT_DAY });
    const res = await put(s.token, { days: [day(1), day(6)] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHEDULE_CLASH");
  });

  it("is for the school admin and the principal; a teacher may not", async () => {
    const s = await timetableSchool();
    const principal = await addColleague(s.tenantId, "principal");
    const teacher = await addColleague(s.tenantId, "teacher");
    expect((await put(principal, { days: [day(1)] })).status).toBe(200);
    expect((await put(teacher, { days: [day(1)] })).status).toBe(403);
    expect((await request(app).put(api).send({ days: [day(1)] })).status).toBe(401);
  });

  it("changes only this school's timings", async () => {
    const a = await timetableSchool("Sunrise Public School");
    const b = await timetableSchool("Moonlight Academy");
    await addTiming(a.token);
    expect((await put(b.token, { days: [day(6, SHORT_DAY)] })).status).toBe(200);
    expect(await list(a.token)).toEqual([expect.objectContaining({ name: "Regular", days: [1, 2, 3, 4, 5], periods: 8 })]);
    expect(await list(b.token)).toEqual([expect.objectContaining({ name: "Regular", days: [6], periods: 4 })]);
  });
});
