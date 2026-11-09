import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { addTeacher, addTiming, auth } from "../../../test/timetable";

/**
 * Teachers' attendance (2026-11-06): a teacher marks themselves present in the app (the time is kept); a teacher who has not by the time
 * school ends is absent, nobody has to mark it; the school reads the sheet for any days. Time is set with the clock seam, never waited
 * for. 5 Nov 2026 is a Thursday; the school runs Monday to Friday, 8:30 AM to 2:20 PM (test/timetable.ts REGULAR_DAY).
 */

const api = "/api/v1/attendance";
const THU = "2026-11-05";
const FRI = "2026-11-06";
const SAT = "2026-11-07";
const SUN = "2026-11-08";

/** The clock set to a time of an Indian day: at("2026-11-05", "09:00"). */
const at = (day: string, hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));

async function setUp(withTiming = true) {
  const s = await classroomSchool();
  if (withTiming) await addTiming(s.token);
  // Every teacher joined at the start of the year, so the days asked about count (a teacher is not absent before they joined).
  for (const id of [s.meena, s.dev, s.kiran]) await request(app).patch(`/api/v1/staff/teachers/${id}`).set(auth(s.token)).send({ joiningDate: "2026-04-01" });
  const present = (token: string) => request(app).post(`${api}/teachers/me/present`).set(auth(token));
  const mine = (token: string, date?: string) => request(app).get(`${api}/teachers/me${date ? `?date=${date}` : ""}`).set(auth(token));
  const sheet = (token: string, from: string, to: string) => request(app).get(`${api}/teachers?from=${from}&to=${to}`).set(auth(token));
  const row = (res: request.Response, teacherId: string) => (res.body.data.teachers as { id: string; records: Record<string, unknown>[]; tally: Record<string, number | null> }[]).find((t) => t.id === teacherId)!;
  return { s, present, mine, sheet, row };
}

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => vi.restoreAllMocks());

