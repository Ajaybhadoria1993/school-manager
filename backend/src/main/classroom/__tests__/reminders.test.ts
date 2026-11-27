import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { addTiming, auth } from "../../../test/timetable";
import { clock, instantAt } from "../../../utils/clock";
import { TeacherAttendance } from "../../attendance/models/TeacherAttendance";
import { NotificationService } from "../../notifications/services/notification.service";
import { Tenant } from "../../tenants/models/Tenant";
import { ReminderService } from "../services/reminders.service";

/**
 * What the school is reminded of (docs/teaching-progress.md), once a day at the school's time: a teacher who has not written today's diary,
 * and (once per chapter) a chapter whose planned day is gone and is not finished.
 */

const API = "/api/v1/classroom";
/** A Monday and a Sunday the tests stand on (both gone, so a diary may be written on them). */
const MONDAY = "2026-11-23";
const SUNDAY = "2026-11-22";
const at = (day: string, hour: number, minute = 0) => vi.spyOn(clock, "now").mockReturnValue(instantAt(day, hour * 60 + minute));

interface Line {
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
}
/** The reminders in a person's bell (other lines left out). */
async function bell(token: string, kind = "diary.reminder") {
  await NotificationService.idle();
  const items = (await request(app).get("/api/v1/notifications?limit=50").set(auth(token))).body.data.items as Line[];
  return items.filter((i) => i.kind === kind);
}
async function run() {
  await ReminderService.runDue();
  await NotificationService.idle();
}
const put = (token: string, path: string, body: object) => request(app).put(`${API}${path}`).set(auth(token)).send(body);
const settings = (token: string) => request(app).get(`${API}/reminder`).set(auth(token));

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the diary reminder", () => {
  it("at 4 PM tells each teacher the classes and subjects still to be written, and opens that diary", async () => {
    const s = await classroomSchool();
    at(MONDAY, 16, 0);
    await run();
    expect(await bell(s.tokens.meena)).toEqual([
      expect.objectContaining({ title: "Write today's diary", body: "Class 5 - A: Mathematics", link: `/class-work/${s.a.classId}?section=${s.a.sectionId}&tab=diary` }),
    ]);
    expect(await bell(s.tokens.dev)).toEqual([expect.objectContaining({ body: "Class 5 - A: English" })]);
    // Nobody else: not the school, not a teacher without a subject, not a parent.
    for (const token of [s.token, s.tokens.kiran, s.tokens.ravi]) expect(await bell(token)).toEqual([]);
  });

  it("not before the time, and only once a day", async () => {
    const s = await classroomSchool();
    at(MONDAY, 15, 59);
    await run();
    expect(await bell(s.tokens.meena)).toEqual([]);
    at(MONDAY, 16, 5);
    await run();
    await run();
    await Promise.all([ReminderService.runDue(), ReminderService.runDue()]);
    expect(await bell(s.tokens.meena)).toHaveLength(1);
    // The next day it comes again.
    at("2026-11-24", 16, 5);
    await run();
    expect(await bell(s.tokens.meena)).toHaveLength(2);
  });

  it("not at night, when the server only comes up late", async () => {
    const s = await classroomSchool();
    at(MONDAY, 22, 30);
    await run();
    expect(await bell(s.tokens.meena)).toEqual([]);
  });

  it("leaves out what is written already", async () => {
    const s = await classroomSchool();
    await put(s.tokens.meena, "/diary", { ...s.a, subjectId: s.maths, date: MONDAY, taught: "Place value" });
    at(MONDAY, 16, 0);
    await run();
    expect(await bell(s.tokens.meena)).toEqual([]);
    expect(await bell(s.tokens.dev)).toHaveLength(1);
  });

  it("not on a Sunday or a holiday", async () => {
    const s = await classroomSchool();
    at(SUNDAY, 16, 0);
    await run();
    expect(await bell(s.tokens.meena)).toEqual([]);
    await request(app).post(`${API}/calendar`).set(auth(s.token)).send({ title: "Guru Nanak Jayanti", kind: "holiday", startDate: MONDAY });
    at(MONDAY, 16, 0);
    await run();
    expect(await bell(s.tokens.meena)).toEqual([]);
  });

  it("not to a teacher who is away that day", async () => {
    const s = await classroomSchool();
    await TeacherAttendance.create({ tenantId: s.tenantId, academicYearId: s.yearId, teacherId: s.dev, date: new Date(`${MONDAY}T00:00:00.000Z`), mark: "absent", source: "school" });
    at(MONDAY, 16, 0);
    await run();
    expect(await bell(s.tokens.dev)).toEqual([]);
    expect(await bell(s.tokens.meena)).toHaveLength(1);
  });

  it("with a published timetable, only the subjects the class has that day", async () => {
    const s = await classroomSchool();
    await addTiming(s.token, { days: [1, 2, 3, 4, 5, 6] });
    // Monday: Mathematics only; English comes another day.
    const cells = [
      { day: 1, period: 1, lessons: [{ subjectId: s.maths }] },
      { day: 2, period: 1, lessons: [{ subjectId: s.english }] },
    ];
    expect((await request(app).put("/api/v1/timetable/grid").set(auth(s.token)).send({ ...s.a, cells })).status).toBe(200);
    expect((await request(app).post("/api/v1/timetable/grid/publish").set(auth(s.token)).send(s.a)).status).toBe(200);
    at(MONDAY, 16, 0);
    await run();
    expect(await bell(s.tokens.meena)).toHaveLength(1);
    expect(await bell(s.tokens.dev)).toEqual([]);
  });

  it("not for a suspended school", async () => {
    const s = await classroomSchool();
    await Tenant.updateOne({ _id: s.tenantId }, { $set: { isActive: false } });
    at(MONDAY, 16, 0);
    await run();
    await Tenant.updateOne({ _id: s.tenantId }, { $set: { isActive: true } });
    expect(await bell(s.tokens.meena)).toEqual([]);
  });

  it("each school its own", async () => {
    const one = await classroomSchool();
    const two = await classroomSchool("Hill View School", "hill.");
    await put(two.token, "/reminder", { enabled: false, time: "16:00" });
    at(MONDAY, 16, 0);
    await run();
    expect(await bell(one.tokens.meena)).toHaveLength(1);
    expect(await bell(two.tokens.meena)).toEqual([]);
  });
});

