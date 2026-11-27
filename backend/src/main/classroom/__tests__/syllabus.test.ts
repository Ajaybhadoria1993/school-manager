import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { NotificationService } from "../../notifications/services/notification.service";
import { todayInIndia } from "../../students/schemas/students.schemas";

/**
 * The chapters of a subject (docs/teaching-progress.md): the subject's teacher (or the class teacher, or the school) writes the chapters of
 * their subject in a class, then each day's diary says which chapter was taught, and that it is finished when it is.
 */

const API = "/api/v1/classroom";
const today = todayInIndia();
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
type Unit = { classId: string; sectionId: string | null };
interface Chapter {
  id: string;
  name: string;
  done: boolean;
}
const saveChapters = (token: string, u: Unit, subjectId: string, chapters: object[]) => request(app).put(`${API}/syllabus`).set(auth(token)).send({ ...u, subjectId, chapters });
const writeDiary = (token: string, u: Unit, body: object) => request(app).put(`${API}/diary`).set(auth(token)).send({ ...u, date: today, ...body });
const subjectOf = async (token: string, u: Unit, subjectId: string, date = today) => {
  const res = await request(app).get(`${API}/diary?classId=${u.classId}&sectionId=${u.sectionId ?? "none"}&date=${date}`).set(auth(token));
  return res.body.data.subjects.find((x: { subjectId: string }) => x.subjectId === subjectId);
};
const names = (...list: string[]) => list.map((name) => ({ name }));

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the chapters of a subject", () => {
  it("the subject's teacher writes the chapters; the day's diary shows them, none finished", async () => {
    const s = await classroomSchool();
    expect((await subjectOf(s.tokens.dev, s.a, s.english)).chapters).toEqual([]);
    const saved = await saveChapters(s.tokens.dev, s.a, s.english, names("The Kite", "My Family"));
    expect(saved.status).toBe(200);
    const english = await subjectOf(s.tokens.dev, s.a, s.english);
    expect(english.chapters.map((c: Chapter) => [c.name, c.done])).toEqual([
      ["The Kite", false],
      ["My Family", false],
    ]);
  });

  it("only the subject's teacher, the class teacher or the school writes them", async () => {
    const s = await classroomSchool();
    const notHis = await saveChapters(s.tokens.dev, s.a, s.maths, names("Numbers"));
    expect(notHis.status).toBe(403);
    expect(notHis.body.code).toBe("NOT_THEIR_SUBJECT");
    expect((await saveChapters(s.tokens.kiran, s.a, s.maths, names("Numbers"))).status).toBe(403);
    expect((await saveChapters(s.tokens.ravi, s.a, s.maths, names("Numbers"))).status).toBe(403);
    expect((await saveChapters(s.tokens.meena, s.a, s.english, names("The Kite"))).status).toBe(200);
    expect((await saveChapters(s.token, s.a, s.maths, names("Numbers"))).status).toBe(200);
  });

  it("a name is needed, and up to 60 chapters", async () => {
    const s = await classroomSchool();
    expect((await saveChapters(s.tokens.meena, s.a, s.maths, [{ name: "  " }])).status).toBe(400);
    expect((await saveChapters(s.tokens.meena, s.a, s.maths, Array.from({ length: 61 }, (_, i) => ({ name: `Chapter ${i + 1}` })))).status).toBe(400);
  });

  it("saved again, a chapter keeps its id; a finished one has today's date until it is opened again", async () => {
    const s = await classroomSchool();
    await saveChapters(s.tokens.meena, s.a, s.maths, names("Numbers", "Fractions"));
    const [numbers, fractions] = (await subjectOf(s.tokens.meena, s.a, s.maths)).chapters as Chapter[];
    const again = await saveChapters(s.tokens.meena, s.a, s.maths, [{ id: numbers.id, name: "Big numbers", done: true }, { id: fractions.id, name: "Fractions" }, { name: "Shapes" }]);
    expect(again.status).toBe(200);
    expect(again.body.data.chapters).toEqual([
      { id: numbers.id, name: "Big numbers", done: true, plannedOn: null, late: false },
      { id: fractions.id, name: "Fractions", done: false, plannedOn: null, late: false },
      expect.objectContaining({ name: "Shapes", done: false }),
    ]);
    const open = await saveChapters(s.tokens.meena, s.a, s.maths, [{ id: numbers.id, name: "Big numbers", done: false }]);
    expect(open.body.data.chapters).toEqual([{ id: numbers.id, name: "Big numbers", done: false, plannedOn: null, late: false }]);
  });

  it("a chapter that was taught is not taken off; one that was not is", async () => {
    const s = await classroomSchool();
    await saveChapters(s.tokens.meena, s.a, s.maths, names("Numbers", "Fractions"));
    const [numbers, fractions] = (await subjectOf(s.tokens.meena, s.a, s.maths)).chapters as Chapter[];
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, chapterId: numbers.id, taught: "Place value" });
    const res = await saveChapters(s.tokens.meena, s.a, s.maths, [{ id: fractions.id, name: "Fractions" }]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CHAPTER_IN_USE");
    expect((await saveChapters(s.tokens.meena, s.a, s.maths, [{ id: numbers.id, name: "Numbers" }])).status).toBe(200);
  });
});

