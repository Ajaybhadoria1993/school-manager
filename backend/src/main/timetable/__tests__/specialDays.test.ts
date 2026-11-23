import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { schoolDays } from "../../attendance/services/schoolDays";
import { Notification } from "../../notifications/models/Notification";
import { NotificationService } from "../../notifications/services/notification.service";
import { addClass, addTiming, auth, timetableSchool } from "../../../test/timetable";

/**
 * Days with a timing of their own (2026-11-22, user: "kisi date ka time change kar du, aur bata saku jaise PTM hai to kis kis class ka hai"): a date,
 * what the day is, the classes (none: the whole school) and the rows of that day (none: no classes). Today is Tuesday 10 November 2026.
 */
const TODAY = "2026-11-10";
const api = "/api/v1/timetable/special-days";
const HALF_DAY = [
  { kind: "period", start: "08:30", end: "09:10" },
  { kind: "period", start: "09:10", end: "09:50" },
  { kind: "period", start: "09:50", end: "10:30" },
];

async function ready() {
  const s = await timetableSchool();
  await addTiming(s.token);
  const five = await addClass(s.token, "Class 5");
  const six = await addClass(s.token, "Class 6");
  return { ...s, five: five.id, six: six.id };
}

const post = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);
const list = async (token: string) => (await request(app).get(api).set(auth(token))).body.data.items as { id: string; date: string; title: string; classIds: string[]; classNames: string[]; slots: { start: string; end: string }[] }[];

