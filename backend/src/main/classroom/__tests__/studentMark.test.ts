import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addTeacher, addTiming, auth } from "../../../test/timetable";
import { Notification } from "../../notifications/models/Notification";
import { NotificationService } from "../../notifications/services/notification.service";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { AttendanceDay } from "../models/AttendanceDay";

/**
 * The CLASS TEACHER marks ONE child on ONE day (2026-11-17), from the cells of the register in their class page: Present or Absent, nothing
 * else about the class changes. The school (admin, principal, any staff) only looks: it cannot mark. The day is then only partly marked (`partial`): the class is still "not taken" for the principal's warning and
 * the class teacher's sheet shows it unsaved, until every child is marked or the sheet is saved.
 */

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = todayInIndia();
const yesterday = shift(today, -1);
const THU = "2026-11-05";
const at = (day: string, hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));

type Unit = { classId: string; sectionId: string | null };
const mark = (token: string, date: string, studentId: string, status: string) => request(app).put("/api/v1/classroom/attendance/student").set(auth(token)).send({ studentId, date, status });
const range = (token: string, unit: Unit, date: string) => request(app).get(`/api/v1/attendance/students?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}&from=${date}&to=${date}`).set(auth(token));
const sheet = (token: string, unit: Unit, date: string) => request(app).get(`/api/v1/classroom/attendance?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}&date=${date}`).set(auth(token));
const save = (token: string, unit: Unit, date: string, marks: object[]) => request(app).put("/api/v1/classroom/attendance").set(auth(token)).send({ ...unit, date, marks });
type Row = { name: string; records: { date: string; status: string; reason: string | null }[] };
const recordsOf = (res: { body: { data: { students: Row[] } } }) => Object.fromEntries(res.body.data.students.map((st) => [st.name, st.records]));

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => vi.restoreAllMocks());

describe("one child, one day", () => {
  it("marks that child and no one else: the others have no mark, the day shows as taken", async () => {
    const s = await classroomSchool();
    const res = await mark(s.tokens.meena, yesterday, s.kabir.id, "absent");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ studentId: s.kabir.id, date: yesterday, status: "absent" });
    const read = await range(s.token, s.a, yesterday);
    expect(read.body.data.days).toEqual([{ date: yesterday, weekday: expect.any(Number), holiday: null, taken: true }]);
    const records = recordsOf(read);
    expect(records["Kabir Rao"]).toEqual([{ date: yesterday, status: "absent", reason: null }]);
    expect(records["Asha Verma"]).toEqual([]);
  });

  it("changes a mark that was already there (Absent, then Present): still one mark for the child", async () => {
    const s = await classroomSchool();
    await mark(s.tokens.meena, yesterday, s.kabir.id, "absent");
    const again = await mark(s.tokens.meena, yesterday, s.kabir.id, "present");
    expect(again.status).toBe(200);
    expect(recordsOf(await range(s.token, s.a, yesterday))["Kabir Rao"]).toEqual([{ date: yesterday, status: "present", reason: null }]);
    const doc = await AttendanceDay.findOne({ tenantId: s.tenantId, classId: s.a.classId, date: new Date(`${yesterday}T00:00:00.000Z`) }).lean();
    expect(doc?.marks).toHaveLength(1);
  });

  it("a second child is added to the same day, the first is kept", async () => {
    const s = await classroomSchool();
    await mark(s.tokens.meena, yesterday, s.kabir.id, "absent");
    await mark(s.tokens.meena, yesterday, s.asha.id, "present");
    const records = recordsOf(await range(s.token, s.a, yesterday));
    expect(records["Kabir Rao"][0].status).toBe("absent");
    expect(records["Asha Verma"][0].status).toBe("present");
    expect(await AttendanceDay.countDocuments({ tenantId: s.tenantId, classId: s.a.classId, date: new Date(`${yesterday}T00:00:00.000Z`) })).toBe(1);
  });

  it("a late mark the class teacher gave is replaced by what the school says (Present), and Late is not a choice here", async () => {
    const s = await classroomSchool();
    await save(s.tokens.meena, s.a, yesterday, [{ studentId: s.asha.id, status: "late" }, { studentId: s.kabir.id, status: "present" }]);
    expect((await mark(s.tokens.meena, yesterday, s.asha.id, "late")).status).toBe(400);
    expect((await mark(s.tokens.meena, yesterday, s.asha.id, "leave")).status).toBe(400);
    expect((await mark(s.tokens.meena, yesterday, s.asha.id, "absent")).status).toBe(200);
    expect(recordsOf(await range(s.token, s.a, yesterday))["Asha Verma"][0].status).toBe("absent");
  });

  it("works for a class without sections too (its own class teacher)", async () => {
    const s = await classroomSchool();
    const anita = await addTeacher(s.token, "Anita Rao", { mobile: "9876500001", login: { username: "sun.anita", password: "Sch00l@Login1" } });
    await request(app).put("/api/v1/staff/class-teachers").set(auth(s.token)).send({ ...s.one, teacherId: anita });
    const anitaToken = (await request(app).post("/api/v1/auth/login").send({ identifier: "sun.anita", password: "Sch00l@Login1" })).body.data.accessToken as string;
    const res = await mark(anitaToken, yesterday, s.mira.id, "present");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(recordsOf(await range(s.token, s.one, yesterday))["Mira Shah"][0].status).toBe("present");
  });
});

