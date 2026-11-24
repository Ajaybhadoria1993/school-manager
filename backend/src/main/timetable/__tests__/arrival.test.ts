import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addTiming, auth, saveAllotments } from "../../../test/timetable";
import { NotificationService } from "../../notifications/services/notification.service";

/**
 * A teacher who was away comes (2026-11-24, user: "teacher aate hi arrangement apne aap cancel ho aur substitute ko bell jaye; meena beech mein aa jaye to baaki time
 * wo class le, dev free ho, ye optional rahe; dikhe ki kis teacher ne kitne min class li"). Today is Tuesday 10 November 2026; the school's periods are 08:30-09:10,
 * 09:10-09:50, 09:50-10:30. Meena Singh (login) teaches Class 5 - A Mathematics in periods 1 and 3 and is its class teacher; Dev Patel (login) teaches its English in
 * period 2 and Class 1's English in period 3; Kiran Rao (login) teaches nothing and is the one put in.
 */
const TODAY = "2026-11-10";
const TUESDAY = 2;
const api = "/api/v1/timetable";
const at = (hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${TODAY}T${hhmm}:00+05:30`));

async function ready() {
  const s = await classroomSchool();
  await addTiming(s.token);
  await saveAllotments(s.token, s.one, [{ subjectId: s.english, periodsPerWeek: 5, teacherId: s.dev }]);
  const grid = (unit: object, cells: object[]) => request(app).put(`${api}/grid`).set(auth(s.token)).send({ ...unit, cells });
  expect((await grid(s.a, [{ day: TUESDAY, period: 1, lessons: [{ subjectId: s.maths }] }, { day: TUESDAY, period: 2, lessons: [{ subjectId: s.english }] }, { day: TUESDAY, period: 3, lessons: [{ subjectId: s.maths }] }])).status).toBe(200);
  expect((await grid(s.one, [{ day: TUESDAY, period: 3, lessons: [{ subjectId: s.english }] }])).status).toBe(200);
  for (const unit of [s.a, s.one]) expect((await request(app).post(`${api}/grid/publish`).set(auth(s.token)).send(unit)).status).toBe(200);
  return s;
}
type School = Awaited<ReturnType<typeof ready>>;

type Lesson = { period: number; substitute: { id: string; name: string } | null; taken: { name: string; minutes: number }[]; canTakeBack: boolean; free: { id: string }[] };
type Away = { teacher: { id: string; name: string }; status: string; arrivedAt: string | null; lessons: Lesson[]; attendance: { cover: { id: string } | null }[] };
const day = async (s: School) => (await request(app).get(`${api}/arrangements?date=${TODAY}`).set(auth(s.token))).body.data as { away: Away[] };
const awayOf = async (s: School, id: string) => (await day(s)).away.find((a) => a.teacher.id === id);
const put = (s: School, period: number, substituteTeacherId: string | null) =>
  request(app).put(`${api}/arrangements`).set(auth(s.token)).send({ date: TODAY, ...s.a, period, absentTeacherId: s.meena, substituteTeacherId });
const checkIn = (token: string) => request(app).post("/api/v1/attendance/teachers/me/present").set(auth(token));
const mark = (s: School, teacherId: string, status: "present" | "absent", time?: string) =>
  request(app).put(`/api/v1/attendance/teachers/${teacherId}/day`).set(auth(s.token)).send({ date: TODAY, status, ...(time ? { time } : {}) });
const handBack = (s: School, period = 1, over: object = {}) => request(app).post(`${api}/arrangements/hand-back`).set(auth(s.token)).send({ date: TODAY, ...s.a, period, absentTeacherId: s.meena, ...over });
const bells = async (token: string) => ((await request(app).get("/api/v1/notifications").set(auth(token))).body.data.items as { kind: string; title: string; body: string }[]).filter((n) => n.kind === "timetable.substitute");

beforeEach(async () => {
  await seedSuperAdmin();
  at("08:45");
});
afterEach(() => vi.restoreAllMocks());

describe("a teacher who was away comes: what has not begun is taken off", () => {
  it("her check-in takes off the substitute for a period that has not begun and tells the substitute; a period going on stays", async () => {
    const s = await ready();
    expect((await put(s, 1, s.kiran)).status).toBe(200);
    expect((await put(s, 3, s.kiran)).status).toBe(200);
    await NotificationService.idle();
    at("09:00");
    const arrived = await checkIn(s.tokens.meena);
    expect(arrived.status, JSON.stringify(arrived.body)).toBe(201);
    // Period 3 (09:50) had not begun: gone. Period 1 (08:30-09:10) is going on: Kiran still has it.
    const meena = (await awayOf(s, s.meena))!;
    expect(meena).toMatchObject({ status: "arrived", arrivedAt: "09:00" });
    expect(meena.lessons.map((l) => [l.period, l.substitute?.name])).toEqual([[1, "Kiran Rao"]]);
    await NotificationService.idle();
    const titles = (await bells(s.tokens.kiran)).map((n) => n.title);
    expect(titles.some((t) => /^Arrangement taken off today: Class 5.*, Period 3$/.test(t))).toBe(true);
    const back = (await bells(s.tokens.kiran)).find((n) => /^Arrangement taken off today: Class 5.*, Period 3$/.test(n.title))!;
    expect(back.body).toContain("Meena Singh is back");
    // Nothing was said of period 1.
    expect(titles.filter((t) => /Period 1$/.test(t) && /taken off/.test(t))).toEqual([]);
  });

  it("the substitute is not busy any more for the period that was taken off", async () => {
    const s = await ready();
    // Dev has Class 1's English in period 3 and is away; Kiran is put in for Meena's period 3 (09:50 to 10:30) first.
    await mark(s, s.dev, "absent");
    await put(s, 3, s.kiran);
    const devLesson = async () => (await awayOf(s, s.dev))!.lessons.find((l) => l.period === 3)!;
    expect((await devLesson()).free.map((t) => t.id)).not.toContain(s.kiran);
    at("09:00");
    await checkIn(s.tokens.meena);
    expect((await devLesson()).free.map((t) => t.id)).toContain(s.kiran);
  });

  it("the school marking her present (with the time she came) does the same, and so does correcting an Absent", async () => {
    const s = await ready();
    await mark(s, s.meena, "absent");
    await put(s, 3, s.kiran);
    const fixed = await mark(s, s.meena, "present", "08:50");
    expect(fixed.status, JSON.stringify(fixed.body)).toBe(200);
    expect(await awayOf(s, s.meena)).toBeUndefined();
    await NotificationService.idle();
    expect((await bells(s.tokens.kiran)).some((n) => /taken off today: Class 5.*, Period 3$/.test(n.title))).toBe(true);
  });

  it("a period that was already over stays, with the substitute as the one who took the whole of it", async () => {
    const s = await ready();
    at("09:55");
    await put(s, 1, s.kiran);
    await put(s, 3, s.kiran);
    at("10:00");
    await mark(s, s.meena, "present", "10:00");
    // Period 1 is over (it stays); period 3 (09:50 to 10:30) is going on.
    const meena = (await awayOf(s, s.meena))!;
    expect(meena.lessons.map((l) => [l.period, l.taken, l.canTakeBack])).toEqual([
      [1, [{ name: "Kiran Rao", minutes: 40 }], false],
      [3, [], true],
    ]);
  });

  it("a teacher who comes with nothing arranged for her changes nothing and does not appear", async () => {
    const s = await ready();
    expect((await checkIn(s.tokens.meena)).status).toBe(201);
    expect(await awayOf(s, s.meena)).toBeUndefined();
  });

  it("no arrangement can be made for her once she has come", async () => {
    const s = await ready();
    await put(s, 1, s.kiran);
    at("09:00");
    await checkIn(s.tokens.meena);
    const again = await put(s, 1, s.dev);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_ARRIVED");
  });
});

describe("the teacher takes the rest of the period (optional): the substitute is free, and the page says how long each had the class", () => {
  it("hands the rest back from now: Kiran 30 minutes, Meena the last 10; Kiran is told", async () => {
    const s = await ready();
    await put(s, 1, s.kiran);
    at("09:00");
    await checkIn(s.tokens.meena);
    expect((await awayOf(s, s.meena))!.lessons[0]).toMatchObject({ canTakeBack: true, taken: [] });
    const done = await handBack(s);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const lesson = (await awayOf(s, s.meena))!.lessons[0];
    expect(lesson).toMatchObject({ canTakeBack: false });
    expect(lesson.taken).toEqual([
      { name: "Kiran Rao", minutes: 30 },
      { name: "Meena Singh", minutes: 10 },
    ]);
    await NotificationService.idle();
    const told = (await bells(s.tokens.kiran)).find((n) => /took over Class 5/.test(n.title))!;
    expect(told.title).toMatch(/^Meena Singh took over Class 5.*, Period 1$/);
    expect(told.body).toBe("You had the class for 30 of 40 min");
  });

  it("the substitute is free from then on, not for the part he had; and it stays handed back after the period is over", async () => {
    const s = await ready();
    // Kiran has Meena's period 1 (08:30 to 09:10); Dev is away and has period 2 (09:10 to 09:50): Kiran is free then anyway, so look at a lesson that overlaps period 1.
    await put(s, 1, s.kiran);
    at("09:00");
    await checkIn(s.tokens.meena);
    await handBack(s);
    at("09:30");
    expect((await awayOf(s, s.meena))!.lessons[0].taken).toEqual([
      { name: "Kiran Rao", minutes: 30 },
      { name: "Meena Singh", minutes: 10 },
    ]);
  });

  it("is optional: left alone, the substitute keeps the class and the page says he took the whole period once it is over", async () => {
    const s = await ready();
    await put(s, 1, s.kiran);
    at("09:00");
    await checkIn(s.tokens.meena);
    at("09:20");
    const lesson = (await awayOf(s, s.meena))!.lessons[0];
    expect(lesson).toMatchObject({ canTakeBack: false, taken: [{ name: "Kiran Rao", minutes: 40 }] });
  });

  it("is refused for a period that is over, one already handed back, a teacher who has not come, and a day that is not today", async () => {
    const s = await ready();
    await put(s, 1, s.kiran);
    // Meena has not come: she is not arrived.
    const early = await handBack(s);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("NOT_ARRIVED");
    at("09:00");
    await checkIn(s.tokens.meena);
    expect((await handBack(s)).status).toBe(200);
    const twice = await handBack(s);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("NOT_IN_PROGRESS");
    expect((await handBack(s, 1, { date: "2026-11-11" })).status).toBe(400);
  });

  it("a period that is over cannot be taken back", async () => {
    const s = await ready();
    await put(s, 1, s.kiran);
    at("09:00");
    await checkIn(s.tokens.meena);
    at("09:30");
    const over = await handBack(s);
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("NOT_IN_PROGRESS");
  });

  it("is for the people who run the school: a teacher cannot hand a period back", async () => {
    const s = await ready();
    await put(s, 1, s.kiran);
    at("09:00");
    await checkIn(s.tokens.meena);
    expect((await request(app).post(`${api}/arrangements/hand-back`).set(auth(s.tokens.meena)).send({ date: TODAY, ...s.a, period: 1, absentTeacherId: s.meena })).status).toBe(403);
  });
});

describe("her class's attendance given to someone else, when she comes", () => {
  const giveAttendance = (s: School) => request(app).put(`${api}/arrangements/attendance`).set(auth(s.token)).send({ date: TODAY, ...s.a, absentTeacherId: s.meena, coverTeacherId: s.dev });
  const sheet = (s: School) => request(app).get("/api/v1/classroom/attendance").query({ classId: s.a.classId, sectionId: s.a.sectionId, date: TODAY }).set(auth(s.tokens.dev));

  it("is taken off when she comes before the attendance was taken, and the teacher is told", async () => {
    const s = await ready();
    expect((await giveAttendance(s)).status).toBe(200);
    expect((await sheet(s)).status).toBe(200);
    at("09:00");
    await checkIn(s.tokens.meena);
    expect((await sheet(s)).status).toBe(403);
    await NotificationService.idle();
    const told = (await bells(s.tokens.dev)).find((n) => /^Attendance of Class 5.* taken off today$/.test(n.title))!;
    expect(told.body).toBe("Meena Singh, the class teacher, is back");
  });

  it("stays when the attendance was already taken: the one who took it can still correct it", async () => {
    const s = await ready();
    await giveAttendance(s);
    const saved = await request(app).put("/api/v1/classroom/attendance").set(auth(s.tokens.dev)).send({ ...s.a, date: TODAY, marks: [] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    at("09:00");
    await checkIn(s.tokens.meena);
    expect((await sheet(s)).status).toBe(200);
  });
});
