import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { LOGIN_PASSWORD } from "../../../test/classroom";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { NotificationService } from "../../notifications/services/notification.service";
import { Notification } from "../../notifications/models/Notification";

/**
 * The day's arrangement (2026-11-22, user: "teacher absent ho to arrangement"): who is away, their lessons that day, and the teachers free then;
 * a substitute is put in for one lesson, for that day only. Today is Tuesday 10 November 2026, 09:00 in India.
 */
const TODAY = "2026-11-10";
const TUESDAY = 2;
const api = "/api/v1/timetable";

async function ready() {
  const s = await timetableSchool();
  await addTiming(s.token);
  const five = await addClass(s.token, "Class 5");
  const six = await addClass(s.token, "Class 6");
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const meena = await addTeacher(s.token, "Meena Singh");
  const dev = await addTeacher(s.token, "Dev Patel", { mobile: "9110000002", login: { username: "arr.dev", password: LOGIN_PASSWORD } });
  const asha = await addTeacher(s.token, "Asha Rao");
  const ravi = await addTeacher(s.token, "Ravi Kumar", { offDays: [TUESDAY] });
  const unitFive = { classId: five.id, sectionId: null };
  const unitSix = { classId: six.id, sectionId: null };
  await saveAllotments(s.token, unitFive, [{ subjectId: maths, periodsPerWeek: 5, teacherId: meena }]);
  await saveAllotments(s.token, unitSix, [{ subjectId: english, periodsPerWeek: 5, teacherId: dev }]);
  // Meena teaches Class 5 in periods 1 and 3 on Tuesday; Dev teaches Class 6 in period 1 (so he is busy then, free in period 3).
  const grid = (unit: object, cells: object[]) => request(app).put(`${api}/grid`).set(auth(s.token)).send({ ...unit, cells });
  expect((await grid(unitFive, [{ day: TUESDAY, period: 1, lessons: [{ subjectId: maths }] }, { day: TUESDAY, period: 3, lessons: [{ subjectId: maths }] }])).status).toBe(200);
  expect((await grid(unitSix, [{ day: TUESDAY, period: 1, lessons: [{ subjectId: english }] }])).status).toBe(200);
  for (const unit of [unitFive, unitSix]) expect((await request(app).post(`${api}/grid/publish`).set(auth(s.token)).send(unit)).status).toBe(200);
  return { ...s, five: five.id, six: six.id, maths, meena, dev, asha, ravi };
}

const day = (token: string, date = TODAY) => request(app).get(`${api}/arrangements?date=${date}`).set(auth(token));
const mark = (token: string, teacherId: string, status: "absent" | "leave" | "present") => request(app).put(`/api/v1/attendance/teachers/${teacherId}/day`).set(auth(token)).send({ date: TODAY, status, ...(status === "present" ? { time: "08:20" } : {}) });
const put = (token: string, body: object) => request(app).put(`${api}/arrangements`).set(auth(token)).send(body);

