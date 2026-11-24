import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addTiming, auth } from "../../../test/timetable";
import { NotificationService } from "../../notifications/services/notification.service";

/**
 * A class teacher who is away (2026-11-24, user: "class teacher absent ho to us class ki student attendance koi nahi le sakta: agar class teacher hai to ye
 * attendance kisi aur teacher ko assign kar do jo pehla period le"): only the class teacher takes a class's attendance, so the school (Leave & arrangements)
 * names another teacher who takes a period of that class that day, and that teacher takes the attendance of that class on that day only.
 * Today is Tuesday 10 November 2026, 09:00 in India. Meena Singh is the class teacher of Class 5 - A and teaches its Mathematics (Tuesday periods 1);
 * Dev Patel teaches its English (Tuesday period 2); Kiran Rao has a login and teaches nothing.
 */
const TODAY = "2026-11-10";
const NEXT_TUESDAY = "2026-11-17";
const NEXT_WEDNESDAY = "2026-11-18";
const TUESDAY = 2;
const WEDNESDAY = 3;
const api = "/api/v1/timetable";

/** Class 5 - A has Mathematics (Meena) in period 1 and English (Dev) in period 2 on these weekdays (Tuesday only, unless the test asks for more). */
async function ready(days: number[] = [TUESDAY]) {
  const s = await classroomSchool();
  await addTiming(s.token);
  const cells = days.flatMap((day) => [
    { day, period: 1, lessons: [{ subjectId: s.maths }] },
    { day, period: 2, lessons: [{ subjectId: s.english }] },
  ]);
  expect((await request(app).put(`${api}/grid`).set(auth(s.token)).send({ ...s.a, cells })).status).toBe(200);
  expect((await request(app).post(`${api}/grid/publish`).set(auth(s.token)).send(s.a)).status).toBe(200);
  return s;
}
type School = Awaited<ReturnType<typeof ready>>;

const day = (token: string, date = TODAY) => request(app).get(`${api}/arrangements?date=${date}`).set(auth(token));
const markAbsent = (token: string, teacherId: string) => request(app).put(`/api/v1/attendance/teachers/${teacherId}/day`).set(auth(token)).send({ date: TODAY, status: "absent" });
const cover = (token: string, s: School, coverTeacherId: string | null, over: object = {}) =>
  request(app).put(`${api}/arrangements/attendance`).set(auth(token)).send({ date: TODAY, ...s.a, absentTeacherId: s.meena, coverTeacherId, ...over });
const sheet = (token: string, s: School, date = TODAY) => request(app).get("/api/v1/classroom/attendance").query({ classId: s.a.classId, sectionId: s.a.sectionId, date }).set(auth(token));
const saveSheet = (token: string, s: School, date = TODAY) => request(app).put("/api/v1/classroom/attendance").set(auth(token)).send({ ...s.a, date, marks: [] });
const attendanceOf = async (token: string, s: School, date = TODAY, teacherId = s.meena) =>
  (await day(token, date)).body.data.away.find((a: { teacher: { id: string } }) => a.teacher.id === teacherId)?.attendance as
    | { classId: string; sectionId: string | null; label: string; cover: { id: string; name: string; until: string | null } | null; leaveUntil: string | null; options: { id: string; name: string; period: number }[] }[]
    | undefined;

beforeEach(async () => {
  await seedSuperAdmin();
  vi.spyOn(clock, "now").mockReturnValue(new Date(`${TODAY}T09:00:00+05:30`));
});
afterEach(() => vi.restoreAllMocks());