describe("a teacher marks themselves present", () => {
  it("before school starts: Present, with the time kept (08:10), not late", async () => {
    const { s, present } = await setUp();
    at(THU, "08:10");
    const res = await present(s.tokens.meena);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ date: THU, status: "present", checkedInTime: "08:10", lateByMinutes: 0, alreadyMarked: false, canCheckIn: false });
    expect(res.body.data.log).toHaveLength(1);
    expect(res.body.data.log[0]).toMatchObject({ time: "08:10", action: "checked_in", by: { name: "Meena Singh", role: "teacher" } });
  });

  it("after school starts: Late, and how many minutes late (school starts at 8:30)", async () => {
    const { s, present } = await setUp();
    at(THU, "09:00");
    const res = await present(s.tokens.dev);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "late", checkedInTime: "09:00", lateByMinutes: 30 });
    at(THU, "08:30");
    expect((await present(s.tokens.kiran)).body.data).toMatchObject({ status: "present", lateByMinutes: 0 }); // on the minute is not late
  });

  it("marking again the same day changes nothing: the first time stays, the answer says it was already marked", async () => {
    const { s, present } = await setUp();
    at(THU, "08:10");
    await present(s.tokens.meena);
    at(THU, "10:00");
    const again = await present(s.tokens.meena);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ checkedInTime: "08:10", status: "present", alreadyMarked: true });
    expect(again.body.data.log).toHaveLength(1);
  });

  it("after school has ended it is refused: the teacher is absent for the day", async () => {
    const { s, present, mine } = await setUp();
    at(THU, "14:20");
    const late = await present(s.tokens.meena);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("SCHOOL_TIME_OVER");
    expect((await mine(s.tokens.meena)).body.data.status).toBe("absent");
    at(THU, "14:19");
    expect((await present(s.tokens.meena)).status).toBe(201); // the last minute still counts
  });

  it("not on a holiday, not on a day the school does not run, not on the teacher's own off day", async () => {
    const { s, present } = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: THU });
    at(THU, "08:10");
    const holiday = await present(s.tokens.meena);
    expect(holiday.status).toBe(409);
    expect(holiday.body.code).toBe("NOT_A_WORKING_DAY");
    expect(holiday.body.message).toContain("Diwali");

    at(SAT, "08:10");
    const saturday = await present(s.tokens.meena);
    expect(saturday.status).toBe(409);
    expect(saturday.body.code).toBe("NOT_A_WORKING_DAY");

    // Friday is a school day, but Dev does not come on Fridays (his own off day).
    await request(app).patch(`/api/v1/staff/teachers/${s.dev}`).set(auth(s.token)).send({ offDays: [5] });
    at(FRI, "08:10");
    expect((await present(s.tokens.dev)).body.code).toBe("NOT_A_WORKING_DAY");
    expect((await present(s.tokens.meena)).status).toBe(201);
  });

  it("with no school timing set: a weekday works (no lateness can be known), a Sunday does not", async () => {
    const { s, present } = await setUp(false);
    at(THU, "11:45");
    const res = await present(s.tokens.meena);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ status: "present", checkedInTime: "11:45", lateByMinutes: null });
    at(SUN, "09:00");
    expect((await present(s.tokens.dev)).body.code).toBe("NOT_A_WORKING_DAY");
  });

  it("only a teacher marks themselves: the school, a parent and a stranger cannot; a teacher whose login is closed cannot", async () => {
    const { s, present } = await setUp();
    at(THU, "08:10");
    expect((await present(s.token)).status).toBe(403);
    expect((await present(s.tokens.ravi)).status).toBe(403);
    expect((await request(app).post(`${api}/teachers/me/present`)).status).toBe(401);
    expect((await present(await addColleague(s.tenantId, "principal"))).status).toBe(403);
    await request(app).patch(`/api/v1/staff/teachers/${s.kiran}`).set(auth(s.token)).send({ isActive: false });
    const closed = await present(s.tokens.kiran);
    expect(closed.status).toBe(403);
    expect(closed.body.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("a teacher's own day", () => {
  it("before they mark: Not yet, they can mark; after: Present with the time; the school's hours are told", async () => {
    const { s, present, mine } = await setUp();
    at(THU, "08:00");
    expect((await mine(s.tokens.meena)).body.data).toMatchObject({ date: THU, status: "pending", canCheckIn: true, school: { start: "08:30", end: "14:20" }, checkedInTime: null });
    await present(s.tokens.meena);
    expect((await mine(s.tokens.meena)).body.data).toMatchObject({ status: "present", checkedInTime: "08:00", canCheckIn: false });
  });

  it("a holiday, a day off and a school that has ended say so, with why they cannot mark", async () => {
    const { s, mine } = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: THU });
    at(THU, "09:00");
    expect((await mine(s.tokens.meena)).body.data).toMatchObject({ status: "holiday", canCheckIn: false, why: "Holiday: Diwali" });
    at(SAT, "09:00");
    expect((await mine(s.tokens.meena)).body.data).toMatchObject({ status: "off", canCheckIn: false });
    at(FRI, "15:00");
    expect((await mine(s.tokens.meena)).body.data).toMatchObject({ status: "absent", canCheckIn: false, why: "School time is over" });
  });

  it("an earlier day can be read (what was marked, or absent), never marked", async () => {
    const { s, present, mine } = await setUp();
    at(THU, "09:15");
    await present(s.tokens.meena);
    at(FRI, "09:00");
    const yesterday = await mine(s.tokens.meena, THU);
    expect(yesterday.body.data).toMatchObject({ date: THU, status: "late", checkedInTime: "09:15", lateByMinutes: 45, canCheckIn: false });
    expect((await mine(s.tokens.dev, THU)).body.data.status).toBe("absent");
  });

  it("is only for a teacher", async () => {
    const { s, mine } = await setUp();
    expect((await mine(s.token)).status).toBe(403);
    expect((await mine(s.tokens.ravi)).status).toBe(403);
  });
});

describe("the school's sheet of the teachers", () => {
  it("every teacher, every day of the range: who came and when, who was late, who was absent, the days off", async () => {
    const { s, present, sheet, row } = await setUp();
    at("2026-11-02", "08:00");
    await present(s.tokens.meena); // Monday: on time
    at("2026-11-03", "09:30");
    await present(s.tokens.meena); // Tuesday: 60 minutes late
    at("2026-11-04", "08:20");
    await present(s.tokens.dev);
    at(FRI, "16:00"); // Friday evening: the week is over
    const res = await sheet(s.token, "2026-11-02", FRI);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.days.map((d: { date: string; weekday: number; working: boolean; holiday: string | null }) => [d.date, d.weekday, d.working, d.holiday])).toEqual([
      ["2026-11-02", 1, true, null],
      ["2026-11-03", 2, true, null],
      ["2026-11-04", 3, true, null],
      ["2026-11-05", 4, true, null],
      ["2026-11-06", 5, true, null],
    ]);
    const meena = row(res, s.meena);
    expect(meena.records.map((r) => [r.date, r.status, r.checkedInTime, r.lateByMinutes])).toEqual([
      ["2026-11-02", "present", "08:00", 0],
      ["2026-11-03", "late", "09:30", 60],
      ["2026-11-04", "absent", null, null],
      [THU, "absent", null, null],
      [FRI, "absent", null, null],
    ]);
    expect(meena.tally).toMatchObject({ present: 1, late: 1, absent: 3, days: 5, percent: 40 });
    expect(row(res, s.dev).tally).toMatchObject({ present: 1, late: 0, absent: 4, percent: 20 });
    expect(row(res, s.kiran).tally).toMatchObject({ present: 0, absent: 5, percent: 0 });
  });

  it("a teacher who has not marked is Not yet while school is on, and Absent once it has ended", async () => {
    const { s, sheet, row } = await setUp();
    at(THU, "11:00");
    expect(row(await sheet(s.token, THU, THU), s.meena).records[0]).toMatchObject({ date: THU, status: "pending" });
    at(THU, "14:20");
    expect(row(await sheet(s.token, THU, THU), s.meena).records[0]).toMatchObject({ status: "absent" });
  });

  it("holidays and days the school does not run are not absences; a teacher's own off day is Off", async () => {
    const { s, sheet, row } = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: THU });
    await request(app).patch(`/api/v1/staff/teachers/${s.dev}`).set(auth(s.token)).send({ offDays: [5] });
    at(SUN, "20:00");
    const res = await sheet(s.token, THU, SUN);
    expect(res.body.data.days.map((d: { date: string; working: boolean; holiday: string | null }) => [d.date, d.working, d.holiday])).toEqual([
      [THU, true, "Diwali"],
      [FRI, true, null],
      [SAT, false, null],
      [SUN, false, null],
    ]);
    expect(row(res, s.meena).records.map((r) => r.status)).toEqual(["holiday", "absent", "off", "off"]);
    expect(row(res, s.dev).records.map((r) => r.status)).toEqual(["holiday", "off", "off", "off"]);
    expect(row(res, s.meena).tally).toMatchObject({ absent: 1, days: 1 });
  });

  it("a teacher is not absent before they joined; one who has left is not listed", async () => {
    const { s, sheet, row } = await setUp();
    await request(app).patch(`/api/v1/staff/teachers/${s.dev}`).set(auth(s.token)).send({ joiningDate: THU });
    await request(app).patch(`/api/v1/staff/teachers/${s.kiran}`).set(auth(s.token)).send({ isActive: false });
    at(FRI, "16:00");
    const res = await sheet(s.token, "2026-11-04", FRI);
    expect(row(res, s.dev).records.map((r) => r.status)).toEqual(["before", "absent", "absent"]);
    expect(row(res, s.dev).tally).toMatchObject({ absent: 2, days: 2 });
    expect(res.body.data.teachers.map((t: { name: string }) => t.name)).toEqual(["Dev Patel", "Meena Singh"]);
  });

  it("a day marked is kept even when the day later becomes a holiday or the teacher's off day", async () => {
    const { s, present, sheet, row } = await setUp();
    at(THU, "08:10");
    await present(s.tokens.meena);
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Declared late", kind: "holiday", startDate: THU });
    at(FRI, "09:00");
    expect(row(await sheet(s.token, THU, THU), s.meena).records[0]).toMatchObject({ status: "present", checkedInTime: "08:10" });
  });

  it("the time of each mark is kept with who marked it; days still to come are only upcoming, and the range stops today", async () => {
    const { s, present, sheet, row } = await setUp();
    at(THU, "08:10");
    await present(s.tokens.meena);
    const res = await sheet(s.token, THU, "2026-11-30");
    expect(res.body.data.to).toBe(THU); // nothing after today
    expect(res.body.data.days).toHaveLength(1);
    const record = row(res, s.meena).records[0] as { log: { time: string; by: { name: string }; action: string }[] };
    expect(record.log).toEqual([expect.objectContaining({ time: "08:10", action: "checked_in", by: expect.objectContaining({ name: "Meena Singh" }) })]);
    // A range that starts after today has no days.
    expect((await sheet(s.token, "2026-11-20", "2026-11-30")).body.data.days).toEqual([]);
  });

  it("is for the people who run the school only; the range must be real, in order, and a year at most", async () => {
    const { s, sheet } = await setUp();
    at(FRI, "16:00");
    expect((await sheet(s.tokens.meena, THU, FRI)).status).toBe(403);
    expect((await sheet(s.tokens.ravi, THU, FRI)).status).toBe(403);
    expect((await sheet(await addColleague(s.tenantId, "principal"), THU, FRI)).status).toBe(200);
    expect((await sheet(s.token, FRI, THU)).status).toBe(400);
    expect((await sheet(s.token, "2026-02-31", FRI)).status).toBe(400);
    expect((await sheet(s.token, "2025-01-01", FRI)).status).toBe(400); // more than a year
    expect((await request(app).get(`${api}/teachers`).set(auth(s.token))).status).toBe(400);
    expect((await request(app).get(`${api}/teachers?from=${THU}&to=${FRI}`)).status).toBe(401);
  });
});

