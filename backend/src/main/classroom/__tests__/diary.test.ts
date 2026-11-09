import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { todayInIndia } from "../../students/schemas/students.schemas";

/**
 * The diary and the tests (docs/parent-teacher-flow.md, phases 4 and 5): a subject's teacher (or the class teacher, or the school) writes
 * what was taught today and the homework, and puts tests on a date; after a test, its marks. The parent of a child of that class sees all
 * of it, the school sees any class's.
 */

const today = todayInIndia();
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const unitQuery = (u: { classId: string; sectionId: string | null }) => `classId=${u.classId}&sectionId=${u.sectionId ?? "none"}`;
const writeDiary = (token: string, u: object, body: object) => request(app).put("/api/v1/classroom/diary").set(auth(token)).send({ ...u, date: today, ...body });
const dayOf = (token: string, u: { classId: string; sectionId: string | null }, date = today) => request(app).get(`/api/v1/classroom/diary?${unitQuery(u)}&date=${date}`).set(auth(token));
const addTest = (token: string, u: object, body: object) => request(app).post("/api/v1/classroom/tests").set(auth(token)).send({ ...u, ...body });

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the diary", () => {
  it("each subject's teacher writes today's topic and homework for their subject; the day shows every subject of the class", async () => {
    const s = await classroomSchool();
    const saved = await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, taught: "Fractions: adding", homework: "Page 42, sums 1 to 10" });
    expect(saved.status).toBe(200);
    await writeDiary(s.tokens.dev, s.a, { subjectId: s.english, taught: "Poem: The Kite", homework: "" });

    const day = (await dayOf(s.tokens.dev, s.a)).body.data;
    expect(day).toMatchObject({ label: "Class 5 - A", date: today });
    expect(day.subjects.map((x: { subjectName: string; canWrite: boolean; entry: { taught: string; homework: string; writtenBy: { name: string } } | null }) => [x.subjectName, x.canWrite, x.entry?.taught, x.entry?.homework, x.entry?.writtenBy.name])).toEqual([
      ["English", true, "Poem: The Kite", "", "Dev Patel"],
      ["Mathematics", false, "Fractions: adding", "Page 42, sums 1 to 10", "Meena Singh"],
    ]);
    // The class teacher may write for any subject of the class; writing again changes it.
    expect((await dayOf(s.tokens.meena, s.a)).body.data.subjects.every((x: { canWrite: boolean }) => x.canWrite)).toBe(true);
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, taught: "Fractions: subtracting", homework: "Page 43" });
    expect((await dayOf(s.token, s.a)).body.data.subjects.find((x: { subjectName: string }) => x.subjectName === "Mathematics").entry).toMatchObject({ taught: "Fractions: subtracting", homework: "Page 43" });
  });

  it("is written only by the subject's teacher, the class teacher or the school, never ahead of the day, and not empty", async () => {
    const s = await classroomSchool();
    const notHis = await writeDiary(s.tokens.dev, s.a, { subjectId: s.maths, taught: "x", homework: "" });
    expect(notHis.status).toBe(403);
    expect(notHis.body.code).toBe("NOT_THEIR_SUBJECT");
    expect((await dayOf(s.tokens.kiran, s.a)).status).toBe(403);
    const ahead = await request(app).put("/api/v1/classroom/diary").set(auth(s.tokens.meena)).send({ ...s.a, date: shift(today, 1), subjectId: s.maths, taught: "x", homework: "" });
    expect(ahead.status).toBe(400);
    expect((await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, taught: "", homework: "" })).status).toBe(400);
  });

  it("a parent sees their child's class's diary of a day; another family's child is not found", async () => {
    const s = await classroomSchool();
    await writeDiary(s.tokens.meena, s.a, { subjectId: s.maths, taught: "Fractions", homework: "Page 42" });
    const res = await request(app).get(`/api/v1/parent/children/${s.asha.id}/diary?date=${today}`).set(auth(s.tokens.ravi));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ date: today, entries: [{ subjectName: "Mathematics", taught: "Fractions", homework: "Page 42", writtenBy: "Meena Singh" }] });
    expect((await request(app).get(`/api/v1/parent/children/${s.mira.id}/diary`).set(auth(s.tokens.ravi))).status).toBe(404);
  });
});

