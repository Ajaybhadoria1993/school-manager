import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addClass, auth } from "../../../test/timetable";

/**
 * What each class writes on which day: a paper is one subject on one day at one time for a duration, for one class or several at once
 * (the same date and time for them: a group of classes, or the whole school), with an optional topic and marks. A class cannot be in
 * two places at one time, and nothing is set on a holiday.
 */

const api = "/api/v1/exams";
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const EXAM = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-09-15", endDate: "2026-09-26", schoolStart: "08:00", schoolEnd: "12:30" };

async function setUp() {
  const s = await classroomSchool();
  const exam = (await request(app).post(api).set(auth(s.token)).send(EXAM)).body.data as { id: string };
  const paper = (subjectId: string, date: string, startTime = "09:00", durationMinutes = 180, over: object = {}) => ({ subjectId, date, startTime, durationMinutes, ...over });
  const add = (classIds: string[], papers: object[], examId = exam.id, token = s.token) => request(app).post(`${api}/${examId}/papers`).set(auth(token)).send({ classIds, papers });
  const detail = async (examId = exam.id) => (await request(app).get(`${api}/${examId}`).set(auth(s.token))).body.data;
  return { s, exam, paper, add, detail, both: [s.class5.id, s.class1.id] };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a timetable for some classes", () => {
  it("the same dates and times for several classes at once (or the whole school), each paper with its time, duration, marks and topic", async () => {
    const { s, exam, paper, add, detail, both } = await setUp();
    const res = await add(both, [
      paper(s.maths, "2026-09-15", "09:00", 180, { maxMarks: 80, topic: "Fractions and decimals" }),
      paper(s.english, "2026-09-17", "09:00", 90),
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({
      subject: { id: s.maths, name: "Mathematics" },
      date: "2026-09-15",
      startTime: "09:00",
      endTime: "12:00",
      durationMinutes: 180,
      maxMarks: 80,
      topic: "Fractions and decimals",
    });
    expect(res.body.data.items[0].classes.map((c: { name: string }) => c.name).sort()).toEqual(["Class 1", "Class 5"]);
    expect(res.body.data.items[0].classIds.slice().sort()).toEqual(both.slice().sort());
    expect(res.body.data.items[1]).toMatchObject({ endTime: "10:30", maxMarks: null, topic: null });

    const one = await detail();
    expect(one.papers.map((p: { subject: { name: string } }) => p.subject.name)).toEqual(["Mathematics", "English"]);
    expect(one).toMatchObject({ paperCount: 2, classCount: 2 });
    const list = await request(app).get(api).set(auth(s.token));
    expect(list.body.data.items[0]).toMatchObject({ id: exam.id, paperCount: 2, classCount: 2 });
  });

  it("some classes write on other days and times: a second timetable for them beside the first, in date order", async () => {
    const { s, paper, add, detail } = await setUp();
    await add([s.class5.id, s.class1.id], [paper(s.maths, "2026-09-15")]);
    const later = await add([s.class1.id], [paper(s.english, "2026-09-16", "10:00", 60), paper(s.maths, "2026-09-22", "08:30", 120)]);
    expect(later.status, JSON.stringify(later.body)).toBe(201);
    const papers = (await detail()).papers as { date: string; startTime: string; subject: { name: string }; classes: { name: string }[] }[];
    expect(papers.map((p) => `${p.date} ${p.startTime} ${p.subject.name}`)).toEqual(["2026-09-15 09:00 Mathematics", "2026-09-16 10:00 English", "2026-09-22 08:30 Mathematics"]);
    expect(papers[1].classes.map((c) => c.name)).toEqual(["Class 1"]);
  });

  it("refuses what cannot be, naming the row: no class, a subject or class of another school, a day outside the exam, a time outside school hours", async () => {
    const { s, exam, paper, add } = await setUp();
    expect(details(await add([], [paper(s.maths, "2026-09-15")]))).toContainEqual({ path: "classIds", message: "Choose at least one class" });
    expect(details(await add([s.class5.id], []))).toContainEqual({ path: "papers", message: "Add at least one paper" });
    expect(details(await add([s.class5.id], [paper("64b64b64b64b64b64b64b64b", "2026-09-15")]))).toContainEqual({ path: "papers.0.subjectId", message: "Choose a subject of this school" });
    expect(details(await add(["64b64b64b64b64b64b64b64b"], [paper(s.maths, "2026-09-15")]))).toContainEqual({ path: "classIds", message: "Choose classes of this school" });

    const early = await add([s.class5.id], [paper(s.maths, "2026-09-15"), paper(s.english, "2026-09-14")]);
    expect(early.status).toBe(400);
    expect(details(early)).toContainEqual({ path: "papers.1.date", message: "Choose a day from 15 Sep to 26 Sep, the days of this exam" });

    const hours = await add([s.class5.id], [paper(s.maths, "2026-09-15", "07:30", 60)]);
    expect(details(hours)).toContainEqual({ path: "papers.0.startTime", message: "The paper must fall inside school time, 8:00 AM to 12:30 PM" });
    expect(details(await add([s.class5.id], [paper(s.maths, "2026-09-15", "11:00", 120)]))).toContainEqual({ path: "papers.0.durationMinutes", message: "The paper must fall inside school time, 8:00 AM to 12:30 PM" });
    expect(details(await add([s.class5.id], [paper(s.maths, "2026-09-15", "09:00", 3)]))).toContainEqual({ path: "papers.0.durationMinutes", message: "The time is 5 minutes to 10 hours" });
    expect(details(await add([s.class5.id], [paper(s.maths, "2026-09-15", "9am", 60)]))).toContainEqual({ path: "papers.0.startTime", message: "Enter the start time" });
    expect(details(await add([s.class5.id], [paper(s.maths, "2026-09-15", "09:00", 60, { topic: "x".repeat(201) })]))).toContainEqual({ path: "papers.0.topic", message: "The topic is up to 200 letters" });
    expect((await add([s.class5.id], [paper(s.maths, "2026-09-15")], "64b64b64b64b64b64b64b64b")).body.code).toBe("EXAM_NOT_FOUND");
    expect(exam.id).toBeTruthy();
  });

  it("a test has no school hours to keep, but a paper cannot run past midnight", async () => {
    const { s, paper } = await setUp();
    const test = (await request(app).post(api).set(auth(s.token)).send({ name: "Class Test 1", type: "class_test", startDate: "2026-10-05" })).body.data;
    const ok = await request(app).post(`${api}/${test.id}/papers`).set(auth(s.token)).send({ classIds: [s.class5.id], papers: [paper(s.maths, "2026-10-05", "11:20", 40, { topic: "Chapter 3" })] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const late = await request(app).post(`${api}/${test.id}/papers`).set(auth(s.token)).send({ classIds: [s.class1.id], papers: [paper(s.maths, "2026-10-05", "23:30", 60)] });
    expect(details(late)).toContainEqual({ path: "papers.0.durationMinutes", message: "The paper must end by midnight" });
  });

  it("is all or nothing: one bad row saves none of the rows", async () => {
    const { s, paper, add, detail } = await setUp();
    const res = await add([s.class5.id], [paper(s.maths, "2026-09-15"), paper(s.english, "2026-10-30")]);
    expect(res.status).toBe(400);
    expect((await detail()).papers).toEqual([]);
  });
});

describe("a class cannot be in two places at one time", () => {
  it("refuses a paper that overlaps another of the same class that day, in this exam or in another one, and says which", async () => {
    const { s, exam, paper, add } = await setUp();
    await add([s.class5.id], [paper(s.maths, "2026-09-15", "09:00", 180)]);
    const clash = await add([s.class5.id, s.class1.id], [paper(s.english, "2026-09-15", "11:00", 60)]);
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("PAPER_CLASH");
    expect(clash.body.message).toBe("Class 5 already has Mathematics from 9:00 AM to 12:00 PM on 15 Sep (Half-Yearly Exam)");

    const other = (await request(app).post(api).set(auth(s.token)).send({ name: "Class Test 1", type: "class_test", startDate: "2026-09-15" })).body.data;
    const across = await add([s.class5.id], [paper(s.english, "2026-09-15", "10:00", 40)], other.id);
    expect(across.status).toBe(409);
    expect(across.body.code).toBe("PAPER_CLASH");
    // Another class, another day, or the next paper starting as the last one ends are all fine.
    expect((await add([s.class1.id], [paper(s.english, "2026-09-15", "10:00", 40)], other.id)).status).toBe(201);
    expect((await add([s.class5.id], [paper(s.english, "2026-09-16", "10:00", 40)])).status).toBe(201);
    expect((await add([s.class5.id], [paper(s.english, "2026-09-15", "12:00", 30)])).status).toBe(201);
    expect(exam.id).toBeTruthy();
  });

  it("refuses two rows of one batch that overlap for the same classes", async () => {
    const { s, paper, add, detail } = await setUp();
    const res = await add([s.class5.id], [paper(s.maths, "2026-09-15", "09:00", 120), paper(s.english, "2026-09-15", "10:00", 60)]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAPER_CLASH");
    expect((await detail()).papers).toEqual([]);
  });
});

describe("a holiday", () => {
  it("is not a day for a paper: the school's own holiday, with its name in the message", async () => {
    const { s, paper, add } = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Ganesh Visarjan", kind: "holiday", startDate: "2026-09-17" });
    const res = await add([s.class5.id], [paper(s.maths, "2026-09-16"), paper(s.english, "2026-09-17")]);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "PAPER_ON_HOLIDAY", message: "17 Sep is a holiday (Ganesh Visarjan): choose another day" });
    // An event is not a day off.
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Sports day", kind: "event", startDate: "2026-09-18" });
    expect((await add([s.class5.id], [paper(s.english, "2026-09-18")])).status).toBe(201);
  });
});

describe("changing and taking away a paper", () => {
  it("changes its time, classes and topic; the clash rule still holds, and it does not clash with itself", async () => {
    const { s, exam, paper, add, detail } = await setUp();
    const made = (await add([s.class5.id, s.class1.id], [paper(s.maths, "2026-09-15", "09:00", 120)])).body.data.items[0];
    await add([s.class5.id], [paper(s.english, "2026-09-16", "09:00", 120)]);

    const moved = await request(app).patch(`${api}/${exam.id}/papers/${made.id}`).set(auth(s.token)).send({ startTime: "09:30", durationMinutes: 90, topic: "Chapter 1 to 4", maxMarks: 50, classIds: [s.class5.id] });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.data).toMatchObject({ startTime: "09:30", endTime: "11:00", topic: "Chapter 1 to 4", maxMarks: 50, classes: [expect.objectContaining({ name: "Class 5" })] });

    const clash = await request(app).patch(`${api}/${exam.id}/papers/${made.id}`).set(auth(s.token)).send({ date: "2026-09-16", startTime: "10:00" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("PAPER_CLASH");
    const emptied = await request(app).patch(`${api}/${exam.id}/papers/${made.id}`).set(auth(s.token)).send({ topic: null, maxMarks: null });
    expect(emptied.body.data).toMatchObject({ topic: null, maxMarks: null });

    expect((await request(app).delete(`${api}/${exam.id}/papers/${made.id}`).set(auth(s.token))).status).toBe(200);
    expect((await detail()).papers).toHaveLength(1);
    expect((await request(app).delete(`${api}/${exam.id}/papers/${made.id}`).set(auth(s.token))).body.code).toBe("PAPER_NOT_FOUND");
  });

  it("an exam cannot be shortened, or its school hours narrowed, past a paper that is already in it", async () => {
    const { s, exam, paper, add } = await setUp();
    await add([s.class5.id], [paper(s.maths, "2026-09-24", "09:00", 180)]);
    const shorter = await request(app).patch(`${api}/${exam.id}`).set(auth(s.token)).send({ endDate: "2026-09-20" });
    expect(shorter.status).toBe(409);
    expect(shorter.body).toMatchObject({ code: "PAPERS_OUTSIDE", message: "1 paper falls outside these days: move or delete it first" });
    const narrower = await request(app).patch(`${api}/${exam.id}`).set(auth(s.token)).send({ schoolEnd: "11:00" });
    expect(narrower.status).toBe(409);
    expect(narrower.body.code).toBe("PAPERS_OUTSIDE");
    expect((await request(app).patch(`${api}/${exam.id}`).set(auth(s.token)).send({ endDate: "2026-09-25" })).status).toBe(200);
  });

  it("taking an exam away takes its papers, and the classes are free at that time again", async () => {
    const { s, exam, paper, add } = await setUp();
    await add([s.class5.id], [paper(s.maths, "2026-09-15")]);
    expect((await request(app).delete(`${api}/${exam.id}`).set(auth(s.token))).status).toBe(200);
    const again = (await request(app).post(api).set(auth(s.token)).send({ name: "Other", type: "class_test", startDate: "2026-09-15" })).body.data;
    expect((await add([s.class5.id], [paper(s.maths, "2026-09-15")], again.id)).status).toBe(201);
  });

  it("a class made inactive keeps its place on the papers: nothing of an exam is thrown away", async () => {
    const { s, paper, add, detail } = await setUp();
    const eight = await addClass(s.token, "Class 8");
    await add([s.class5.id, eight.id], [paper(s.maths, "2026-09-15")]);
    await add([eight.id], [paper(s.english, "2026-09-16")]);
    expect((await request(app).post(`/api/v1/academics/classes/${eight.id}/deactivate`).set(auth(s.token))).status).toBe(200);
    expect((await request(app).delete(`/api/v1/academics/classes/${eight.id}`).set(auth(s.token))).status).toBe(404);
    const kept = (await detail()).papers as { subject: { name: string }; classes: { name: string }[] }[];
    expect(kept.map((p) => [p.subject.name, p.classes.map((c) => c.name)])).toEqual([
      ["Mathematics", ["Class 5", "Class 8"]],
      ["English", ["Class 8"]],
    ]);
  });

  it("is changed only by the people who run the school", async () => {
    const { s, exam, paper, add } = await setUp();
    const made = (await add([s.class5.id], [paper(s.maths, "2026-09-15")])).body.data.items[0];
    for (const token of [s.tokens.meena, s.tokens.ravi]) {
      expect((await add([s.class5.id], [paper(s.english, "2026-09-16")], exam.id, token)).status).toBe(403);
      expect((await request(app).patch(`${api}/${exam.id}/papers/${made.id}`).set(auth(token)).send({ topic: "x" })).status).toBe(403);
      expect((await request(app).delete(`${api}/${exam.id}/papers/${made.id}`).set(auth(token))).status).toBe(403);
      expect((await request(app).delete(`${api}/${exam.id}`).set(auth(token))).status).toBe(403);
    }
  });
});
