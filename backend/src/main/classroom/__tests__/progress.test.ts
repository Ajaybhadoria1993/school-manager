import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { auth } from "../../../test/timetable";
import { todayInIndia } from "../../students/schemas/students.schemas";

/**
 * Teaching progress (docs/teaching-progress.md): who taught what, in which class and subject, how far the chapters are, and the homework,
 * for any days. The school sees every class; a class teacher their class's every subject; a subject's teacher their own subjects.
 */

const API = "/api/v1/classroom";
const today = todayInIndia();
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const yesterday = shift(today, -1);
const lastWeek = shift(today, -7);

interface Row {
  classLabel: string;
  subjectName: string;
  teacherName: string | null;
  chapters: { number: number; name: string; done: boolean; days: number; startedOn: string | null }[];
  current: { number: number; name: string } | null;
  updates: number;
  homework: number;
  last: { date: string; taught: string } | null;
}
const progress = (token: string, query: Record<string, string> = {}) => request(app).get(`${API}/progress`).query({ from: lastWeek, to: today, ...query }).set(auth(token));
const log = (token: string, query: Record<string, string> = {}) => request(app).get(`${API}/progress/log`).query({ from: lastWeek, to: today, ...query }).set(auth(token));
const rowsOf = async (token: string, query: Record<string, string> = {}) => (await progress(token, query)).body.data.rows as Row[];
const pairs = (rows: Row[]) => rows.map((r) => `${r.classLabel} / ${r.subjectName}`);

