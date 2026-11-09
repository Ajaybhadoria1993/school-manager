import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";

/**
 * What a teacher and a parent see of the exams (2026-11-06): the teacher, inside a class they are the class teacher of or teach in
 * (and the school, any class), the exams of that class with its own papers; the parent, the exams and papers of their child's class with
 * the child's own marks, the total and the percentage. Nobody sees another class's papers or another child's marks.
 */

const api = "/api/v1/exams";
/** A day that has passed (its papers are held) and one that has not come: both inside the test school's year. */
const PAST = "2026-09-15";
const EXAM = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-04-10", endDate: "2027-03-20", schoolStart: "08:00", schoolEnd: "12:30" };

async function setUp() {
  const s = await classroomSchool();
  const make = async (over: object = {}) => (await request(app).post(api).set(auth(s.token)).send({ ...EXAM, ...over })).body.data as { id: string };
  const exam = await make();
  const addPaper = async (classIds: string[], subjectId: string, date: string, over: object = {}, examId = exam.id) => {
    const res = await request(app)
      .post(`${api}/${examId}/papers`)
      .set(auth(s.token))
      .send({ classIds, papers: [{ subjectId, date, startTime: "09:00", durationMinutes: 60, maxMarks: 50, ...over }] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.items[0] as { id: string };
  };
  const forClass = (token: string, u: { classId: string; sectionId: string | null } = s.a) => request(app).get(`${api}/class?classId=${u.classId}&sectionId=${u.sectionId ?? "none"}`).set(auth(token));
  const marks = (paperId: string, marksList: object[], token = s.tokens.meena, u: { classId: string; sectionId: string | null } = s.a) =>
    request(app).put(`${api}/papers/${paperId}/marks`).set(auth(token)).send({ classId: u.classId, sectionId: u.sectionId, marks: marksList });
  const childExams = (token: string, childId: string) => request(app).get(`/api/v1/parent/children/${childId}/exams`).set(auth(token));
  return { s, exam, make, addPaper, forClass, marks, childExams };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the exams of a class, for its teachers and the school", () => {
  it("each exam of the year with the papers of this class only, in date order, with marks counts and who may write", async () => {
    const { s, exam, addPaper, forClass } = await setUp();
    await addPaper([s.class5.id], s.maths, PAST, { startTime: "10:00" });
    await addPaper([s.class5.id], s.english, "2027-03-18");
    await addPaper([s.class1.id], s.maths, "2027-03-17");
    const res = await forClass(s.tokens.dev);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.label).toBe("Class 5 - A");
    expect(res.body.data.items).toHaveLength(1);
    const item = res.body.data.items[0];
    expect(item).toMatchObject({ id: exam.id, name: "Half-Yearly Exam", status: "running", full: true, schoolHours: { start: "08:00", end: "12:30" } });
    expect(item.papers.map((p: { subject: { name: string }; date: string }) => `${p.date} ${p.subject.name}`)).toEqual([`${PAST} Mathematics`, "2027-03-18 English"]);
    expect(item.papers[0]).toMatchObject({ startTime: "10:00", endTime: "11:00", maxMarks: 50, held: true, canWrite: false, marked: 0, children: 2 });
    expect(item.papers[1]).toMatchObject({ held: false, canWrite: true });
  });

  it("an exam with no paper for this class still shows (its days and the school's hours), with no papers; the exams that are over come last", async () => {
    const { s, make, addPaper, forClass } = await setUp();
    await make({ name: "Unit test 1", type: "unit_test", startDate: "2026-05-04", endDate: "2026-05-04", schoolStart: null, schoolEnd: null });
    await addPaper([s.class1.id], s.maths, "2027-03-17");
    const res = await forClass(s.tokens.meena);
    expect(res.body.data.items.map((e: { name: string; status: string; papers: unknown[] }) => `${e.name}:${e.status}:${e.papers.length}`)).toEqual(["Half-Yearly Exam:running:0", "Unit test 1:over:0"]);
  });

  it("the school and the class teacher read any class they run; a teacher who teaches only English reads the class too", async () => {
    const { s, addPaper, forClass } = await setUp();
    await addPaper([s.class1.id], s.maths, "2027-03-17");
    expect((await forClass(s.token, s.one)).status).toBe(200);
    expect((await forClass(s.tokens.dev)).status).toBe(200);
    expect((await forClass(s.tokens.kiran)).status).toBe(403);
    expect((await forClass(s.tokens.meena, s.one)).status).toBe(403); // Meena has no part in Class 1
    expect((await forClass(s.tokens.ravi)).status).toBe(403);
    expect((await forClass("")).status).toBe(401);
  });

  it("counts the children who have marks, and keeps the entries per class unit", async () => {
    const { s, addPaper, forClass, marks } = await setUp();
    const paper = await addPaper([s.class5.id, s.class1.id], s.maths, PAST);
    await marks(paper.id, [{ studentId: s.asha.id, marks: 40, absent: false }]);
    const five = (await forClass(s.token, s.a)).body.data.items[0].papers[0];
    const one = (await forClass(s.token, s.one)).body.data.items[0].papers[0];
    expect(five).toMatchObject({ marked: 1, children: 2 });
    expect(one).toMatchObject({ marked: 0, children: 1 });
  });

  it("a bad class id is refused", async () => {
    const { s } = await setUp();
    expect((await request(app).get(`${api}/class?classId=nope`).set(auth(s.token))).status).toBe(400);
    expect((await request(app).get(`${api}/class?classId=64b64b64b64b64b64b64b64b&sectionId=none`).set(auth(s.token))).status).toBe(404);
  });
});