describe("the page: an away class teacher has her class's attendance to arrange", () => {
  it("lists, for each class she is the class teacher of, who takes it and who can: the teachers with a period of that class that day, the earliest first", async () => {
    const s = await ready();
    await markAbsent(s.token, s.meena);
    const [row] = (await attendanceOf(s.token, s))!;
    expect(row).toMatchObject({ classId: s.a.classId, sectionId: s.a.sectionId, cover: null });
    expect(row.label).toMatch(/Class 5/);
    // Meena herself is away; Dev has English in period 2; Kiran has no period in the class.
    expect(row.options).toEqual([{ id: s.dev, name: "Dev Patel", period: 2 }]);
    // Once Kiran is put in for her period 1, he takes a period of the class and comes first.
    const sub = await request(app).put(`${api}/arrangements`).set(auth(s.token)).send({ date: TODAY, ...s.a, period: 1, absentTeacherId: s.meena, substituteTeacherId: s.kiran });
    expect(sub.status, JSON.stringify(sub.body)).toBe(200);
    expect((await attendanceOf(s.token, s))![0].options).toEqual([
      { id: s.kiran, name: "Kiran Rao", period: 1 },
      { id: s.dev, name: "Dev Patel", period: 2 },
    ]);
  });

  it("a teacher who is not a class teacher has no attendance row; a class teacher with no period that day is still listed when she is away", async () => {
    const s = await ready();
    await markAbsent(s.token, s.dev);
    expect(await attendanceOf(s.token, s, TODAY, s.dev)).toEqual([]);
    // Meena's leave on Wednesday: she has no period then, but the class's attendance needs someone.
    const applied = await request(app).post("/api/v1/attendance/leaves/mine").set(auth(s.tokens.meena)).send({ fromDate: NEXT_WEDNESDAY, reason: "Wedding" });
    await request(app).post(`/api/v1/attendance/leaves/${applied.body.data.id}/decide`).set(auth(s.token)).send({ status: "approved" });
    const away = (await day(s.token, NEXT_WEDNESDAY)).body.data.away as { teacher: { id: string }; status: string; lessons: unknown[]; attendance: { options: unknown[] }[] }[];
    const meena = away.find((a) => a.teacher.id === s.meena)!;
    expect(meena).toMatchObject({ status: "leave", lessons: [] });
    expect(meena.attendance).toHaveLength(1);
    // The class has no period on a Wednesday, so nobody can be chosen yet.
    expect(meena.attendance[0].options).toEqual([]);
  });
});

describe("giving the attendance to a teacher", () => {
  it("the teacher chosen takes the class's attendance of that day: the sheet and the save, nothing else of the class", async () => {
    const s = await ready();
    await markAbsent(s.token, s.meena);
    // Before: Dev teaches the class but is not its class teacher.
    expect((await sheet(s.tokens.dev, s)).status).toBe(403);
    const made = await cover(s.token, s, s.dev);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(made.body.data.away.find((a: { teacher: { id: string } }) => a.teacher.id === s.meena).attendance[0].cover).toEqual({ id: s.dev, name: "Dev Patel", until: null });
    expect((await sheet(s.tokens.dev, s)).status).toBe(200);
    expect((await saveSheet(s.tokens.dev, s)).status).toBe(200);
    // One child on one day (the cell of the register).
    const mark = await request(app).put("/api/v1/classroom/attendance/student").set(auth(s.tokens.dev)).send({ studentId: s.asha.id, date: TODAY, status: "absent" });
    expect(mark.status, JSON.stringify(mark.body)).toBe(200);
    // Only that day, and only the day's sheet: another day, the register and a class that is not covered stay shut.
    expect((await sheet(s.tokens.dev, s, "2026-11-09")).status).toBe(403);
    expect((await saveSheet(s.tokens.dev, s, "2026-11-09")).status).toBe(403);
    const register = await request(app).get("/api/v1/classroom/attendance/register").query({ classId: s.a.classId, sectionId: s.a.sectionId, from: TODAY, to: TODAY }).set(auth(s.tokens.dev));
    expect(register.status).toBe(403);
    // Someone else who teaches nothing in the class is still refused.
    expect((await sheet(s.tokens.kiran, s)).status).toBe(403);
    // The school still only looks.
    expect((await saveSheet(s.token, s)).status).toBe(403);
  });

  it("the teacher's own classes list it for that day: Class teacher is not theirs, but it is there to open", async () => {
    const s = await ready();
    await markAbsent(s.token, s.meena);
    const before = (await request(app).get("/api/v1/classroom/my-classes").set(auth(s.tokens.dev))).body.data.items as { classId: string; isClassTeacher: boolean; coversToday: boolean }[];
    expect(before).toEqual([expect.objectContaining({ classId: s.a.classId, isClassTeacher: false, coversToday: false })]);
    await cover(s.token, s, s.dev);
    const after = (await request(app).get("/api/v1/classroom/my-classes").set(auth(s.tokens.dev))).body.data.items as { classId: string; isClassTeacher: boolean; coversToday: boolean }[];
    expect(after).toEqual([expect.objectContaining({ classId: s.a.classId, isClassTeacher: false, coversToday: true })]);
    // The class teacher still sees her class as hers.
    expect((await request(app).get("/api/v1/classroom/my-classes").set(auth(s.tokens.meena))).body.data.items[0]).toMatchObject({ isClassTeacher: true, coversToday: false });
  });

  it("a day to come: given ahead (Dev takes it on that Tuesday, not today)", async () => {
    const s = await ready();
    const applied = await request(app).post("/api/v1/attendance/leaves/mine").set(auth(s.tokens.meena)).send({ fromDate: NEXT_TUESDAY, reason: "Wedding" });
    await request(app).post(`/api/v1/attendance/leaves/${applied.body.data.id}/decide`).set(auth(s.token)).send({ status: "approved" });
    const made = await cover(s.token, s, s.dev, { date: NEXT_TUESDAY });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(made.body.data.date).toBe(NEXT_TUESDAY);
    // Today Dev is still nobody's cover.
    expect((await sheet(s.tokens.dev, s)).status).toBe(403);
    expect((await request(app).get("/api/v1/classroom/my-classes").set(auth(s.tokens.dev))).body.data.items[0].coversToday).toBe(false);
    // On that day the class is on his list.
    vi.spyOn(clock, "now").mockReturnValue(new Date(`${NEXT_TUESDAY}T09:00:00+05:30`));
    expect((await request(app).get("/api/v1/classroom/my-classes").set(auth(s.tokens.dev))).body.data.items[0].coversToday).toBe(true);
    expect((await sheet(s.tokens.dev, s, NEXT_TUESDAY)).status).toBe(200);
  });

  it("changing it moves the access; taking it away shuts it again", async () => {
    const s = await ready();
    await markAbsent(s.token, s.meena);
    await request(app).put(`${api}/arrangements`).set(auth(s.token)).send({ date: TODAY, ...s.a, period: 1, absentTeacherId: s.meena, substituteTeacherId: s.kiran });
    await cover(s.token, s, s.dev);
    expect((await cover(s.token, s, s.kiran)).status).toBe(200);
    expect((await sheet(s.tokens.dev, s)).status).toBe(403);
    expect((await sheet(s.tokens.kiran, s)).status).toBe(200);
    const off = await cover(s.token, s, null);
    expect(off.status).toBe(200);
    expect(off.body.data.away.find((a: { teacher: { id: string } }) => a.teacher.id === s.meena).attendance[0].cover).toBeNull();
    expect((await sheet(s.tokens.kiran, s)).status).toBe(403);
  });
});