describe("the school's choice", () => {
  it("is on at 4 PM until the school says otherwise", async () => {
    const s = await classroomSchool();
    expect((await settings(s.token)).body.data).toEqual({ enabled: true, time: "16:00" });
    const saved = await put(s.token, "/reminder", { enabled: true, time: "13:30" });
    expect(saved.status).toBe(200);
    expect((await settings(s.token)).body.data).toEqual({ enabled: true, time: "13:30" });
    at(MONDAY, 13, 30);
    await run();
    expect(await bell(s.tokens.meena)).toHaveLength(1);
  });

  it("switched off, no teacher is reminded", async () => {
    const s = await classroomSchool();
    await put(s.token, "/reminder", { enabled: false, time: "16:00" });
    at(MONDAY, 17, 0);
    await run();
    expect(await bell(s.tokens.meena)).toEqual([]);
  });

  it("takes a time between noon and 9 PM", async () => {
    const s = await classroomSchool();
    for (const time of ["11:59", "21:30", "4 PM", "", "16:61"]) expect((await put(s.token, "/reminder", { enabled: true, time })).status, time).toBe(400);
    expect((await put(s.token, "/reminder", { enabled: true })).status).toBe(400);
  });

  it("is the school's admin's and principal's", async () => {
    const s = await classroomSchool();
    const principal = await addColleague(s.tenantId, "principal");
    expect((await put(principal, "/reminder", { enabled: false, time: "16:00" })).status).toBe(200);
    for (const token of [s.tokens.meena, s.tokens.ravi]) {
      expect((await settings(token)).status).toBe(403);
      expect((await put(token, "/reminder", { enabled: true, time: "16:00" })).status).toBe(403);
    }
  });
});