describe("the day's chapter in the diary", () => {
  async function withChapters() {
    const s = await classroomSchool();
    await saveChapters(s.tokens.meena, s.a, s.maths, names("Numbers", "Fractions"));
    await saveChapters(s.tokens.dev, s.a, s.english, names("The Kite"));
    const [numbers, fractions] = (await subjectOf(s.tokens.meena, s.a, s.maths)).chapters as Chapter[];
    const [kite] = (await subjectOf(s.tokens.dev, s.a, s.english)).chapters as Chapter[];
    return { s, numbers, fractions, kite };
  }

  it("says which chapter was taught, and finishes it when told", async () => {
    const { s, fractions } = await withChapters();
    expect((await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, chapterId: fractions.id, taught: "Adding fractions" })).status).toBe(200);
    let maths = await subjectOf(s.tokens.meena, s.a, s.maths);
    expect(maths.entry.chapterId).toBe(fractions.id);
    expect(maths.chapters[1].done).toBe(false);
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, chapterId: fractions.id, taught: "Revision", chapterDone: true });
    maths = await subjectOf(s.tokens.meena, s.a, s.maths);
    expect(maths.chapters[1].done).toBe(true);
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, chapterId: fractions.id, taught: "Revision", chapterDone: false });
    expect((await subjectOf(s.tokens.meena, s.a, s.maths)).chapters[1].done).toBe(false);
  });

  it("the chapter alone is enough; saved without naming a chapter, the day keeps it; null takes it away", async () => {
    const { s, numbers } = await withChapters();
    expect((await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, chapterId: numbers.id })).status).toBe(200);
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, taught: "Place value" });
    expect((await subjectOf(s.tokens.meena, s.a, s.maths)).entry.chapterId).toBe(numbers.id);
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, chapterId: null, taught: "Place value" });
    expect((await subjectOf(s.tokens.meena, s.a, s.maths)).entry.chapterId).toBeNull();
  });

  it("only a chapter of that subject in that class", async () => {
    const { s, kite } = await withChapters();
    const res = await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, chapterId: kite.id, taught: "x" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CHAPTER_NOT_FOUND");
    expect((await subjectOf(s.tokens.meena, s.a, s.maths)).entry).toBeNull();
  });

  it("the parent sees the chapter of the day and how far each subject is", async () => {
    const { s, numbers, fractions } = await withChapters();
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, date: shift(today, -1), chapterId: numbers.id, taught: "Place value", chapterDone: true });
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, chapterId: fractions.id, taught: "Adding fractions", homework: "Page 42" });
    const data = (await request(app).get(`/api/v1/parent/children/${s.asha.id}/diary`).set(auth(s.tokens.ravi))).body.data;
    expect(data.entries).toEqual([expect.objectContaining({ subjectName: "Mathematics", chapter: { number: 2, name: "Fractions", done: false } })]);
    expect(data.progress).toEqual([
      { subjectName: "English", total: 1, done: 0, current: null },
      { subjectName: "Mathematics", total: 2, done: 1, current: { number: 2, name: "Fractions" } },
    ]);
    // A child of a class with nothing written yet.
    const mira = (await request(app).get(`/api/v1/parent/children/${s.mira.id}/diary`).set(auth(s.tokens.anil))).body.data;
    expect(mira.progress).toEqual([]);
  });

  it("the class teacher hears when another teacher writes their class's diary; the parents read the chapter", async () => {
    const { s, kite } = await withChapters();
    await writeDiary(s.tokens.dev, s.a, { subjectId: s.english, chapterId: kite.id });
    await NotificationService.idle();
    const bell = async (token: string) => (await request(app).get("/api/v1/notifications").set(auth(token))).body.data.items as { kind: string; title: string; body: string }[];
    expect((await bell(s.tokens.meena))[0]).toMatchObject({ kind: "diary.saved", title: "English diary of Class 5 - A" });
    expect((await bell(s.tokens.ravi))[0]).toMatchObject({ kind: "diary.saved", title: "Taught in English today", body: "Chapter 1: The Kite" });
  });
});