describe("real school days (2026-11-06)", () => {
  it("a teacher with no login cannot mark themselves, so their working days are not counted against them", async () => {
    const { s, present, sheet, row } = await setUp();
    const sunil = await addTeacher(s.token, "Sunil Das", { mobile: "9000000099" });
    await request(app).patch(`/api/v1/staff/teachers/${sunil}`).set(auth(s.token)).send({ joiningDate: "2026-04-01" });
    at(FRI, "16:00");
    const res = await sheet(s.token, "2026-11-04", FRI);
    expect(row(res, sunil).records.map((r) => r.status)).toEqual(["no_login", "no_login", "no_login"]);
    expect(row(res, sunil).tally).toMatchObject({ present: 0, late: 0, absent: 0, days: 0, percent: null });
    expect(res.body.data.summary.absent).toBe([s.meena, s.dev, s.kiran].reduce((n, id) => n + Number(row(res, id).tally.absent), 0));
    // Their weekend is still just a day off.
    at(SUN, "16:00");
    expect(row(await sheet(s.token, SAT, SUN), sunil).records.map((r) => r.status)).toEqual(["off", "off"]);
    expect((await present(s.tokens.ravi)).status).toBe(403);
  });

  it("a half day (Saturday 9:00 to 12:00) is a working day with its own hours: the mark counts late from 9:00, and school ends at 12:00", async () => {
    const { s, present, mine } = await setUp();
    await addTiming(s.token, {
      name: "Saturday",
      days: [6],
      slots: [
        { kind: "period", start: "09:00", end: "09:45" },
        { kind: "period", start: "09:45", end: "10:30" },
        { kind: "period", start: "10:30", end: "11:15" },
        { kind: "period", start: "11:15", end: "12:00" },
      ],
    });
    at(SAT, "09:20");
    expect((await mine(s.tokens.meena)).body.data).toMatchObject({ status: "pending", canCheckIn: true, school: { start: "09:00", end: "12:00" } });
    const res = await present(s.tokens.meena);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ status: "late", lateByMinutes: 20 });
    at(SAT, "12:00");
    expect((await present(s.tokens.dev)).body.code).toBe("SCHOOL_TIME_OVER");
  });

  it("two taps at the same moment make one mark: one 201, one 200, one line in the log", async () => {
    const { s, present, mine } = await setUp();
    at(THU, "08:10");
    const [a, b] = await Promise.all([present(s.tokens.meena), present(s.tokens.meena)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect((await mine(s.tokens.meena)).body.data.log).toHaveLength(1);
  });

  it("two timings that run the same day: school starts with the earliest and ends with the last", async () => {
    const { s, mine } = await setUp();
    // Class 1 keeps its own hours (07:45 to 14:30) beside the school's usual 08:30 to 14:20.
    const early = await addTiming(s.token, {
      name: "Pre-primary",
      days: [1, 2, 3, 4, 5],
      scope: "only",
      classIds: [s.class1.id],
      slots: [
        { kind: "period", start: "07:45", end: "08:45" },
        { kind: "period", start: "08:45", end: "09:45" },
        { kind: "period", start: "09:45", end: "10:45" },
        { kind: "lunch", start: "10:45", end: "11:15" },
        { kind: "period", start: "11:15", end: "12:15" },
        { kind: "period", start: "12:15", end: "13:15" },
        { kind: "period", start: "13:15", end: "14:30" },
      ],
    });
    expect(early).toBeTruthy();
    at(THU, "07:50");
    expect((await mine(s.tokens.meena)).body.data.school).toEqual({ start: "07:45", end: "14:30" });
  });
});
