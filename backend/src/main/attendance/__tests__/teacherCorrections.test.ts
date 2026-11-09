import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { addTeacher, addTiming, auth } from "../../../test/timetable";
import { Notification } from "../../notifications/models/Notification";
import { NotificationService } from "../../notifications/services/notification.service";

/**
 * The school marks or corrects a teacher's day (2026-11-06): a teacher forgot, the phone was dead, the teacher has no login, or is on
 * leave. Present (with the time), Absent or Leave, with a note, kept in the day's log with who did it. The teacher is told. A teacher can
 * read their own month. 5 Nov 2026 is a Thursday; school runs Monday to Friday, 8:30 AM to 2:20 PM.
 */

const api = "/api/v1/attendance";
const THU = "2026-11-05";
const FRI = "2026-11-06";
const SAT = "2026-11-07";
const at = (day: string, hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));

async function setUp() {
  const s = await classroomSchool();
  await addTiming(s.token);
  for (const id of [s.meena, s.dev, s.kiran]) await request(app).patch(`/api/v1/staff/teachers/${id}`).set(auth(s.token)).send({ joiningDate: "2026-04-01" });
  const set = (token: string, teacherId: string, body: object) => request(app).put(`${api}/teachers/${teacherId}/day`).set(auth(token)).send(body);
  const sheet = (token: string, from: string, to: string) => request(app).get(`${api}/teachers?from=${from}&to=${to}`).set(auth(token));
  const record = async (teacherId: string, date: string) => {
    const res = await sheet(s.token, date, date);
    return (res.body.data.teachers as { id: string; records: Record<string, any>[]; tally: Record<string, number | null> }[]).find((t) => t.id === teacherId)!;
  };
  return { s, set, sheet, record };
}

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => vi.restoreAllMocks());

