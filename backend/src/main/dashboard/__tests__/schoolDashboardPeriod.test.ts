import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addTiming, auth } from "../../../test/timetable";
import { Teacher } from "../../staff/models/Teacher";
import { Student } from "../../students/models/Student";

/**
 * The home page for the days the head picks (2026-11-10, laid out like Infinity Medisetu's): Today, This week, This month or any days,
 * each figure with the same number of days just before it to compare with; today's school hours for the line under the figures; and the
 * children's attendance day by day for the week or the month. School runs Monday to Friday from 8:30 AM to 2:20 PM; 5 Nov 2026 is a
 * Thursday.
 */

const api = "/api/v1/dashboard/school";
const MON = "2026-11-02";
const TUE = "2026-11-03";
const WED = "2026-11-04";
const THU = "2026-11-05";
const at = (day: string, hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));
const home = (token: string, query = "") => request(app).get(`${api}${query}`).set(auth(token));
const trend = (token: string, period: string) => request(app).get(`${api}/trend?period=${period}`).set(auth(token));

/** Class 5 - A (Asha, Kabir) and Class 1 (Mira); Meena is the class teacher of 5 - A; three teachers. */
async function setUp() {
  const s = await classroomSchool();
  await addTiming(s.token);
  const on = (id: string, day: string) => Student.updateOne({ _id: id, tenantId: s.tenantId }, { $set: { admissionDate: new Date(`${day}T00:00:00.000Z`) } });
  await on(s.asha.id, "2026-11-02");
  await on(s.kabir.id, "2026-10-15");
  await on(s.mira.id, "2026-10-20");
  await Teacher.updateMany({ tenantId: s.tenantId }, { $set: { joiningDate: new Date("2026-04-01T00:00:00.000Z") } });
  return s;
}
type School = Awaited<ReturnType<typeof setUp>>;