beforeEach(async () => {
  await seedSuperAdmin();
  vi.spyOn(clock, "now").mockReturnValue(new Date(`${TODAY}T09:00:00+05:30`));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("special days: a date with a timing of its own", () => {
  it("saves a PTM for some classes with its hours, and lists it with the names of its classes", async () => {
    const r = await ready();
    const res = await post(r.token, { date: "2026-11-28", title: "PTM", classIds: [r.five], slots: HALF_DAY });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ date: "2026-11-28", title: "PTM", classIds: [r.five], classNames: ["Class 5"] });
    expect(res.body.data.slots.map((s: { start: string }) => s.start)).toEqual(["08:30", "09:10", "09:50"]);
    expect((await list(r.token)).map((d) => d.title)).toEqual(["PTM"]);
  });

  it("can be for the whole school (no classes named), and can have no classes at all that day", async () => {
    const r = await ready();
    const res = await post(r.token, { date: "2026-11-28", title: "Annual day", slots: [] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ classIds: [], classNames: [], slots: [] });
  });

  it("changes it and takes it off", async () => {
    const r = await ready();
    const id = (await post(r.token, { date: "2026-11-28", title: "PTM", classIds: [r.five], slots: HALF_DAY })).body.data.id as string;
    const changed = await request(app).patch(`${api}/${id}`).set(auth(r.token)).send({ date: "2026-11-29", title: "PTM (Class 5 and 6)", classIds: [r.five, r.six], slots: HALF_DAY });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data).toMatchObject({ date: "2026-11-29", classNames: ["Class 5", "Class 6"] });
    expect((await request(app).delete(`${api}/${id}`).set(auth(r.token))).status).toBe(200);
    expect(await list(r.token)).toEqual([]);
  });

  it("refuses two special days of one date that share a class, or one of the whole school and another", async () => {
    const r = await ready();
    expect((await post(r.token, { date: "2026-11-28", title: "PTM", classIds: [r.five], slots: HALF_DAY })).status).toBe(201);
    const same = await post(r.token, { date: "2026-11-28", title: "Sports", classIds: [r.five, r.six], slots: HALF_DAY });
    expect(same.status).toBe(409);
    expect(same.body.code).toBe("SPECIAL_DAY_CLASH");
    expect(same.body.message).toBe("Class 5 already has a special timing on 28 Nov: PTM.");
    expect((await post(r.token, { date: "2026-11-28", title: "Annual day", slots: [] })).status).toBe(409);
    // Another class the same day is fine.
    expect((await post(r.token, { date: "2026-11-28", title: "Sports", classIds: [r.six], slots: HALF_DAY })).status).toBe(201);
  });

  it("refuses a day that is over, another school's class, rows that are not a day, and a missing name", async () => {
    const r = await ready();
    expect((await post(r.token, { date: "2026-11-09", title: "PTM", slots: HALF_DAY })).status).toBe(400);
    expect((await post(r.token, { date: "2026-11-28", title: "PTM", classIds: ["64b64b64b64b64b64b64b64b"], slots: HALF_DAY })).status).toBe(400);
    expect((await post(r.token, { date: "2026-11-28", title: "PTM", slots: [{ kind: "period", start: "09:00", end: "08:00" }] })).status).toBe(400);
    expect((await post(r.token, { date: "2026-11-28", title: "", slots: HALF_DAY })).status).toBe(400);
    expect((await post(r.token, { date: "2026-02-30", title: "PTM", slots: HALF_DAY })).status).toBe(400);
  });

  it("a day of the whole school is read with its own hours; one without classes is like a holiday; one for some classes leaves the school's day", async () => {
    const r = await ready();
    await post(r.token, { date: "2026-11-12", title: "Half day", slots: HALF_DAY });
    await post(r.token, { date: "2026-11-13", title: "Annual day", slots: [] });
    await post(r.token, { date: "2026-11-11", title: "PTM", classIds: [r.five], slots: HALF_DAY });
    const days = await schoolDays(r.tenantId, "2026-11-11", "2026-11-13");
    expect(days[0]).toMatchObject({ working: true, start: 510, end: 860, holiday: null });
    expect(days[1]).toMatchObject({ working: true, start: 510, end: 630, holiday: null });
    expect(days[2]).toMatchObject({ working: false, holiday: "Annual day" });
  });

  it("the school hears it; for the whole school everyone does", async () => {
    const r = await ready();
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: r.tenantId });
    await post(r.token, { date: "2026-11-28", title: "PTM", classIds: [r.five], slots: HALF_DAY });
    await NotificationService.idle();
    const mine = (await request(app).get("/api/v1/notifications").set(auth(r.token))).body.data.items as { kind: string; title: string; body: string }[];
    // The one who set it does not hear it; another admin would. The message is what the school is told.
    const all = await Notification.find({ tenantId: r.tenantId, kind: "timetable.special_day" }).lean();
    expect(mine.filter((n) => n.kind === "timetable.special_day")).toEqual([]);
    expect(all.every((n) => n.title === "PTM on 28 Nov")).toBe(true);
  });

  // 2026-11-23, user: "3-4 din roj chale, jaise 3 se 6 tak".
  it("can cover several days in a row: from the first to the last, both included", async () => {
    const r = await ready();
    const res = await post(r.token, { date: "2026-12-03", endDate: "2026-12-06", title: "Sports week", classIds: [r.five], slots: HALF_DAY });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ date: "2026-12-03", endDate: "2026-12-06" });
    // One day has its first day as its last.
    expect((await post(r.token, { date: "2026-11-28", title: "PTM", classIds: [r.six], slots: HALF_DAY })).body.data.endDate).toBe("2026-11-28");
    // A day inside the days in a row is taken for that class.
    const inside = await post(r.token, { date: "2026-12-05", title: "PTM", classIds: [r.five], slots: HALF_DAY });
    expect(inside.status).toBe(409);
    expect(inside.body.message).toBe("Class 5 already has a special timing from 3 Dec to 6 Dec: Sports week.");
  });

  it("refuses a last day before the first, and more than 31 days in a row", async () => {
    const r = await ready();
    expect((await post(r.token, { date: "2026-12-06", endDate: "2026-12-03", title: "Sports week", slots: HALF_DAY })).status).toBe(400);
    expect((await post(r.token, { date: "2026-12-01", endDate: "2027-01-05", title: "Winter timing", slots: HALF_DAY })).status).toBe(400);
    expect((await post(r.token, { date: "2026-12-01", endDate: "2026-12-31", title: "Winter timing", slots: HALF_DAY })).status).toBe(201);
  });

  it("every day of days in a row of the whole school is read with its hours; days that have begun keep their first day when changed", async () => {
    const r = await ready();
    const id = (await post(r.token, { date: TODAY, endDate: "2026-11-12", title: "Half days", slots: HALF_DAY })).body.data.id as string;
    const days = await schoolDays(r.tenantId, "2026-11-10", "2026-11-13");
    expect(days.map((d) => d.end)).toEqual([630, 630, 630, 860]);
    // The next day: the days have begun; changing the last day keeps the first.
    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-11T09:00:00+05:30"));
    const changed = await request(app).patch(`${api}/${id}`).set(auth(r.token)).send({ date: TODAY, endDate: "2026-11-13", title: "Half days", slots: HALF_DAY });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data).toMatchObject({ date: TODAY, endDate: "2026-11-13" });
    // Once all of them are over, they stay as they were.
    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-14T09:00:00+05:30"));
    expect((await request(app).delete(`${api}/${id}`).set(auth(r.token))).status).toBe(409);
  });

  it("is for the people who make the timetable, and another school cannot see or change it", async () => {
    const r = await ready();
    const id = (await post(r.token, { date: "2026-11-28", title: "PTM", classIds: [r.five], slots: HALF_DAY })).body.data.id as string;
    const moon = await timetableSchool("Moonrise Public School");
    expect(await list(moon.token)).toEqual([]);
    expect((await request(app).patch(`${api}/${id}`).set(auth(moon.token)).send({ date: "2026-11-28", title: "Hacked", slots: HALF_DAY })).status).toBe(404);
    expect((await request(app).delete(`${api}/${id}`).set(auth(moon.token))).status).toBe(404);
    expect((await list(r.token)).map((d) => d.title)).toEqual(["PTM"]);
  });
});