describe("the school marks a teacher's day", () => {
  it("Present with the time a teacher came, for a day gone by: it counts, with a note and who did it in the log", async () => {
    const { s, set, record } = await setUp();
    at(FRI, "10:00");
    const res = await set(s.token, s.meena, { date: THU, status: "present", time: "08:20", note: "Phone was dead" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ date: THU, status: "present", checkedInTime: "08:20", lateByMinutes: 0, note: "Phone was dead", source: "school" });
    expect(res.body.data.log).toEqual([expect.objectContaining({ action: "marked_by_school", note: "Phone was dead", by: expect.objectContaining({ name: "Asha Verma", role: "school_admin" }) })]);
    const row = await record(s.meena, THU);
    expect(row.records[0]).toMatchObject({ status: "present", checkedInTime: "08:20" });
    expect(row.tally).toMatchObject({ present: 1, absent: 0, days: 1, percent: 100 });
  });

  it("a time after school started is Late, by how much", async () => {
    const { s, set } = await setUp();
    at(FRI, "10:00");
    expect((await set(s.token, s.dev, { date: THU, status: "present", time: "09:15" })).body.data).toMatchObject({ status: "late", lateByMinutes: 45 });
  });

  it("with no time given: now for today, the start of school for a day gone by", async () => {
    const { s, set } = await setUp();
    at(FRI, "11:40");
    expect((await set(s.token, s.meena, { date: FRI, status: "present" })).body.data).toMatchObject({ checkedInTime: "11:40", status: "late", lateByMinutes: 190 });
    expect((await set(s.token, s.dev, { date: THU, status: "present" })).body.data).toMatchObject({ checkedInTime: "08:30", status: "present", lateByMinutes: 0 });
  });

  it("changes a mark the teacher made: Present to Absent; both are in the log, the latest word is the day's", async () => {
    const { s, set, record } = await setUp();
    at(THU, "08:10");
    await request(app).post(`${api}/teachers/me/present`).set(auth(s.tokens.meena));
    at(FRI, "10:00");
    const res = await set(s.token, s.meena, { date: THU, status: "absent", note: "Was not in school" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ status: "absent", checkedInTime: null, source: "school" });
    expect(res.body.data.log.map((l: { action: string }) => l.action)).toEqual(["checked_in", "marked_by_school"]);
    expect((await record(s.meena, THU)).tally).toMatchObject({ present: 0, absent: 1, days: 1, percent: 0 });
  });

  it("Leave with a note: the teacher is not absent, and the day is left out of the percentage", async () => {
    const { s, set, record } = await setUp();
    at(FRI, "16:00");
    const res = await set(s.token, s.kiran, { date: THU, status: "leave", note: "Sick leave" });
    expect(res.body.data).toMatchObject({ status: "leave", note: "Sick leave" });
    const row = await record(s.kiran, THU);
    expect(row.records[0].status).toBe("leave");
    expect(row.tally).toMatchObject({ present: 0, late: 0, absent: 0, leave: 1, days: 0, percent: null });
  });

  it("a teacher with no login is counted once the school marks their day", async () => {
    const { s, set, record } = await setUp();
    const sunil = await addTeacher(s.token, "Sunil Das", { mobile: "9000000099" });
    await request(app).patch(`/api/v1/staff/teachers/${sunil}`).set(auth(s.token)).send({ joiningDate: "2026-04-01" });
    at(FRI, "16:00");
    expect((await record(sunil, THU)).records[0].status).toBe("no_login");
    await set(s.token, sunil, { date: THU, status: "present", time: "08:00" });
    expect((await record(sunil, THU)).records[0]).toMatchObject({ status: "present", checkedInTime: "08:00" });
  });

  it("the same day marked again by the school replaces the school's earlier word, and keeps the history", async () => {
    const { s, set } = await setUp();
    at(FRI, "10:00");
    await set(s.token, s.meena, { date: THU, status: "absent", note: "First thought" });
    const res = await set(s.token, s.meena, { date: THU, status: "present", time: "09:00", note: "She sent a photo of the register" });
    expect(res.body.data).toMatchObject({ status: "late", note: "She sent a photo of the register" });
    expect(res.body.data.log).toHaveLength(2);
  });

  it("a holiday or a day off cannot be Absent or Leave, but a teacher who came on one can be marked Present", async () => {
    const { s, set } = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: THU });
    at(SAT, "10:00");
    const holiday = await set(s.token, s.meena, { date: THU, status: "absent" });
    expect(holiday.status).toBe(409);
    expect(holiday.body.code).toBe("NOT_A_WORKING_DAY");
    expect((await set(s.token, s.meena, { date: SAT, status: "leave" })).body.code).toBe("NOT_A_WORKING_DAY");
    expect((await set(s.token, s.meena, { date: SAT, status: "present", time: "10:00", note: "Came for the sports day" })).body.data.status).toBe("present");
  });

  it("is refused for a day to come, a time that is not a time, a note that is too long, a status that is not one, a day that is not a day", async () => {
    const { s, set } = await setUp();
    at(FRI, "10:00");
    expect((await set(s.token, s.meena, { date: "2026-11-09", status: "present" })).status).toBe(400);
    expect((await set(s.token, s.meena, { date: THU, status: "present", time: "9am" })).status).toBe(400);
    expect((await set(s.token, s.meena, { date: THU, status: "present", note: "x".repeat(301) })).status).toBe(400);
    expect((await set(s.token, s.meena, { date: THU, status: "sick" })).status).toBe(400);
    expect((await set(s.token, s.meena, { date: "2026-02-31", status: "present" })).status).toBe(400);
    expect((await set(s.token, s.meena, { status: "present" })).status).toBe(400);
  });

  it("is for the people who run the school (the principal too); not a teacher, a parent or a stranger; not another school's teacher or an unknown one", async () => {
    const { s, set } = await setUp();
    const moon = await classroomSchool("Moonrise Public School", "moon.");
    at(FRI, "10:00");
    expect((await set(await addColleague(s.tenantId, "principal"), s.meena, { date: THU, status: "present" })).status).toBe(200);
    expect((await set(s.tokens.meena, s.meena, { date: THU, status: "present" })).status).toBe(403);
    expect((await set(s.tokens.ravi, s.meena, { date: THU, status: "present" })).status).toBe(403);
    expect((await request(app).put(`${api}/teachers/${s.meena}/day`).send({ date: THU, status: "present" })).status).toBe(401);
    expect((await set(moon.token, s.meena, { date: THU, status: "present" })).status).toBe(404);
    expect((await set(s.token, "64b64b64b64b64b64b64b64b", { date: THU, status: "present" })).status).toBe(404);
    expect((await set(s.token, "not-an-id", { date: THU, status: "present" })).status).toBe(400);
  });

  it("a teacher who has left cannot be marked", async () => {
    const { s, set } = await setUp();
    at(FRI, "10:00");
    await request(app).patch(`/api/v1/staff/teachers/${s.kiran}`).set(auth(s.token)).send({ isActive: false });
    expect((await set(s.token, s.kiran, { date: THU, status: "present" })).status).toBe(409);
  });

  it("the teacher reads it in their own day: the status, the time, the log, and Leave says why they cannot mark", async () => {
    const { s, set } = await setUp();
    at(FRI, "10:00");
    await set(s.token, s.meena, { date: THU, status: "present", time: "08:20" });
    const mine = await request(app).get(`${api}/teachers/me?date=${THU}`).set(auth(s.tokens.meena));
    expect(mine.body.data).toMatchObject({ status: "present", checkedInTime: "08:20", canCheckIn: false });
    expect(mine.body.data.log[0].by.role).toBe("school_admin");
    await set(s.token, s.meena, { date: FRI, status: "leave", note: "Fever" });
    expect((await request(app).get(`${api}/teachers/me`).set(auth(s.tokens.meena))).body.data).toMatchObject({ status: "leave", canCheckIn: false, why: "On leave: Fever" });
    // And she cannot tap Present over the school's Leave.
    expect((await request(app).post(`${api}/teachers/me/present`).set(auth(s.tokens.meena))).status).toBe(200);
    expect((await request(app).get(`${api}/teachers/me`).set(auth(s.tokens.meena))).body.data.status).toBe("leave");
  });
});