describe("chapters behind schedule", () => {
  /** Maths: two chapters planned for 10 April (one finished), English: one planned for later. */
  async function planned() {
    const s = await classroomSchool();
    await put(s.tokens.meena, "/syllabus", { ...s.a, subjectId: s.maths, chapters: [{ name: "Numbers", plannedOn: "2026-04-10" }, { name: "Fractions", plannedOn: "2026-04-10", done: true }] });
    await put(s.tokens.dev, "/syllabus", { ...s.a, subjectId: s.english, chapters: [{ name: "The Kite", plannedOn: "2026-11-23" }] });
    return s;
  }

  it("tells the teacher and the school once, naming the class, the subject and the chapter", async () => {
    const s = await planned();
    at(MONDAY, 16, 0);
    await run();
    expect(await bell(s.tokens.meena, "syllabus.behind")).toEqual([
      expect.objectContaining({ title: "A chapter is behind schedule", body: "Class 5 - A Mathematics: Numbers", link: "/teaching-progress?tab=chapters&behind=1" }),
    ]);
    expect(await bell(s.token, "syllabus.behind")).toHaveLength(1);
    // The one planned for today is not late yet; a parent is never told.
    expect(await bell(s.tokens.dev, "syllabus.behind")).toEqual([]);
    expect(await bell(s.tokens.ravi, "syllabus.behind")).toEqual([]);

    // The next day: English is late now (its teacher and the class teacher hear); Mathematics was told already.
    at("2026-11-24", 16, 0);
    await run();
    expect(await bell(s.tokens.dev, "syllabus.behind")).toEqual([expect.objectContaining({ body: "Class 5 - A English: The Kite" })]);
    expect((await bell(s.tokens.meena, "syllabus.behind")).map((l) => l.body)).toEqual(["Class 5 - A English: The Kite", "Class 5 - A Mathematics: Numbers"]);
    at("2026-11-25", 16, 0);
    await run();
    expect(await bell(s.token, "syllabus.behind")).toHaveLength(2);
  });

  it("several at once come as one line", async () => {
    const s = await planned();
    at("2026-11-24", 16, 0);
    await run();
    expect(await bell(s.token, "syllabus.behind")).toEqual([
      expect.objectContaining({ title: "2 chapters are behind schedule", body: "Class 5 - A English: The Kite; Class 5 - A Mathematics: Numbers" }),
    ]);
  });

  it("comes even with the diary reminder off; a chapter given a new day is told again when that day goes", async () => {
    const s = await planned();
    await put(s.token, "/reminder", { enabled: false, time: "16:00" });
    at(MONDAY, 16, 0);
    await run();
    expect(await bell(s.token, "syllabus.behind")).toHaveLength(1);
    const maths = (await request(app).get(`${API}/diary?classId=${s.a.classId}&sectionId=${s.a.sectionId}&date=${MONDAY}`).set(auth(s.token))).body.data.subjects.find(
      (x: { subjectId: string }) => x.subjectId === s.maths
    );
    await put(s.tokens.meena, "/syllabus", { ...s.a, subjectId: s.maths, chapters: maths.chapters.map((c: { id: string; name: string }, i: number) => ({ id: c.id, name: c.name, ...(i === 0 ? { plannedOn: "2026-11-24" } : {}) })) });
    await put(s.token, "/syllabus", { ...s.a, subjectId: s.english, chapters: [] });
    at("2026-11-25", 16, 0);
    await run();
    expect((await bell(s.token, "syllabus.behind")).map((l) => l.body)).toEqual(["Class 5 - A Mathematics: Numbers", "Class 5 - A Mathematics: Numbers"]);
  });
});