describe("a child's exams, for the parent", () => {
  it("the exams of the child's class this year with each paper; the child's own marks, the total and the percentage", async () => {
    const { s, addPaper, marks, childExams } = await setUp();
    const maths = await addPaper([s.class5.id], s.maths, PAST);
    const english = await addPaper([s.class5.id], s.english, PAST, { startTime: "11:00", maxMarks: 100 });
    await addPaper([s.class5.id], s.english, "2027-03-18", { startTime: "09:00" });
    await addPaper([s.class1.id], s.maths, "2027-03-17");
    await marks(maths.id, [{ studentId: s.asha.id, marks: 45, absent: false }, { studentId: s.kabir.id, marks: 10, absent: false }]);
    await marks(english.id, [{ studentId: s.asha.id, marks: 75, absent: false }], s.tokens.dev);

    const res = await childExams(s.tokens.ravi, s.asha.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    const exam = res.body.data.items[0];
    expect(exam).toMatchObject({ name: "Half-Yearly Exam", status: "running", schoolHours: { start: "08:00", end: "12:30" } });
    expect(exam.papers).toHaveLength(3);
    const byDay = exam.papers.map((p: { subject: { name: string }; result: object | null }) => [p.subject.name, p.result]);
    expect(byDay[0]).toEqual(["Mathematics", { marks: 45, absent: false, percent: 90 }]);
    expect(byDay[1]).toEqual(["English", { marks: 75, absent: false, percent: 75 }]);
    expect(byDay[2]).toEqual(["English", null]);
    // Totals: only the papers with marks: 45 + 75 = 120 of 50 + 100 = 150: 80 %.
    expect(exam.summary).toEqual({ marks: 120, outOf: 150, percent: 80, papers: 2 });
    // Kabir's parent sees Kabir's marks, not Asha's.
    const sita = (await childExams(s.tokens.sita, s.kabir.id)).body.data.items[0];
    expect(sita.papers[0].result).toEqual({ marks: 10, absent: false, percent: 20 });
    expect(sita.papers[1].result).toBeNull();
  });

  it("an absent child is said absent, and the paper is left out of the total", async () => {
    const { s, addPaper, marks, childExams } = await setUp();
    const maths = await addPaper([s.class5.id], s.maths, PAST);
    const english = await addPaper([s.class5.id], s.english, PAST, { startTime: "11:00" });
    await marks(maths.id, [{ studentId: s.asha.id, marks: null, absent: true }]);
    await marks(english.id, [{ studentId: s.asha.id, marks: 25, absent: false }], s.tokens.dev);
    const exam = (await childExams(s.tokens.ravi, s.asha.id)).body.data.items[0];
    expect(exam.papers[0].result).toEqual({ marks: null, absent: true, percent: null });
    expect(exam.summary).toEqual({ marks: 25, outOf: 50, percent: 50, papers: 1 });
  });

  it("no marks yet: no summary; an exam with no paper for the class has none either", async () => {
    const { s, addPaper, childExams } = await setUp();
    await addPaper([s.class5.id], s.maths, "2027-03-18");
    const exam = (await childExams(s.tokens.ravi, s.asha.id)).body.data.items[0];
    expect(exam.summary).toBeNull();
    const mira = (await childExams(s.tokens.anil, s.mira.id)).body.data.items[0];
    expect(mira.papers).toEqual([]);
    expect(mira.summary).toBeNull();
  });

  it("only the parent's own child: another family's child, an unknown child and a teacher are refused", async () => {
    const { s, childExams } = await setUp();
    expect((await childExams(s.tokens.ravi, s.kabir.id)).status).toBe(404);
    expect((await childExams(s.tokens.ravi, "64b64b64b64b64b64b64b64b")).status).toBe(404);
    expect((await childExams(s.tokens.meena, s.asha.id)).status).toBe(403);
    expect((await childExams(s.token, s.asha.id)).status).toBe(403);
    expect((await childExams("", s.asha.id)).status).toBe(401);
  });

  it("a child's marks stay on their results when the child moves to another class", async () => {
    const { s, addPaper, marks, childExams } = await setUp();
    const maths = await addPaper([s.class5.id], s.maths, PAST);
    await marks(maths.id, [{ studentId: s.asha.id, marks: 45, absent: false }]);
    const moved = await request(app).patch(`/api/v1/students/${s.asha.id}/enrolment`).set(auth(s.token)).send({ classId: s.class1.id, sectionId: null });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const exam = (await childExams(s.tokens.ravi, s.asha.id)).body.data.items[0];
    // Asha is in Class 1 now (no paper there), yet the marks she earned in Class 5 are still hers.
    expect(exam.papers.map((p: { result: { marks: number } | null }) => p.result?.marks)).toEqual([45]);
    expect(exam.summary).toMatchObject({ marks: 45, outOf: 50 });
  });
});