/** 5 - A: Maths taught yesterday (chapter 1, finished) and today (chapter 2), English once today with no chapter. */
async function taughtSchool() {
  const s = await classroomSchool();
  const put = (token: string, path: string, body: object) => request(app).put(`${API}${path}`).set(auth(token)).send({ ...s.a, ...body });
  const saved = await put(s.tokens.meena, "/syllabus", { subjectId: s.maths, chapters: [{ name: "Numbers" }, { name: "Fractions" }, { name: "Shapes" }] });
  const [numbers, fractions] = saved.body.data.chapters as { id: string }[];
  await put(s.tokens.meena, "/diary", { subjectId: s.maths, date: yesterday, chapterId: numbers.id, taught: "Place value", homework: "Page 4", chapterDone: true });
  await put(s.tokens.meena, "/diary", { subjectId: s.maths, date: today, chapterId: fractions.id, taught: "Adding fractions" });
  await put(s.tokens.dev, "/diary", { subjectId: s.english, date: today, taught: "Poem: The Kite", homework: "Learn the poem" });
  return s;
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("progress", () => {
  it("the school sees every subject of every class: the teacher, the chapters, the one going on, and the updates of the days asked", async () => {
    const s = await taughtSchool();
    const res = await progress(s.token);
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as Row[];
    expect(pairs(rows)).toEqual(["Class 5 / English", "Class 5 / Mathematics"]);
    const [english, maths] = rows;
    expect(maths).toMatchObject({ teacherName: "Meena Singh", current: { number: 2, name: "Fractions" }, updates: 2, homework: 1, last: { date: today, taught: "Adding fractions" } });
    expect(maths.chapters.map((c) => [c.number, c.name, c.done, c.days, c.startedOn])).toEqual([
      [1, "Numbers", true, 1, yesterday],
      [2, "Fractions", false, 1, today],
      [3, "Shapes", false, 0, null],
    ]);
    expect(english).toMatchObject({ teacherName: "Dev Patel", chapters: [], current: null, updates: 1, homework: 1 });
    expect(res.body.data.summary).toEqual({ updates: 3, homework: 2, chaptersDone: 1, chaptersTotal: 3, withoutUpdate: 0, behind: 0 });
  });

  it("the days asked change the updates, not how far the chapters are", async () => {
    const s = await taughtSchool();
    const data = (await progress(s.token, { from: yesterday, to: yesterday })).body.data;
    expect((data.rows as Row[]).map((r) => [r.subjectName, r.updates, r.homework, r.last?.taught ?? null])).toEqual([
      ["English", 0, 0, null],
      ["Mathematics", 1, 1, "Place value"],
    ]);
    expect(data.summary).toEqual({ updates: 1, homework: 1, chaptersDone: 1, chaptersTotal: 3, withoutUpdate: 1, behind: 0 });
  });

  it("filtered by class, subject or teacher; the choices are those of the whole scope", async () => {
    const s = await taughtSchool();
    expect(pairs(await rowsOf(s.token, { subjectId: s.maths }))).toEqual(["Class 5 / Mathematics"]);
    expect(pairs(await rowsOf(s.token, { teacherId: s.dev }))).toEqual(["Class 5 / English"]);
    expect(pairs(await rowsOf(s.token, { classId: s.a.classId, sectionId: s.a.sectionId! }))).toEqual(["Class 5 / English", "Class 5 / Mathematics"]);
    expect(await rowsOf(s.token, { classId: s.one.classId, sectionId: "none" })).toEqual([]);
    const options = (await progress(s.token, { subjectId: s.maths })).body.data.options;
    expect(options.classes).toEqual([{ classId: s.a.classId, sectionId: s.a.sectionId, label: "Class 5" }]);
    expect(options.subjects.map((x: { name: string }) => x.name)).toEqual(["English", "Mathematics"]);
    expect(options.teachers.map((x: { name: string }) => x.name)).toEqual(["Dev Patel", "Meena Singh"]);
  });

  it("a class teacher sees their class's every subject; a subject's teacher their own; a teacher with no class nothing", async () => {
    const s = await taughtSchool();
    expect(pairs(await rowsOf(s.tokens.meena))).toEqual(["Class 5 / English", "Class 5 / Mathematics"]);
    expect(pairs(await rowsOf(s.tokens.dev))).toEqual(["Class 5 / English"]);
    expect((await log(s.tokens.dev)).body.data.items.map((i: { subjectName: string }) => i.subjectName)).toEqual(["English"]);
    // Asking for what is not theirs gives nothing.
    expect(await rowsOf(s.tokens.dev, { subjectId: s.maths })).toEqual([]);
    expect(await rowsOf(s.tokens.kiran)).toEqual([]);
    expect((await log(s.tokens.kiran)).body.data.items).toEqual([]);
  });

  it("parents never; staff only when the school allows it", async () => {
    const s = await taughtSchool();
    expect((await progress(s.tokens.ravi)).status).toBe(403);
    expect((await log(s.tokens.ravi)).status).toBe(403);
    const reception = await addColleague(s.tenantId, "receptionist");
    expect((await progress(reception)).status).toBe(403);
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["progress.view"] });
    expect(pairs(await rowsOf(reception))).toEqual(["Class 5 / English", "Class 5 / Mathematics"]);
    expect((await log(reception)).body.data.items).toHaveLength(3);
  });

  it("the days are checked", async () => {
    const s = await classroomSchool();
    expect((await progress(s.token, { from: today, to: yesterday })).status).toBe(400);
    expect((await progress(s.token, { from: shift(today, -400), to: today })).status).toBe(400);
    expect((await request(app).get(`${API}/progress`).set(auth(s.token))).status).toBe(400);
  });
});

describe("the day by day list", () => {
  it("newest first, each with the class, the subject, the teacher, who wrote it, the chapter, what was taught and the homework", async () => {
    const s = await taughtSchool();
    const data = (await log(s.token)).body.data;
    expect(data).toMatchObject({ total: 3, page: 1 });
    expect(data.items.map((i: { date: string }) => i.date)).toEqual([today, today, yesterday]);
    expect(data.items[2]).toEqual({
      id: expect.any(String),
      date: yesterday,
      classId: s.a.classId,
      sectionId: s.a.sectionId,
      classLabel: "Class 5",
      subjectName: "Mathematics",
      teacherName: "Meena Singh",
      writtenBy: "Meena Singh",
      chapter: { number: 1, name: "Numbers" },
      taught: "Place value",
      homework: "Page 4",
    });
  });

  it("in pages", async () => {
    const s = await taughtSchool();
    const second = (await log(s.token, { page: "2", limit: "2" })).body.data;
    expect(second).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(second.items.map((i: { date: string }) => i.date)).toEqual([yesterday]);
  });
});