describe("the teacher is told", () => {
  it("the teacher hears the school marked their day (the day, what it is, the note, who); a teacher with no login and the one who did it hear nothing", async () => {
    const { s, set } = await setUp();
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    at(FRI, "10:00");
    await set(s.token, s.meena, { date: THU, status: "leave", note: "Sick leave" });
    await NotificationService.idle();
    const items = (await request(app).get("/api/v1/notifications").set(auth(s.tokens.meena))).body.data.items as { kind: string; title: string; body: string; link: string }[];
    expect(items[0]).toMatchObject({ kind: "teacher.attendance", title: "Your attendance of 5 Nov is marked Leave" });
    expect(items[0].body).toContain("Sick leave");
    expect(items[0].body).toContain("Asha Verma");
    expect(items[0].link).toBe("/dashboard");
    expect((await request(app).get("/api/v1/notifications").set(auth(s.token))).body.data.items).toHaveLength(0);
    expect((await request(app).get("/api/v1/notifications").set(auth(s.tokens.dev))).body.data.items).toHaveLength(0);
  });
});

describe("a teacher's own month", () => {
  it("every day of the month up to today with what it was, the time, and the counts", async () => {
    const { s } = await setUp();
    at("2026-11-02", "08:00");
    await request(app).post(`${api}/teachers/me/present`).set(auth(s.tokens.meena));
    at("2026-11-03", "09:30");
    await request(app).post(`${api}/teachers/me/present`).set(auth(s.tokens.meena));
    at(FRI, "16:00");
    const res = await request(app).get(`${api}/teachers/me/month?month=2026-11`).set(auth(s.tokens.meena));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ month: "2026-11", from: "2026-11-01", to: FRI });
    expect(res.body.data.row.name).toBe("Meena Singh");
    expect(res.body.data.row.records.map((r: { date: string; status: string }) => [r.date, r.status])).toEqual([
      ["2026-11-01", "off"],
      ["2026-11-02", "present"],
      ["2026-11-03", "late"],
      ["2026-11-04", "absent"],
      [THU, "absent"],
      [FRI, "absent"],
    ]);
    expect(res.body.data.row.tally).toMatchObject({ present: 1, late: 1, absent: 3, days: 5, percent: 40 });
  });

  it("this month when none is asked; a bad month is refused; only a teacher reads it, and only their own", async () => {
    const { s } = await setUp();
    at(FRI, "16:00");
    expect((await request(app).get(`${api}/teachers/me/month`).set(auth(s.tokens.meena))).body.data.month).toBe("2026-11");
    expect((await request(app).get(`${api}/teachers/me/month?month=2026-13`).set(auth(s.tokens.meena))).status).toBe(400);
    expect((await request(app).get(`${api}/teachers/me/month`).set(auth(s.token))).status).toBe(403);
    const dev = (await request(app).get(`${api}/teachers/me/month`).set(auth(s.tokens.dev))).body.data;
    expect(dev.row.name).toBe("Dev Patel");
  });
});