beforeEach(async () => {
  await seedSuperAdmin();
  vi.spyOn(clock, "now").mockReturnValue(new Date(`${TODAY}T09:00:00+05:30`));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the day's arrangement: who is away and who is free", () => {
  it("lists a teacher marked absent with their lessons of the day, and for each the teachers free then (not busy, not off that day)", async () => {
    const r = await ready();
    expect((await mark(r.token, r.meena, "absent")).status).toBe(200);
    const res = await day(r.token);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const meena = res.body.data.away.find((a: { teacher: { id: string } }) => a.teacher.id === r.meena);
    expect(meena.status).toBe("absent");
    expect(meena.lessons.map((l: { period: number; start: string; label: string; subjectName: string }) => `${l.period} ${l.start} ${l.label} ${l.subjectName}`)).toEqual(["1 08:30 Class 5 Mathematics", "3 09:50 Class 5 Mathematics"]);
    const freeNames = (l: { free: { name: string }[] }) => l.free.map((t) => t.name);
    // Period 1: Dev teaches Class 6 then; Ravi does not come on Tuesday.
    expect(freeNames(meena.lessons[0])).toEqual(["Asha Rao"]);
    // Period 3: Dev is free (he has one period today, Asha none: Asha first).
    expect(freeNames(meena.lessons[1])).toEqual(["Asha Rao", "Dev Patel"]);
    expect(meena.lessons[1].free.find((t: { name: string }) => t.name === "Dev Patel").today).toBe(1);
  });

  it("today also lists a teacher with lessons who has not checked in yet; one who checked in is not away", async () => {
    const r = await ready();
    const away = async () => (await day(r.token)).body.data.away.map((a: { teacher: { name: string }; status: string }) => `${a.teacher.name} ${a.status}`);
    expect(await away()).toEqual(["Dev Patel not_in", "Meena Singh not_in"]);
    await mark(r.token, r.dev, "present");
    await mark(r.token, r.meena, "leave");
    expect(await away()).toEqual(["Meena Singh leave"]);
  });

  it("a teacher put in for a lesson is busy then for the other lessons, and the page says who was put in", async () => {
    const r = await ready();
    await mark(r.token, r.meena, "absent");
    const res = await put(r.token, { date: TODAY, classId: r.five, sectionId: null, period: 3, absentTeacherId: r.meena, substituteTeacherId: r.dev });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const meena = res.body.data.away.find((a: { teacher: { id: string } }) => a.teacher.id === r.meena);
    expect(meena.lessons[1].substitute).toEqual({ id: r.dev, name: "Dev Patel" });
    // Dev now has two periods today.
    expect(meena.lessons[0].free.map((t: { name: string }) => t.name)).toEqual(["Asha Rao"]);
    // Changing it to Asha: Dev is free again for it.
    const again = await put(r.token, { date: TODAY, classId: r.five, sectionId: null, period: 3, absentTeacherId: r.meena, substituteTeacherId: r.asha });
    expect(again.body.data.away[0].lessons[1].substitute.name).toBe("Asha Rao");
    // Taking it away.
    const off = await put(r.token, { date: TODAY, classId: r.five, sectionId: null, period: 3, absentTeacherId: r.meena, substituteTeacherId: null });
    expect(off.body.data.away[0].lessons[1].substitute).toBeNull();
  });

  it("the teacher put in hears it (and the one taken off too)", async () => {
    const r = await ready();
    await mark(r.token, r.meena, "absent");
    await put(r.token, { date: TODAY, classId: r.five, sectionId: null, period: 3, absentTeacherId: r.meena, substituteTeacherId: r.dev });
    await put(r.token, { date: TODAY, classId: r.five, sectionId: null, period: 3, absentTeacherId: r.meena, substituteTeacherId: r.asha });
    await NotificationService.idle();
    const titles = (await Notification.find({ tenantId: r.tenantId, kind: "timetable.substitute" }).sort({ createdAt: 1 }).lean()).map((n) => `${n.title} | ${n.body}`);
    expect(titles).toEqual(["Arrangement today: Class 5, Period 3 | 09:50 to 10:30 · Mathematics · in place of Meena Singh", "Arrangement taken off today: Class 5, Period 3 | 09:50 to 10:30 · Mathematics · in place of Meena Singh"]);
  });

  it("refuses a teacher who is not free then, a lesson whose teacher is not away, and another day than today", async () => {
    const r = await ready();
    await mark(r.token, r.meena, "absent");
    const busy = await put(r.token, { date: TODAY, classId: r.five, sectionId: null, period: 1, absentTeacherId: r.meena, substituteTeacherId: r.dev });
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe("TEACHER_NOT_FREE");
    expect((await put(r.token, { date: TODAY, classId: r.five, sectionId: null, period: 1, absentTeacherId: r.meena, substituteTeacherId: r.ravi })).status).toBe(409);
    await mark(r.token, r.dev, "present");
    const notAway = await put(r.token, { date: TODAY, classId: r.six, sectionId: null, period: 1, absentTeacherId: r.dev, substituteTeacherId: r.asha });
    expect(notAway.status).toBe(409);
    expect(notAway.body.code).toBe("NOT_AWAY");
    expect((await put(r.token, { date: "2026-11-11", classId: r.five, sectionId: null, period: 3, absentTeacherId: r.meena, substituteTeacherId: r.dev })).status).toBe(400);
  });

  it("another day is only read: the absences marked then, without the ones who had not checked in", async () => {
    const r = await ready();
    const res = await day(r.token, "2026-11-03");
    expect(res.status).toBe(200);
    expect(res.body.data.today).toBe(false);
    expect(res.body.data.away).toEqual([]);
  });

  it("a holiday has no arrangement", async () => {
    const r = await ready();
    await request(app).post("/api/v1/classroom/calendar").set(auth(r.token)).send({ title: "Guru Nanak Jayanti", kind: "holiday", startDate: TODAY, endDate: TODAY });
    await mark(r.token, r.meena, "absent").catch(() => undefined);
    const res = await day(r.token);
    expect(res.body.data.holiday).toBe("Guru Nanak Jayanti");
    expect(res.body.data.away.every((a: { lessons: unknown[] }) => a.lessons.length === 0)).toBe(true);
  });

  it("a special day's periods are the ones of the day: a half day has no period 3", async () => {
    const r = await ready();
    await mark(r.token, r.meena, "absent");
    const half = await request(app)
      .post(`${api}/special-days`)
      .set(auth(r.token))
      .send({ date: TODAY, title: "Half day", classIds: [r.five], slots: [{ kind: "period", start: "08:30", end: "09:10" }, { kind: "period", start: "09:10", end: "09:50" }] });
    expect(half.status, JSON.stringify(half.body)).toBe(201);
    const meena = (await day(r.token)).body.data.away.find((a: { teacher: { id: string } }) => a.teacher.id === r.meena);
    expect(meena.lessons.map((l: { period: number }) => l.period)).toEqual([1]);
  });

  it("is for the people who make the timetable: a teacher cannot read or change it", async () => {
    const r = await ready();
    const login = await request(app).post("/api/v1/auth/login").send({ identifier: "arr.dev", password: LOGIN_PASSWORD });
    const token = login.body.data.accessToken as string;
    expect((await day(token)).status).toBe(403);
    expect((await put(token, { date: TODAY, classId: r.five, sectionId: null, period: 3, absentTeacherId: r.meena, substituteTeacherId: r.dev })).status).toBe(403);
  });
});
