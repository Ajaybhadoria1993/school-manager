import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addClass, auth, REGULAR_DAY, timetableSchool } from "../../../test/timetable";

/**
 * The winter shift (2026-11-17): school starts an hour later, so the lunch and the timings of the classes and departments that keep hours of
 * their own move with it. It is one save: `PUT /timetable/school-day { days, shiftOthers }` (minutes, whole school only). Everything is checked
 * before anything is written, so a timing that would go past midnight stops the whole save.
 */

const schoolDay = "/api/v1/timetable/school-day";
const classDay = "/api/v1/timetable/class-day";
const put = (token: string, body: object) => request(app).put(schoolDay).set(auth(token)).send(body);
const day = (d: number, slots: object[] = REGULAR_DAY) => ({ day: d, slots });
const week = (slots: object[] = REGULAR_DAY) => [1, 2, 3, 4, 5, 6].map((d) => day(d, slots));

/** The usual day moved by an hour (08:30 becomes 09:30, lunch 10:30 becomes 11:30). */
const LATER = REGULAR_DAY.map((s) => ({ ...s, start: plus(s.start, 60), end: plus(s.end, 60) }));
function plus(clock: string, minutes: number): string {
  const [h, m] = clock.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const SHORT = [
  { kind: "period", start: "09:00", end: "09:40" },
  { kind: "period", start: "09:40", end: "10:20" },
  { kind: "lunch", start: "10:20", end: "10:50" },
  { kind: "period", start: "10:50", end: "11:30" },
];

type Listed = { id: string; name: string; days: number[]; scope: string; classIds: string[]; departmentId: string | null; slots: { kind: string; start: string; end: string }[] };
const list = async (token: string) => (await request(app).get("/api/v1/timetable/schedules").set(auth(token))).body.data.items as Listed[];
const starts = (t: Listed) => `${t.slots[0].start}-${t.slots[t.slots.length - 1].end}`;

async function ready() {
  const s = await timetableSchool();
  const nursery = await addClass(s.token, "Nursery");
  const one = await addClass(s.token, "Class 1");
  await put(s.token, { days: week() });
  const pre = (await request(app).post("/api/v1/academics/departments/assign").set(auth(s.token)).send({ name: "Pre-Primary", classIds: [nursery.id] })).body.data.department.id as string;
  // Pre-Primary keeps a shorter day (Monday to Friday); Class 1 keeps hours of its own.
  await put(s.token, { departmentId: pre, days: [1, 2, 3, 4, 5].map((d) => day(d, SHORT)) });
  await request(app).put(classDay).set(auth(s.token)).send({ classId: one.id, days: [1, 2, 3, 4, 5].map((d) => day(d, SHORT.map((x) => ({ ...x, start: plus(x.start, -30), end: plus(x.end, -30) })))) });
  return { ...s, nursery: nursery.id, one: one.id, pre };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("shiftOthers: the timings of the classes and departments move with the school", () => {
  it("moves a department's timing and a class's own timing by the same minutes as the school's start, in the same save", async () => {
    const r = await ready();
    const before = await list(r.token);
    expect(before.filter((t) => t.departmentId === r.pre).map(starts)).toEqual(["09:00-11:30"]);
    expect(before.filter((t) => t.classIds.join() === r.one && !t.departmentId).map(starts)).toEqual(["08:30-11:00"]);

    const res = await put(r.token, { days: week(LATER), shiftOthers: 60 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = await list(r.token);
    // The school's week is exactly what was sent; the department and the class moved an hour, rows and lunch together.
    expect(after.find((t) => t.scope === "all")?.slots.map((s) => s.start)).toEqual(LATER.map((s) => s.start));
    expect(after.filter((t) => t.departmentId === r.pre).map(starts)).toEqual(["10:00-12:30"]);
    expect(after.filter((t) => t.departmentId === r.pre)[0].slots.map((s) => `${s.kind} ${s.start}`)).toEqual(["period 10:00", "period 10:40", "lunch 11:20", "period 11:50"]);
    expect(after.filter((t) => t.classIds.join() === r.one && !t.departmentId).map(starts)).toEqual(["09:30-12:00"]);
  });

  it("moves them earlier too (a negative number)", async () => {
    const r = await ready();
    const res = await put(r.token, { days: week(REGULAR_DAY.map((s) => ({ ...s, start: plus(s.start, -30), end: plus(s.end, -30) }))), shiftOthers: -30 });
    expect(res.status).toBe(200);
    expect((await list(r.token)).filter((t) => t.departmentId === r.pre).map(starts)).toEqual(["08:30-11:00"]);
  });

  it("without it (or with 0) the other timings stay where they are", async () => {
    const r = await ready();
    await put(r.token, { days: week(LATER) });
    await put(r.token, { days: week(LATER), shiftOthers: 0 });
    const after = await list(r.token);
    expect(after.filter((t) => t.departmentId === r.pre).map(starts)).toEqual(["09:00-11:30"]);
    expect(after.filter((t) => t.classIds.join() === r.one && !t.departmentId).map(starts)).toEqual(["08:30-11:00"]);
  });

  it("keeps the number of periods of every class: only their hours moved", async () => {
    const r = await ready();
    const grid = async (classId: string) => ((await request(app).get(`/api/v1/timetable/grid?classId=${classId}&sectionId=none`).set(auth(r.token))).body.data.days as { day: number; slots: { period: number | null }[] }[]).map((d) => d.slots.filter((s) => s.period !== null).length);
    const before = { nursery: await grid(r.nursery), one: await grid(r.one) };
    expect((await put(r.token, { days: week(LATER), shiftOthers: 60 })).status).toBe(200);
    expect({ nursery: await grid(r.nursery), one: await grid(r.one) }).toEqual(before);
  });

  it("refuses the whole save when a timing would go past midnight, and changes nothing", async () => {
    const r = await ready();
    // Class 1 has hours of its own that end at 11:00; moving by 15 hours takes them past midnight.
    const res = await put(r.token, { days: week(LATER), shiftOthers: 720 + 60 });
    expect(res.status).toBe(400);
    const after = await list(r.token);
    expect(after.find((t) => t.scope === "all")?.slots[0].start).toBe("08:30");
    expect(after.filter((t) => t.departmentId === r.pre).map(starts)).toEqual(["09:00-11:30"]);
  });

  it("names the timing that would go past midnight", async () => {
    const r = await ready();
    await request(app)
      .put(classDay)
      .set(auth(r.token))
      .send({ classId: r.one, days: [1, 2, 3, 4, 5].map((d) => day(d, [{ kind: "period", start: "20:00", end: "20:40" }])) });
    const res = await put(r.token, { days: week(LATER), shiftOthers: 240 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Class 1/);
    expect(JSON.stringify(res.body)).toMatch(/midnight/);
  });

  it("is for the whole school: a department's own save cannot carry it", async () => {
    const r = await ready();
    const res = await put(r.token, { departmentId: r.pre, days: [1, 2, 3, 4, 5].map((d) => day(d, SHORT)), shiftOthers: 60 });
    expect(res.status).toBe(400);
  });

  // 2026-11-22, user: a tick beside each timing on the School timings page; only the ticked ones move ("check na kare to time nahi badhega").
  it("shiftOnly moves only the timings it names; the others stay where they are", async () => {
    const r = await ready();
    const pre = (await list(r.token)).filter((t) => t.departmentId === r.pre).map((t) => t.id);
    const res = await put(r.token, { days: week(LATER), shiftOthers: 60, shiftOnly: pre });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = await list(r.token);
    expect(after.filter((t) => t.departmentId === r.pre).map(starts)).toEqual(["10:00-12:30"]);
    expect(after.filter((t) => t.classIds.join() === r.one && !t.departmentId).map(starts)).toEqual(["08:30-11:00"]);
  });

  it("shiftOnly with no timing moves none of them; a timing it names that is not another of the school's is not moved", async () => {
    const r = await ready();
    expect((await put(r.token, { days: week(LATER), shiftOthers: 60, shiftOnly: [] })).status).toBe(200);
    expect((await put(r.token, { days: week(LATER), shiftOthers: 60, shiftOnly: ["5f0000000000000000000000"] })).status).toBe(200);
    const after = await list(r.token);
    expect(after.filter((t) => t.departmentId === r.pre).map(starts)).toEqual(["09:00-11:30"]);
    expect(after.filter((t) => t.classIds.join() === r.one && !t.departmentId).map(starts)).toEqual(["08:30-11:00"]);
  });

  it("a timing past midnight that is not moved does not stop the save", async () => {
    const r = await ready();
    const pre = (await list(r.token)).filter((t) => t.departmentId === r.pre).map((t) => t.id);
    // Ten hours earlier both Pre-Primary (09:00) and Class 1 (08:30) would start before 00:00: refused only when one of them is to move.
    const res = await put(r.token, { days: week(LATER), shiftOthers: -600, shiftOnly: [] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await put(r.token, { days: week(LATER), shiftOthers: -600, shiftOnly: pre })).status).toBe(400);
  });

  it("shiftOnly is a list of timing ids", async () => {
    const r = await ready();
    expect((await put(r.token, { days: week(LATER), shiftOthers: 60, shiftOnly: ["nope"] })).status).toBe(400);
  });

  it("must be a whole number of minutes, not more than twelve hours either way", async () => {
    const r = await ready();
    expect((await put(r.token, { days: week(LATER), shiftOthers: 30.5 })).status).toBe(400);
    expect((await put(r.token, { days: week(LATER), shiftOthers: 721 })).status).toBe(400);
  });
});