describe("a day that is only partly marked is not a day that was taken", () => {
  it("the class teacher opens it unsaved: the school's mark is there, the others are Present to start with; saving the sheet makes it taken", async () => {
    const s = await classroomSchool();
    await mark(s.tokens.meena, yesterday, s.kabir.id, "absent");
    const opened = (await sheet(s.tokens.meena, s.a, yesterday)).body.data;
    expect(opened.saved).toBe(false);
    expect(opened.students.map((st: { name: string; status: string }) => [st.name, st.status])).toEqual([
      ["Asha Verma", "present"],
      ["Kabir Rao", "absent"],
    ]);
    const saved = await save(s.tokens.meena, s.a, yesterday, opened.students.map((st: { id: string; status: string }) => ({ studentId: st.id, status: st.status })));
    expect(saved.body.data.saved).toBe(true);
    const doc = await AttendanceDay.findOne({ tenantId: s.tenantId, classId: s.a.classId, date: new Date(`${yesterday}T00:00:00.000Z`) }).lean();
    expect(doc?.partial).toBe(false);
  });

  it("the class stays on the principal's 'not taken today' list until every child is marked", async () => {
    const s = await classroomSchool();
    await addTiming(s.token);
    at(THU, "09:00");
    const pending = async () => ((await request(app).get("/api/v1/attendance/students/today").set(auth(s.token))).body.data.pending as { label: string }[]).map((p) => p.label);
    expect(await pending()).toContain("Class 5");
    await mark(s.tokens.meena, THU, s.kabir.id, "absent");
    expect(await pending()).toContain("Class 5");
    await mark(s.tokens.meena, THU, s.asha.id, "present");
    expect(await pending()).not.toContain("Class 5");
  });

  it("a day the class teacher saved in full stays taken when the school changes one mark", async () => {
    const s = await classroomSchool();
    await addTiming(s.token);
    at(THU, "09:00");
    await save(s.tokens.meena, s.a, THU, [{ studentId: s.asha.id, status: "present" }, { studentId: s.kabir.id, status: "present" }]);
    await mark(s.tokens.meena, THU, s.kabir.id, "absent");
    const pending = ((await request(app).get("/api/v1/attendance/students/today").set(auth(s.token))).body.data.pending as { label: string }[]).map((p) => p.label);
    expect(pending).not.toContain("Class 5");
    expect((await sheet(s.token, s.a, THU)).body.data.saved).toBe(true);
  });
});

describe("who may mark, and when", () => {
  it("only the class teacher of that class may: the school (admin), another teacher, a teacher of no class and a parent may not", async () => {
    const s = await classroomSchool();
    expect((await mark(s.tokens.meena, yesterday, s.asha.id, "present")).status).toBe(200);
    for (const token of [s.token, s.tokens.dev, s.tokens.kiran]) {
      const res = await mark(token, yesterday, s.asha.id, "absent");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_CLASS_TEACHER");
    }
    expect((await mark(s.tokens.ravi, yesterday, s.asha.id, "absent")).status).toBe(403);
    // Nothing the school tried changed the day.
    expect(recordsOf(await range(s.token, s.a, yesterday))["Asha Verma"].map((r) => r.status)).toEqual(["present"]);
  });

  it("not for a day still to come, and not on a holiday", async () => {
    const s = await classroomSchool();
    const future = await mark(s.tokens.meena, shift(today, 1), s.asha.id, "present");
    expect(future.status).toBe(400);
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: yesterday });
    const holiday = await mark(s.tokens.meena, yesterday, s.asha.id, "present");
    expect(holiday.status).toBe(409);
    expect(holiday.body.code).toBe("HOLIDAY");
  });

  it("a request that is not a child, a day and Present or Absent is refused", async () => {
    const s = await classroomSchool();
    const send = (body: object) => request(app).put("/api/v1/classroom/attendance/student").set(auth(s.token)).send(body);
    expect((await send({ date: yesterday, status: "present" })).status).toBe(400);
    expect((await send({ studentId: "not-an-id", date: yesterday, status: "present" })).status).toBe(400);
    expect((await send({ studentId: s.asha.id, date: "yesterday", status: "present" })).status).toBe(400);
    expect((await send({ studentId: s.asha.id, date: yesterday })).status).toBe(400);
  });

  it("a child who is not in the school's classes any more (made inactive) cannot be marked", async () => {
    const s = await classroomSchool();
    const off = await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [s.asha.id], reason: "Left the school" });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const res = await mark(s.tokens.meena, yesterday, s.asha.id, "absent");
    expect(res.status).toBe(404);
  });
});