describe("what is refused", () => {
  it("a teacher with no period in the class that day, a teacher who is not away, a day that is over, and a teacher who may not", async () => {
    const s = await ready();
    await markAbsent(s.token, s.meena);
    const notInClass = await cover(s.token, s, s.kiran);
    expect(notInClass.status).toBe(409);
    expect(notInClass.body.code).toBe("TEACHER_NOT_AVAILABLE");
    // Dev is present and not a class teacher: nothing to give.
    const notAway = await cover(s.token, s, s.kiran, { absentTeacherId: s.dev });
    expect(notAway.status).toBe(409);
    expect(notAway.body.code).toBe("NOT_AWAY");
    expect((await cover(s.token, s, s.dev, { date: "2026-11-09" })).status).toBe(400);
    expect((await cover(s.tokens.dev, s, s.dev)).status).toBe(403);
    expect((await cover(s.tokens.meena, s, s.dev)).status).toBe(403);
  });

  it("a teacher who is away too is not offered", async () => {
    const s = await ready();
    await markAbsent(s.token, s.meena);
    await markAbsent(s.token, s.dev);
    expect((await attendanceOf(s.token, s))![0].options).toEqual([]);
    expect((await cover(s.token, s, s.dev)).status).toBe(409);
  });
});

describe("the people are told, and a leave taken back lets go of it", () => {
  const heard = async (token: string) => ((await request(app).get("/api/v1/notifications").set(auth(token))).body.data.items as { kind: string; title: string; body: string; link: string | null }[]).filter((n) => n.kind === "timetable.substitute");

  it("the teacher hears it, with a link to the class's Attendance tab, and hears when it is taken off", async () => {
    const s = await ready();
    await markAbsent(s.token, s.meena);
    await cover(s.token, s, s.dev);
    await NotificationService.idle();
    const [added] = await heard(s.tokens.dev);
    expect(added.title).toMatch(/^You take the attendance of Class 5.* today$/);
    expect(added.body).toBe("in place of Meena Singh, the class teacher");
    expect(added.link).toBe(`/class-work/${s.a.classId}?section=${s.a.sectionId}&tab=attendance`);
    await cover(s.token, s, null);
    await NotificationService.idle();
    expect((await heard(s.tokens.dev)).map((n) => n.title).some((t) => /^Attendance of Class 5.* taken off today$/.test(t))).toBe(true);
  });

  it("taking the class teacher's leave back takes the cover away and tells the teacher", async () => {
    const s = await ready();
    const applied = await request(app).post("/api/v1/attendance/leaves/mine").set(auth(s.tokens.meena)).send({ fromDate: NEXT_TUESDAY, reason: "Wedding" });
    await request(app).post(`/api/v1/attendance/leaves/${applied.body.data.id}/decide`).set(auth(s.token)).send({ status: "approved" });
    expect((await cover(s.token, s, s.dev, { date: NEXT_TUESDAY })).status).toBe(200);
    const out = await request(app).post(`/api/v1/attendance/leaves/mine/${applied.body.data.id}/cancel`).set(auth(s.tokens.meena));
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    expect((await attendanceOf(s.token, s, NEXT_TUESDAY))).toBeUndefined();
    vi.spyOn(clock, "now").mockReturnValue(new Date(`${NEXT_TUESDAY}T09:00:00+05:30`));
    expect((await sheet(s.tokens.dev, s, NEXT_TUESDAY)).status).toBe(403);
    await NotificationService.idle();
    const released = (await heard(s.tokens.dev)).find((n) => n.title === "Arrangement taken off: Meena Singh is back");
    expect(released?.body).toBe("17 Nov");
  });
});