describe("tests and marks", () => {
  it("a subject's teacher puts a test on a date; the class's list and the parent see it coming", async () => {
    const s = await classroomSchool();
    const made = await addTest(s.tokens.meena, s.a, { subjectId: s.maths, date: shift(today, 3), topic: "Fractions", maxMarks: 20 });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ subjectName: "Mathematics", date: shift(today, 3), topic: "Fractions", maxMarks: 20, marked: 0 });
    expect((await request(app).get(`/api/v1/classroom/tests?${unitQuery(s.a)}`).set(auth(s.tokens.dev))).body.data.items.map((t: { topic: string }) => t.topic)).toEqual(["Fractions"]);
    const parent = (await request(app).get(`/api/v1/parent/children/${s.asha.id}/tests`).set(auth(s.tokens.ravi))).body.data;
    expect(parent.upcoming).toEqual([expect.objectContaining({ subjectName: "Mathematics", topic: "Fractions", maxMarks: 20 })]);
    expect(parent.results).toEqual([]);
    expect((await addTest(s.tokens.dev, s.a, { subjectId: s.maths, date: today, topic: "x", maxMarks: 10 })).body.code).toBe("NOT_THEIR_SUBJECT");
  });

  it("after the test its teacher enters the marks (or absent); the parent sees their child's marks, the percentage and the average", async () => {
    const s = await classroomSchool();
    const id = (await addTest(s.tokens.meena, s.a, { subjectId: s.maths, date: today, topic: "Fractions", maxMarks: 20 })).body.data.id;
    const roster = (await request(app).get(`/api/v1/classroom/tests/${id}`).set(auth(s.tokens.meena))).body.data;
    expect(roster.students.map((st: { name: string; marks: number | null }) => [st.name, st.marks])).toEqual([
      ["Asha Verma", null],
      ["Kabir Rao", null],
    ]);
    const saved = await request(app)
      .put(`/api/v1/classroom/tests/${id}/marks`)
      .set(auth(s.tokens.meena))
      .send({ marks: [{ studentId: s.asha.id, marks: 15, absent: false }, { studentId: s.kabir.id, marks: null, absent: true }] });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ marked: 2, average: 75 });
    const tooMany = await request(app).put(`/api/v1/classroom/tests/${id}/marks`).set(auth(s.tokens.meena)).send({ marks: [{ studentId: s.asha.id, marks: 25, absent: false }] });
    expect(tooMany.status).toBe(400);

    const parent = (await request(app).get(`/api/v1/parent/children/${s.asha.id}/tests`).set(auth(s.tokens.ravi))).body.data;
    expect(parent.results).toEqual([expect.objectContaining({ subjectName: "Mathematics", topic: "Fractions", maxMarks: 20, marks: 15, absent: false, percent: 75 })]);
    expect(parent.average).toBe(75);
    const sita = (await request(app).get(`/api/v1/parent/children/${s.kabir.id}/tests`).set(auth(s.tokens.sita))).body.data;
    expect(sita.results[0]).toMatchObject({ marks: null, absent: true, percent: null });
  });

  it("marks wait for the test's day, and a test can be taken away by whoever may write it", async () => {
    const s = await classroomSchool();
    const id = (await addTest(s.tokens.meena, s.a, { subjectId: s.maths, date: shift(today, 2), topic: "Fractions", maxMarks: 20 })).body.data.id;
    const early = await request(app).put(`/api/v1/classroom/tests/${id}/marks`).set(auth(s.tokens.meena)).send({ marks: [{ studentId: s.asha.id, marks: 10, absent: false }] });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("TEST_NOT_HELD");
    expect((await request(app).delete(`/api/v1/classroom/tests/${id}`).set(auth(s.tokens.dev))).status).toBe(403);
    expect((await request(app).delete(`/api/v1/classroom/tests/${id}`).set(auth(s.tokens.meena))).status).toBe(200);
  });
});
