import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague } from "../../../test/schools";
import { addClass, addSubject, addTeacher, auth, REGULAR_DAY, saveAllotments, timetableSchool } from "../../../test/timetable";
import { BellSchedule } from "../models/BellSchedule";

const api = "/api/v1/timetable/school-day";
const put = (token: string, body: object) => request(app).put(api).set(auth(token)).send(body);
const remove = (token: string, departmentId: string) => request(app).delete(`${api}/${departmentId}`).set(auth(token));
const list = async (token: string) =>
  (await request(app).get("/api/v1/timetable/schedules").set(auth(token))).body.data.items as { name: string; days: number[]; scope: string; classIds: string[]; departmentId: string | null; periods: number }[];
const gridDays = async (token: string, classId: string) =>
  ((await request(app).get(`/api/v1/timetable/grid?classId=${classId}&sectionId=none`).set(auth(token))).body.data.days as { day: number; slots: { period: number | null }[] }[]).map(
    (d) => `${d.day}:${d.slots.filter((s) => s.period !== null).length}`
  );

/** The little ones: four periods of 40 minutes from 09:00, no lunch. */
const SHORT = [
  { kind: "period", start: "09:00", end: "09:40" },
  { kind: "period", start: "09:40", end: "10:20" },
  { kind: "period", start: "10:20", end: "11:00" },
  { kind: "period", start: "11:00", end: "11:40" },
];
const day = (d: number, slots: object[] = REGULAR_DAY) => ({ day: d, slots });
const holiday = (d: number) => ({ day: d, slots: [] });
/** Pre-Primary: Monday to Friday short days, Saturday and Sunday off. */
const preWeek = (departmentId: string) => ({ departmentId, days: [1, 2, 3, 4, 5].map((d) => day(d, SHORT)).concat([holiday(6), holiday(7)]) });

async function department(token: string, name: string, classIds: string[]): Promise<string> {
  return (await request(app).post("/api/v1/academics/departments/assign").set(auth(token)).send({ name, classIds })).body.data.department.id as string;
}