/** Class 5 - A's marks on a day, taken by Meena on that day. */
async function take(s: School, day: string, asha: string, kabir: string) {
  at(day, "09:00");
  const res = await request(app)
    .put("/api/v1/classroom/attendance")
    .set(auth(s.tokens.meena))
    .send({ ...s.a, date: day, marks: [{ studentId: s.asha.id, status: asha }, { studentId: s.kabir.id, status: kabir }] });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

beforeEach(async () => {
  await seedSuperAdmin();
  at(THU, "09:00");
});
afterEach(() => vi.restoreAllMocks());

describe("the days asked", () => {
  it("are today when none are asked, and the days before are the same number of days just before", async () => {
    const s = await setUp();
    const { period } = (await home(s.token)).body.data;
    expect(period).toMatchObject({ from: THU, to: THU, previous: { from: WED, to: WED } });
    const week = (await home(s.token, `?from=${MON}&to=2026-11-08`)).body.data.period;
    expect(week).toMatchObject({ from: MON, to: "2026-11-08", previous: { from: "2026-10-26", to: "2026-11-01" } });
  });

  it("must be real days, the end not before the start, and a year at most", async () => {
    const s = await setUp();
    expect((await home(s.token, `?from=${THU}&to=${MON}`)).status).toBe(400);
    expect((await home(s.token, "?from=2026-13-01&to=2026-13-02")).status).toBe(400);
    expect((await home(s.token, "?from=2025-01-01&to=2026-11-05")).status).toBe(400);
    expect((await home(s.token, `?from=${MON}`)).status).toBe(400);
  });
});

describe("the children's attendance in the days asked", () => {
  it("counts every mark of the days, the share that came (late is there), and the days before", async () => {
    const s = await setUp();
    await take(s, WED, "present", "absent");
    await take(s, THU, "late", "absent");
    at(THU, "10:00");
    const today = (await home(s.token)).body.data.period.attendance;
    expect(today).toEqual({ present: 0, late: 1, absent: 1, leave: 0, percent: 50, before: { absent: 1, percent: 50 } });
    const two = (await home(s.token, `?from=${WED}&to=${THU}`)).body.data.period.attendance;
    expect(two).toEqual({ present: 1, late: 1, absent: 2, leave: 0, percent: 50, before: { absent: 0, percent: null } });
  });

  it("names the classes with the most absences, most first, and only those that had any", async () => {
    const s = await setUp();
    await take(s, WED, "present", "absent");
    await take(s, THU, "absent", "absent");
    at(THU, "10:00");
    const { absentClasses } = (await home(s.token, `?from=${WED}&to=${THU}`)).body.data.period;
    expect(absentClasses).toEqual([{ classId: s.class5.id, name: "Class 5", absent: 3, marks: 4 }]);
    expect((await home(s.token, `?from=${MON}&to=${TUE}`)).body.data.period.absentClasses).toEqual([]);
  });

  it("has no share before anything was marked (not 0%)", async () => {
    const s = await setUp();
    expect((await home(s.token)).body.data.period.attendance).toEqual({ present: 0, late: 0, absent: 0, leave: 0, percent: null, before: { absent: 0, percent: null } });
  });
});

describe("the rest of the days asked", () => {
  it("counts the students admitted, and in the days before", async () => {
    const s = await setUp();
    const month = (await home(s.token, "?from=2026-11-01&to=2026-11-30")).body.data.period.students;
    // The 30 days before: 2 Oct to 31 Oct.
    expect(month).toEqual({ admitted: 1, admittedBefore: 2 });
  });

  it("counts the teachers' days at school out of the days school ran, once the day is over", async () => {
    const s = await setUp();
    at(THU, "08:15");
    await request(app).post("/api/v1/attendance/teachers/me/present").set(auth(s.tokens.meena));
    at(THU, "15:00");
    const { teachers } = (await home(s.token)).body.data.period;
    expect(teachers).toEqual({ present: 1, late: 0, absent: 2, percent: 33, before: { percent: 0 } });
  });

  it("counts the leave requests that fall on the days (who is off), and on the days before; a declined one does not count", async () => {
    const s = await setUp();
    const ask = (fromDate: string, toDate: string) => request(app).post(`/api/v1/parent/children/${s.asha.id}/leaves`).set(auth(s.tokens.ravi)).send({ fromDate, toDate, reason: "Fever" });
    const fri = await ask("2026-11-06", "2026-11-06");
    expect(fri.status, JSON.stringify(fri.body)).toBe(201);
    expect((await home(s.token)).body.data.period.leaves).toEqual({ asked: 0, askedBefore: 0 });
    expect((await home(s.token, "?from=2026-11-06&to=2026-11-06")).body.data.period.leaves).toEqual({ asked: 1, askedBefore: 0 });
    // A leave over several days counts for any of them.
    await ask("2026-11-09", "2026-11-11");
    expect((await home(s.token, "?from=2026-11-10&to=2026-11-10")).body.data.period.leaves).toEqual({ asked: 1, askedBefore: 1 });
    await request(app).post(`/api/v1/classroom/leaves/${fri.body.data.id}/decide`).set(auth(s.token)).send({ status: "declined" });
    expect((await home(s.token, "?from=2026-11-06&to=2026-11-06")).body.data.period.leaves.asked).toBe(0);
  });
});

describe("today's school hours (the line under the figures)", () => {
  it("says when school runs today", async () => {
    const s = await setUp();
    expect((await home(s.token)).body.data.day).toEqual({ working: true, holiday: null, start: "08:30", end: "14:20" });
  });

  it("says when today is a holiday, or a day without school", async () => {
    const s = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: THU });
    expect((await home(s.token)).body.data.day).toMatchObject({ working: false, holiday: "Diwali" });
    at("2026-11-08", "10:00");
    expect((await home(s.token)).body.data.day).toEqual({ working: false, holiday: null, start: null, end: null });
  });
});

describe("the children's attendance day by day", () => {
  it("the week, Monday first: a day with marks has its share; a day without marks, or not come yet, has none; and the week's share with the week before", async () => {
    const s = await setUp();
    await take(s, WED, "present", "absent");
    await take(s, THU, "present", "present");
    at(THU, "10:00");
    const res = await trend(s.token, "week");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ period: "week", from: MON, to: "2026-11-08", percent: 75, before: null });
    expect(res.body.data.points.map((p: { date: string; percent: number | null }) => [p.date, p.percent])).toEqual([
      [MON, null],
      [TUE, null],
      [WED, 50],
      [THU, 100],
      ["2026-11-06", null],
      ["2026-11-07", null],
      ["2026-11-08", null],
    ]);
  });

  it("the month: every day of it", async () => {
    const s = await setUp();
    const { data } = (await trend(s.token, "month")).body;
    expect(data).toMatchObject({ period: "month", from: "2026-11-01", to: "2026-11-30" });
    expect(data.points).toHaveLength(30);
  });

  it("is a week or a month, nothing else, and only for the people who run the school", async () => {
    const s = await setUp();
    expect((await trend(s.token, "year")).status).toBe(400);
    expect((await trend(s.tokens.meena, "week")).status).toBe(403);
  });
});
