import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";

/**
 * The class timetable gives way on exam days (2026-11-06): in the week of a class (Monday to Sunday) each day on which the class has a
 * paper is listed with the papers and the school's hours; a day of a full exam (Half-yearly...) takes the place of that day's lessons,
 * a test (Unit, Class test) goes on top of them. A day with no paper is not listed. 14 Sep 2026 is a Monday.
 */

const api = "/api/v1/exams";
const FULL = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-09-14", endDate: "2026-09-30", schoolStart: "08:00", schoolEnd: "12:30" };
const TEST = { name: "Class test 1", type: "class_test", startDate: "2026-09-14", endDate: "2026-09-30" };

interface Day {
  date: string;
  day: number;
  replacesLessons: boolean;
  schoolHours: { start: string; end: string } | null;
  exams: { id: string; name: string; typeLabel: string; full: boolean }[];
  papers: { subject: { name: string }; startTime: string; endTime: string }[];
}

async function setUp() {
  const s = await classroomSchool();
  const make = async (over: object) => (await request(app).post(api).set(auth(s.token)).send(over)).body.data as { id: string };
  const addPaper = async (examId: string, classIds: string[], subjectId: string, date: string, over: object = {}) => {
    const res = await request(app)
      .post(`${api}/${examId}/papers`)
      .set(auth(s.token))
      .send({ classIds, papers: [{ subjectId, date, startTime: "09:00", durationMinutes: 60, ...over }] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  };
  const week = async (token: string, date: string, u: { classId: string; sectionId: string | null } = s.a) => {
    const res = await request(app).get(`${api}/class?classId=${u.classId}&sectionId=${u.sectionId ?? "none"}&date=${date}`).set(auth(token));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data.week as { from: string; to: string; days: Day[] };
  };
  return { s, make, addPaper, week };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the exam days of a class's week", () => {
  it("names the week (Monday to Sunday) that holds the day asked for", async () => {
    const { s, week } = await setUp();
    expect(await week(s.token, "2026-09-16")).toMatchObject({ from: "2026-09-14", to: "2026-09-20", days: [] });
    expect(await week(s.token, "2026-09-20")).toMatchObject({ from: "2026-09-14", to: "2026-09-20" }); // a Sunday belongs to the week before it
    expect(await week(s.token, "2026-09-14")).toMatchObject({ from: "2026-09-14", to: "2026-09-20" });
    expect(await week(s.token, "2026-09-21")).toMatchObject({ from: "2026-09-21", to: "2026-09-27" });
  });

  it("a day of a full exam takes the place of the lessons: the papers and the school's hours of that day", async () => {
    const { s, make, addPaper, week } = await setUp();
    const exam = await make(FULL);
    await addPaper(exam.id, [s.class5.id], s.maths, "2026-09-16", { startTime: "09:00", durationMinutes: 90 });
    await addPaper(exam.id, [s.class5.id], s.english, "2026-09-16", { startTime: "11:00", durationMinutes: 60 });
    const w = await week(s.tokens.dev, "2026-09-17");
    expect(w.days).toHaveLength(1);
    expect(w.days[0]).toMatchObject({ date: "2026-09-16", day: 3, replacesLessons: true, schoolHours: { start: "08:00", end: "12:30" } });
    expect(w.days[0].exams).toEqual([{ id: exam.id, name: "Half-Yearly Exam", typeLabel: "Half-yearly exam", full: true }]);
    expect(w.days[0].papers.map((p) => `${p.subject.name} ${p.startTime}-${p.endTime}`)).toEqual(["Mathematics 09:00-10:30", "English 11:00-12:00"]);
  });

  it("a test goes on top of a day that runs as usual", async () => {
    const { s, make, addPaper, week } = await setUp();
    const test = await make(TEST);
    await addPaper(test.id, [s.class5.id], s.maths, "2026-09-15", { startTime: "13:00" });
    const w = await week(s.token, "2026-09-15");
    expect(w.days[0]).toMatchObject({ date: "2026-09-15", day: 2, replacesLessons: false, schoolHours: null });
  });

  it("a test on the day of a full exam: the day is still the exam's, with both listed", async () => {
    const { s, make, addPaper, week } = await setUp();
    const full = await make(FULL);
    const test = await make(TEST);
    await addPaper(full.id, [s.class5.id], s.maths, "2026-09-16", { startTime: "09:00" });
    await addPaper(test.id, [s.class5.id], s.english, "2026-09-16", { startTime: "11:00" });
    const day = (await week(s.token, "2026-09-16")).days[0];
    expect(day.replacesLessons).toBe(true);
    expect(day.schoolHours).toEqual({ start: "08:00", end: "12:30" });
    expect(day.exams.map((e) => e.name).sort()).toEqual(["Class test 1", "Half-Yearly Exam"]);
    expect(day.papers).toHaveLength(2);
  });

  it("only this class's papers, only this week's, a Sunday included, in date order", async () => {
    const { s, make, addPaper, week } = await setUp();
    const exam = await make(FULL);
    await addPaper(exam.id, [s.class5.id], s.maths, "2026-09-14");
    await addPaper(exam.id, [s.class5.id], s.english, "2026-09-20");
    await addPaper(exam.id, [s.class5.id], s.maths, "2026-09-21"); // next week
    await addPaper(exam.id, [s.class1.id], s.maths, "2026-09-16"); // another class
    const days = (await week(s.token, "2026-09-17")).days;
    expect(days.map((d) => [d.date, d.day])).toEqual([["2026-09-14", 1], ["2026-09-20", 7]]);
    expect((await week(s.token, "2026-09-17", s.one)).days.map((d) => d.date)).toEqual(["2026-09-16"]);
  });

  it("a paper shared by two classes is on the days of both", async () => {
    const { s, make, addPaper, week } = await setUp();
    const exam = await make(FULL);
    await addPaper(exam.id, [s.class5.id, s.class1.id], s.maths, "2026-09-15");
    expect((await week(s.token, "2026-09-15", s.a)).days).toHaveLength(1);
    expect((await week(s.token, "2026-09-15", s.one)).days).toHaveLength(1);
  });

  it("without a date it is the week of today, and a bad date is refused", async () => {
    const { s } = await setUp();
    const res = await request(app).get(`${api}/class?classId=${s.a.classId}&sectionId=${s.a.sectionId}`).set(auth(s.token));
    expect(res.status).toBe(200);
    expect(res.body.data.week.from <= res.body.data.week.to).toBe(true);
    expect(new Date(`${res.body.data.week.from}T00:00:00Z`).getUTCDay()).toBe(1);
    expect((await request(app).get(`${api}/class?classId=${s.a.classId}&date=2026-02-31`).set(auth(s.token))).status).toBe(400);
  });

  it("the parent gets the same week for their child's class, beside the exams", async () => {
    const { s, make, addPaper } = await setUp();
    const exam = await make(FULL);
    await addPaper(exam.id, [s.class5.id], s.maths, "2026-09-16");
    const res = await request(app).get(`/api/v1/parent/children/${s.asha.id}/exams?date=2026-09-17`).set(auth(s.tokens.ravi));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.week).toMatchObject({ from: "2026-09-14", to: "2026-09-20" });
    expect(res.body.data.week.days[0]).toMatchObject({ date: "2026-09-16", replacesLessons: true });
    const mira = await request(app).get(`/api/v1/parent/children/${s.mira.id}/exams?date=2026-09-17`).set(auth(s.tokens.anil));
    expect(mira.body.data.week.days).toEqual([]);
  });
});