/** The whole school Monday to Saturday (eight periods); Nursery in Pre-Primary, Class 1 in no department. */
async function ready() {
  const s = await timetableSchool();
  const nursery = await addClass(s.token, "Nursery");
  const one = await addClass(s.token, "Class 1");
  await put(s.token, { days: [1, 2, 3, 4, 5, 6].map((d) => day(d)) });
  const pre = await department(s.token, "Pre-Primary", [nursery.id]);
  return { ...s, nursery: nursery.id, one: one.id, pre };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a department's own timing", () => {
  it("is followed by the department's classes, every day of their week, holidays included; the other classes keep the school's", async () => {
    const r = await ready();
    const res = await put(r.token, preWeek(r.pre));
    expect(res.status).toBe(200);
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:4", "2:4", "3:4", "4:4", "5:4"]);
    expect(await gridDays(r.token, r.one)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
  });

  it("is listed with its department and the department's classes, named after it", async () => {
    const r = await ready();
    await put(r.token, preWeek(r.pre));
    const own = (await list(r.token)).filter((t) => t.departmentId === r.pre);
    expect(own.map((t) => `${t.name} ${t.days.join(",")} ${t.periods}`).sort()).toEqual(["Pre-Primary - holiday 6,7 0", "Pre-Primary 1,2,3,4,5 4"]);
    expect(own.every((t) => t.scope === "only" && t.classIds.join() === r.nursery)).toBe(true);
  });

  it("follows the department: a class put in it later takes its timing", async () => {
    const r = await ready();
    await put(r.token, preWeek(r.pre));
    const lkg = await addClass(r.token, "LKG");
    await request(app).post(`/api/v1/academics/departments/${r.pre}/classes`).set(auth(r.token)).send({ classIds: [lkg.id] });
    expect(await gridDays(r.token, lkg.id)).toEqual(["1:4", "2:4", "3:4", "4:4", "5:4"]);
  });

  it("is replaced when saved again, and a save of the whole school leaves it alone", async () => {
    const r = await ready();
    await put(r.token, preWeek(r.pre));
    await put(r.token, { departmentId: r.pre, days: [1, 2, 3, 4, 5, 6, 7].map((d) => day(d, SHORT)) });
    expect((await list(r.token)).filter((t) => t.departmentId === r.pre).map((t) => t.days.join(","))).toEqual(["1,2,3,4,5,6,7"]);
    await put(r.token, { days: [1, 2, 3, 4, 5].map((d) => day(d)) });
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:4", "2:4", "3:4", "4:4", "5:4", "6:4", "7:4"]);
  });

  it("can be taken away: the department follows the school again", async () => {
    const r = await ready();
    await put(r.token, preWeek(r.pre));
    const res = await remove(r.token, r.pre);
    expect(res.status).toBe(200);
    expect((await list(r.token)).some((t) => t.departmentId === r.pre)).toBe(false);
    expect(await gridDays(r.token, r.nursery)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8"]);
  });

  it("will not leave a lesson without its period, in a save or when taken away", async () => {
    const r = await ready();
    const maths = await addSubject(r.token, "Mathematics");
    const teacherId = await addTeacher(r.token, "Meena Singh");
    const unit = { classId: r.nursery, sectionId: null };
    await saveAllotments(r.token, unit, [{ subjectId: maths, periodsPerWeek: 6, teacherId }]);
    // A lesson on Saturday, period 8, under the school's timing.
    await request(app).put("/api/v1/timetable/grid").set(auth(r.token)).send({ ...unit, cells: [{ day: 6, period: 8, lessons: [{ subjectId: maths }] }] });
    const res = await put(r.token, preWeek(r.pre));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHEDULE_IN_USE");
    expect(res.body.message).toContain("Nursery, Saturday period 8");

    // Under its own timing, a lesson in period 4: taking the timing away keeps it (the school's day has a period 4) ...
    await request(app).put("/api/v1/timetable/grid").set(auth(r.token)).send({ ...unit, cells: [] });
    await put(r.token, { departmentId: r.pre, days: [1, 2, 3, 4, 5, 6, 7].map((d) => day(d, SHORT)) });
    await request(app).put("/api/v1/timetable/grid").set(auth(r.token)).send({ ...unit, cells: [{ day: 7, period: 4, lessons: [{ subjectId: maths }] }] });
    // ... but not on Sunday, which the school does not have.
    const away = await remove(r.token, r.pre);
    expect(away.status).toBe(409);
    expect(away.body.code).toBe("SCHEDULE_IN_USE");
  });

  it("needs a day with periods, and says which box is wrong by day", async () => {
    const r = await ready();
    expect((await put(r.token, { departmentId: r.pre, days: [1, 2, 3, 4, 5, 6, 7].map(holiday) })).status).toBe(400);
    const res = await put(r.token, { departmentId: r.pre, days: [day(1, [{ kind: "period", start: "09:00", end: "09:05" }])] });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: "days.0.slots.0.end", message: "A period lasts 10 to 120 minutes" }]);
  });

  it("is only for a department of this school", async () => {
    const r = await ready();
    const other = await timetableSchool("Moonlight Academy");
    const theirs = await department(other.token, "Primary", []);
    expect((await put(r.token, preWeek(theirs))).status).toBe(404);
    expect((await remove(r.token, theirs)).status).toBe(404);
    expect((await put(r.token, preWeek("64b7f0c2a1b2c3d4e5f60718"))).status).toBe(404);
  });

  it("is kept when a class is deleted, and goes with its department", async () => {
    const r = await ready();
    await put(r.token, preWeek(r.pre));
    const lkg = await addClass(r.token, "LKG");
    await request(app).delete(`/api/v1/academics/classes/${lkg.id}`).set(auth(r.token));
    expect(await BellSchedule.countDocuments({ tenantId: r.tenantId, departmentId: r.pre })).toBe(2);
    await request(app).delete(`/api/v1/academics/departments/${r.pre}`).set(auth(r.token));
    expect(await BellSchedule.countDocuments({ tenantId: r.tenantId, departmentId: r.pre })).toBe(0);
  });

  it("is not changed or deleted one timing at a time (only as the department's week)", async () => {
    const r = await ready();
    await put(r.token, preWeek(r.pre));
    const own = (await list(r.token)).find((t) => t.departmentId === r.pre)! as unknown as { id: string };
    const patched = await request(app).patch(`/api/v1/timetable/schedules/${own.id}`).set(auth(r.token)).send({ name: "Mine" });
    expect(patched.status).toBe(409);
    expect(patched.body.code).toBe("SCHEDULE_OF_DEPARTMENT");
    expect((await request(app).delete(`/api/v1/timetable/schedules/${own.id}`).set(auth(r.token))).status).toBe(409);
  });

  it("is for the school admin and the principal", async () => {
    const r = await ready();
    const teacher = await addColleague(r.tenantId, "teacher");
    expect((await put(teacher, preWeek(r.pre))).status).toBe(403);
    expect((await remove(teacher, r.pre)).status).toBe(403);
  });
});