describe("one school never marks another's child", () => {
  it("is refused as if the child did not exist, and the other school's day is untouched", async () => {
    const s = await classroomSchool();
    const other = await classroomSchool("Moonrise Public School", "moon.");
    const res = await mark(s.tokens.meena, yesterday, other.asha.id, "absent");
    expect(res.status).toBe(404);
    const theirs = await range(other.token, other.a, yesterday);
    expect(theirs.body.data.days[0].taken).toBe(false);
    expect(recordsOf(theirs)["Asha Verma"]).toEqual([]);
  });
});

describe("the parent hears of an absence once (2026-11-17)", () => {
  it("a bell line to the child's parent when the school marks them absent, nothing more when it says so again or says Present, and nothing for the staff", async () => {
    const s = await classroomSchool();
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    const lines = async (token: string) => ((await request(app).get("/api/v1/notifications").set(auth(token))).body.data.items as { kind: string; title: string }[]).filter((i) => i.kind === "attendance.saved");
    await mark(s.tokens.meena, yesterday, s.asha.id, "absent");
    await NotificationService.idle();
    expect(await lines(s.tokens.ravi)).toEqual([expect.objectContaining({ title: "Asha Verma was absent" })]);
    await mark(s.tokens.meena, yesterday, s.asha.id, "absent");
    await mark(s.tokens.meena, yesterday, s.asha.id, "present");
    await NotificationService.idle();
    expect(await lines(s.tokens.ravi)).toHaveLength(1);
    expect(await lines(s.tokens.meena)).toHaveLength(0);
    expect(await lines(s.tokens.sita)).toHaveLength(0);
  });
});

describe("the class teacher reads the register of their own class (2026-11-17)", () => {
  const register = (token: string, unit: Unit, from: string, to: string) =>
    request(app).get(`/api/v1/classroom/attendance/register?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}&from=${from}&to=${to}`).set(auth(token));

  it("the class teacher gets the children of their class with their marks for the days asked, the same sheet the school reads", async () => {
    const s = await classroomSchool();
    await mark(s.tokens.meena, yesterday, s.kabir.id, "absent");
    const res = await register(s.tokens.meena, s.a, yesterday, yesterday);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ label: "Class 5", from: yesterday, to: yesterday });
    expect(res.body.data.days).toEqual([{ date: yesterday, weekday: expect.any(Number), holiday: null, taken: true }]);
    expect(recordsOf(res)["Kabir Rao"]).toEqual([{ date: yesterday, status: "absent", reason: null }]);
    expect(recordsOf(res)["Asha Verma"]).toEqual([]);
    expect(res.body.data.students).toHaveLength(2);
  });

  it("the school may look at it too; another teacher, a teacher of no class and a parent may not", async () => {
    const s = await classroomSchool();
    expect((await register(s.token, s.a, yesterday, yesterday)).status).toBe(200);
    for (const token of [s.tokens.dev, s.tokens.kiran]) {
      const res = await register(token, s.a, yesterday, yesterday);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_CLASS_TEACHER");
    }
    expect((await register(s.tokens.ravi, s.a, yesterday, yesterday)).status).toBe(403);
  });

  it("one class or section at a time (not 'all'), the days well formed, and only this school's classes", async () => {
    const s = await classroomSchool();
    const all = await request(app).get(`/api/v1/classroom/attendance/register?classId=${s.a.classId}&sectionId=all&from=${yesterday}&to=${yesterday}`).set(auth(s.tokens.meena));
    expect(all.status).toBe(400);
    expect((await register(s.tokens.meena, s.a, "yesterday", yesterday)).status).toBe(400);
    const other = await classroomSchool("Moonrise Public School", "moon.");
    expect((await register(s.tokens.meena, other.a, yesterday, yesterday)).status).toBe(404);
  });
});