/**
 * A class teacher on leave for several days (2026-11-24, user: "jab tak teacher leave par hai tab tak dusra teacher hi attendance lega"): one Assign gives the
 * class's attendance from that day to the last day of her leave. Meena's leave is Tuesday 17 to Thursday 19 November; the class has periods on Tuesday and Wednesday.
 */
describe("a class teacher on leave for days: the attendance goes to one teacher until the leave ends", () => {
  const LAST = "2026-11-19";
  const at = (date: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${date}T09:00:00+05:30`));
  const onLeave = async (s: School) => {
    const applied = await request(app).post("/api/v1/attendance/leaves/mine").set(auth(s.tokens.meena)).send({ fromDate: NEXT_TUESDAY, toDate: LAST, reason: "Wedding" });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    expect((await request(app).post(`/api/v1/attendance/leaves/${applied.body.data.id}/decide`).set(auth(s.token)).send({ status: "approved" })).status).toBe(200);
    return applied.body.data.id as string;
  };
  const coverOf = async (s: School, date: string) => (await attendanceOf(s.token, s, date))?.[0];
  const canSee = async (token: string, s: School, date: string) => {
    at(date);
    return (await sheet(token, s, date)).status === 200;
  };

  it("one Assign on the first day covers every day of the leave, and each day says until when", async () => {
    const s = await ready([TUESDAY, WEDNESDAY]);
    await onLeave(s);
    const made = await cover(s.token, s, s.dev, { date: NEXT_TUESDAY });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(await coverOf(s, NEXT_TUESDAY)).toMatchObject({ cover: { id: s.dev, until: LAST }, leaveUntil: LAST });
    expect(await coverOf(s, NEXT_WEDNESDAY)).toMatchObject({ cover: { id: s.dev, until: LAST }, leaveUntil: LAST });
    expect(await coverOf(s, LAST)).toMatchObject({ cover: { id: s.dev, until: null }, leaveUntil: null });
    // The day after her leave she is back: nothing to arrange.
    expect(await coverOf(s, "2026-11-20")).toBeUndefined();
    expect(await canSee(s.tokens.dev, s, NEXT_TUESDAY)).toBe(true);
    expect(await canSee(s.tokens.dev, s, NEXT_WEDNESDAY)).toBe(true);
    expect(await canSee(s.tokens.dev, s, LAST)).toBe(true);
    expect(await canSee(s.tokens.dev, s, "2026-11-20")).toBe(false);
    // The class is on his list on each of those days, and on none after.
    at(NEXT_WEDNESDAY);
    expect((await request(app).get("/api/v1/classroom/my-classes").set(auth(s.tokens.dev))).body.data.items[0].coversToday).toBe(true);
    at("2026-11-20");
    expect((await request(app).get("/api/v1/classroom/my-classes").set(auth(s.tokens.dev))).body.data.items[0].coversToday).toBe(false);
  });

  it("the teacher hears it once, for the days: from the first day to the last", async () => {
    const s = await ready([TUESDAY, WEDNESDAY]);
    await onLeave(s);
    await cover(s.token, s, s.dev, { date: NEXT_TUESDAY });
    await NotificationService.idle();
    const heard = ((await request(app).get("/api/v1/notifications").set(auth(s.tokens.dev))).body.data.items as { kind: string; title: string }[]).filter((n) => n.kind === "timetable.substitute");
    expect(heard).toHaveLength(1);
    expect(heard[0].title).toMatch(/^You take the attendance of Class 5.* from 17 Nov to 19 Nov$/);
  });

  it("a change from a later day moves the days from there on; the days before stay with the first teacher", async () => {
    const s = await ready([TUESDAY, WEDNESDAY]);
    await onLeave(s);
    await cover(s.token, s, s.dev, { date: NEXT_TUESDAY });
    // Kiran is put in for her Wednesday period 1, so he takes a period of the class that day and can be chosen.
    const sub = await request(app).put(`${api}/arrangements`).set(auth(s.token)).send({ date: NEXT_WEDNESDAY, ...s.a, period: 1, absentTeacherId: s.meena, substituteTeacherId: s.kiran });
    expect(sub.status, JSON.stringify(sub.body)).toBe(200);
    expect((await cover(s.token, s, s.kiran, { date: NEXT_WEDNESDAY })).status).toBe(200);
    expect(await coverOf(s, NEXT_TUESDAY)).toMatchObject({ cover: { id: s.dev, until: null }, leaveUntil: LAST });
    expect(await coverOf(s, NEXT_WEDNESDAY)).toMatchObject({ cover: { id: s.kiran, until: LAST } });
    expect(await canSee(s.tokens.dev, s, NEXT_TUESDAY)).toBe(true);
    expect(await canSee(s.tokens.kiran, s, NEXT_TUESDAY)).toBe(false);
    expect(await canSee(s.tokens.dev, s, NEXT_WEDNESDAY)).toBe(false);
    expect(await canSee(s.tokens.kiran, s, NEXT_WEDNESDAY)).toBe(true);
    expect(await canSee(s.tokens.kiran, s, LAST)).toBe(true);
  });

  it("taking it away from a day removes that day and the days after it, and only those", async () => {
    const s = await ready([TUESDAY, WEDNESDAY]);
    await onLeave(s);
    await cover(s.token, s, s.dev, { date: NEXT_TUESDAY });
    const off = await cover(s.token, s, null, { date: NEXT_WEDNESDAY });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(await coverOf(s, NEXT_TUESDAY)).toMatchObject({ cover: { id: s.dev, until: null } });
    expect((await coverOf(s, NEXT_WEDNESDAY))!.cover).toBeNull();
    expect((await coverOf(s, LAST))!.cover).toBeNull();
    expect(await canSee(s.tokens.dev, s, NEXT_WEDNESDAY)).toBe(false);
    expect(await canSee(s.tokens.dev, s, NEXT_TUESDAY)).toBe(true);
  });

  it("taking the leave back takes every day of it away, and tells the teacher for those days", async () => {
    const s = await ready([TUESDAY, WEDNESDAY]);
    const leaveId = await onLeave(s);
    await cover(s.token, s, s.dev, { date: NEXT_TUESDAY });
    at(TODAY);
    const out = await request(app).post(`/api/v1/attendance/leaves/mine/${leaveId}/cancel`).set(auth(s.tokens.meena));
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    for (const date of [NEXT_TUESDAY, NEXT_WEDNESDAY, LAST]) expect(await canSee(s.tokens.dev, s, date)).toBe(false);
    await NotificationService.idle();
    const heard = ((await request(app).get("/api/v1/notifications").set(auth(s.tokens.dev))).body.data.items as { title: string; body: string }[]).find((n) => n.title === "Arrangement taken off: Meena Singh is back");
    expect(heard?.body).toBe("17 Nov, 18 Nov, 19 Nov");
  });

  it("a teacher marked absent for the day (no leave) is covered for that day only", async () => {
    const s = await ready([TUESDAY, WEDNESDAY]);
    await markAbsent(s.token, s.meena);
    expect((await cover(s.token, s, s.dev)).status).toBe(200);
    expect(await coverOf(s, TODAY)).toMatchObject({ cover: { id: s.dev, until: null }, leaveUntil: null });
    expect(await canSee(s.tokens.dev, s, "2026-11-11")).toBe(false);
  });
});
