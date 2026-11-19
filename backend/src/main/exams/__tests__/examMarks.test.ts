import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addClass, auth } from "../../../test/timetable";
import { ExamMark } from "../models/ExamMark";

/**
 * The marks of an exam (2026-11-06): after a paper is held, the subject's teacher (the class teacher, or the school) enters each child's
 * marks for it, class by class (section by section); the parents then see them. Positive and negative cases.
 */

const api = "/api/v1/exams";
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
/** A day that has passed (its papers are held) and one that has not come: both inside the test school's year. */
const PAST = "2026-09-15";
const EXAM = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-04-10", endDate: "2027-03-20" };

async function setUp() {
  const s = await classroomSchool();
  const exam = (await request(app).post(api).set(auth(s.token)).send(EXAM)).body.data as { id: string };
  const addPaper = async (classIds: string[], subjectId: string, date: string, over: object = {}) => {
    const res = await request(app)
      .post(`${api}/${exam.id}/papers`)
      .set(auth(s.token))
      .send({ classIds, papers: [{ subjectId, date, startTime: "09:00", durationMinutes: 60, maxMarks: 50, ...over }] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.items[0] as { id: string };
  };
  const unit = (u: { classId: string; sectionId: string | null }) => `classId=${u.classId}&sectionId=${u.sectionId ?? "none"}`;
  const sheet = (paperId: string, token: string, u: { classId: string; sectionId: string | null } = s.a) => request(app).get(`${api}/papers/${paperId}/marks?${unit(u)}`).set(auth(token));
  const save = (paperId: string, token: string, marks: object[], u: { classId: string; sectionId: string | null } = s.a) =>
    request(app).put(`${api}/papers/${paperId}/marks`).set(auth(token)).send({ classId: u.classId, sectionId: u.sectionId, marks });
  return { s, exam, addPaper, sheet, save };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the marks sheet of a paper", () => {
  it("lists the children of the class with empty marks, the paper's out-of, and whether the caller may write", async () => {
    const { s, addPaper, sheet } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    const res = await sheet(paper.id, s.tokens.meena);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ label: "Class 5 - A", maxMarks: 50, canWrite: true, held: true, subject: { name: "Mathematics" }, exam: { name: "Half-Yearly Exam" } });
    expect(res.body.data.students.map((c: { name: string }) => c.name).sort()).toEqual(["Asha Verma", "Kabir Rao"]);
    expect(res.body.data.students[0]).toMatchObject({ marks: null, absent: false });
  });

  it("is writable by the subject's teacher, the class teacher and the school; read only for another subject's teacher", async () => {
    const { s, addPaper, sheet } = await setUp();
    const paper = await addPaper([s.class5.id], s.english, PAST);
    expect((await sheet(paper.id, s.tokens.dev)).body.data.canWrite).toBe(true);
    expect((await sheet(paper.id, s.tokens.meena)).body.data.canWrite).toBe(true); // class teacher: every subject
    expect((await sheet(paper.id, s.token)).body.data.canWrite).toBe(true);
    const maths = await addPaper([s.class5.id], s.maths, PAST, { startTime: "11:00" });
    expect((await sheet(maths.id, s.tokens.dev)).body.data.canWrite).toBe(false);
  });

  it("is not for a teacher with no part in the class, nor for a parent", async () => {
    const { s, addPaper, sheet } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    const kiran = await sheet(paper.id, s.tokens.kiran);
    expect(kiran.status).toBe(403);
    expect(kiran.body.code).toBe("NOT_YOUR_CLASS");
    expect((await sheet(paper.id, s.tokens.ravi)).status).toBe(403);
  });

  it("says a paper that is not for that class, or is not there, is not found", async () => {
    const { s, addPaper, sheet } = await setUp();
    const paper = await addPaper([s.class1.id], s.maths, PAST);
    const wrong = await sheet(paper.id, s.token, s.a);
    expect(wrong.status).toBe(404);
    expect(wrong.body.code).toBe("PAPER_NOT_FOUND");
    expect((await sheet("64b64b64b64b64b64b64b64b", s.token)).status).toBe(404);
  });

  it("a paper of two classes is read class by class: each sheet has only that class's children", async () => {
    const { s, addPaper, sheet } = await setUp();
    const paper = await addPaper([s.class5.id, s.class1.id], s.maths, PAST);
    expect((await sheet(paper.id, s.token, s.one)).body.data.students.map((c: { name: string }) => c.name)).toEqual(["Mira Shah"]);
    expect((await sheet(paper.id, s.token, s.a)).body.data.students).toHaveLength(2);
  });
});

describe("entering marks", () => {
  it("saves the marks and absences of the children; they come back on the sheet, and the paper counts them", async () => {
    const { s, exam, addPaper, sheet, save } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    const res = await save(paper.id, s.tokens.meena, [
      { studentId: s.asha.id, marks: 42, absent: false },
      { studentId: s.kabir.id, marks: null, absent: true },
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.average).toBe(84);
    const sheetNow = (await sheet(paper.id, s.tokens.meena)).body.data;
    const byName = Object.fromEntries(sheetNow.students.map((c: { name: string }) => [c.name, c]));
    expect(byName["Asha Verma"]).toMatchObject({ marks: 42, absent: false });
    expect(byName["Kabir Rao"]).toMatchObject({ marks: null, absent: true });
    expect(sheetNow.marked).toBe(2);
    const detail = (await request(app).get(`${api}/${exam.id}`).set(auth(s.token))).body.data;
    expect(detail.papers[0].marked).toBe(2);
  });

  it("saving again changes what is sent and keeps the rest; clearing a child's marks takes the entry away", async () => {
    const { s, addPaper, sheet, save } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 30, absent: false }, { studentId: s.kabir.id, marks: 20, absent: false }]);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 35, absent: false }]);
    let now = (await sheet(paper.id, s.token)).body.data;
    expect(now.students.find((c: { name: string }) => c.name === "Asha Verma").marks).toBe(35);
    expect(now.students.find((c: { name: string }) => c.name === "Kabir Rao").marks).toBe(20);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: null, absent: false }]);
    now = (await sheet(paper.id, s.token)).body.data;
    expect(now.students.find((c: { name: string }) => c.name === "Asha Verma")).toMatchObject({ marks: null, absent: false });
    expect(now.marked).toBe(1);
  });

  it("accepts 0 and the full marks; marks with a decimal half are kept", async () => {
    const { s, addPaper, sheet, save } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    expect((await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 0, absent: false }, { studentId: s.kabir.id, marks: 50, absent: false }])).status).toBe(200);
    expect((await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 44.5, absent: false }])).status).toBe(200);
    expect((await sheet(paper.id, s.token)).body.data.students.find((c: { name: string }) => c.name === "Asha Verma").marks).toBe(44.5);
  });

  it("refuses marks above the paper's out-of, below 0, or for a child who is not in the class; nothing is saved", async () => {
    const { s, addPaper, sheet, save } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    const over = await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 51, absent: false }]);
    expect(over.status).toBe(400);
    expect(details(over)).toContainEqual({ path: "marks", message: "Marks are out of 50" });
    const below = await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: -1, absent: false }]);
    expect(below.status).toBe(400);
    const stranger = await save(paper.id, s.tokens.meena, [{ studentId: s.mira.id, marks: 10, absent: false }]);
    expect(stranger.status).toBe(400);
    expect(stranger.body.code).toBe("NOT_IN_CLASS");
    expect((await sheet(paper.id, s.token)).body.data.marked).toBe(0);
  });

  it("an absent child has no marks: marks sent with absent are dropped", async () => {
    const { s, addPaper, sheet, save } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 12, absent: true }]);
    expect((await sheet(paper.id, s.token)).body.data.students.find((c: { name: string }) => c.name === "Asha Verma")).toMatchObject({ marks: null, absent: true });
  });

  it("is not allowed before the paper's day, and not without the paper being out of some marks", async () => {
    const { s, addPaper, save, sheet } = await setUp();
    const later = await addPaper([s.class5.id], s.maths, "2027-03-18");
    const early = await save(later.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 10, absent: false }]);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("PAPER_NOT_HELD");
    expect((await sheet(later.id, s.token)).body.data.held).toBe(false);

    const plain = await addPaper([s.class5.id], s.english, PAST, { maxMarks: null });
    const none = await save(plain.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 10, absent: false }]);
    expect(none.status).toBe(409);
    expect(none.body.code).toBe("NO_MAX_MARKS");
  });

  it("is refused for another subject's teacher, a teacher outside the class, and a parent", async () => {
    const { s, addPaper, save } = await setUp();
    const maths = await addPaper([s.class5.id], s.maths, PAST);
    const dev = await save(maths.id, s.tokens.dev, [{ studentId: s.asha.id, marks: 10, absent: false }]);
    expect(dev.status).toBe(403);
    expect(dev.body.code).toBe("NOT_THEIR_SUBJECT");
    expect((await save(maths.id, s.tokens.kiran, [{ studentId: s.asha.id, marks: 10, absent: false }])).status).toBe(403);
    expect((await save(maths.id, s.tokens.ravi, [{ studentId: s.asha.id, marks: 10, absent: false }])).status).toBe(403);
    expect((await save(maths.id, "", [{ studentId: s.asha.id, marks: 10, absent: false }])).status).toBe(401);
  });

  it("the subject's own teacher writes it (Dev for English), the school writes any", async () => {
    const { s, addPaper, save } = await setUp();
    const english = await addPaper([s.class5.id], s.english, PAST);
    expect((await save(english.id, s.tokens.dev, [{ studentId: s.kabir.id, marks: 33, absent: false }])).status).toBe(200);
    expect((await save(english.id, s.token, [{ studentId: s.asha.id, marks: 40, absent: false }])).status).toBe(200);
  });
});

describe("what changes a paper once it has marks", () => {
  it("its out-of cannot go below a mark already entered; going up is fine", async () => {
    const { s, exam, addPaper, save } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 45, absent: false }]);
    const low = await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ maxMarks: 40 });
    expect(low.status).toBe(409);
    expect(low.body.code).toBe("MARKS_ABOVE_MAX");
    expect(low.body.message).toContain("45");
    expect((await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ maxMarks: 100 })).status).toBe(200);
    // Clearing the out-of while marks exist would orphan them.
    const clear = await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ maxMarks: null });
    expect(clear.status).toBe(409);
  });

  it("its subject cannot change, and a class with marks cannot be taken off it", async () => {
    const { s, exam, addPaper, save } = await setUp();
    const paper = await addPaper([s.class5.id, s.class1.id], s.maths, PAST);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 45, absent: false }]);
    const subject = await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ subjectId: s.english });
    expect(subject.status).toBe(409);
    expect(subject.body.code).toBe("PAPER_HAS_MARKS");
    const klass = await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ classIds: [s.class1.id] });
    expect(klass.status).toBe(409);
    expect(klass.body.code).toBe("PAPER_HAS_MARKS");
    // Class 1 has no marks, so it may be taken off: Class 5 keeps the paper.
    const keep = await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ classIds: [s.class5.id] });
    expect(keep.status, JSON.stringify(keep.body)).toBe(200);
  });

  it("it cannot be moved to a day that has not come, and its time may change", async () => {
    const { s, exam, addPaper, save } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 45, absent: false }]);
    expect((await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ date: "2027-03-18" })).body.code).toBe("PAPER_HAS_MARKS");
    expect((await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ startTime: "10:00" })).status).toBe(200);
  });

  it("taking the paper away, or the exam, takes its marks with it", async () => {
    const { s, exam, addPaper, save } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 45, absent: false }]);
    expect((await request(app).delete(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token))).status).toBe(200);
    const again = await addPaper([s.class5.id], s.maths, PAST);
    expect(again.id).not.toBe(paper.id);
    // The new paper starts with no marks (nothing of the old one is left under it).
    const res = await request(app).get(`${api}/papers/${again.id}/marks?classId=${s.a.classId}&sectionId=${s.a.sectionId}`).set(auth(s.token));
    expect(res.body.data.marked).toBe(0);
    await save(again.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 10, absent: false }]);
    expect((await request(app).delete(`${api}/${exam.id}`).set(auth(s.token))).status).toBe(200);
    expect(await ExamMark.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("a class that is made inactive keeps its marks: nothing of a result is thrown away", async () => {
    const { s, addPaper, save } = await setUp();
    const spare = await addClass(s.token, "Class 9");
    const paper = await addPaper([s.class5.id, spare.id], s.maths, PAST);
    await save(paper.id, s.tokens.meena, [{ studentId: s.asha.id, marks: 45, absent: false }]);
    expect((await request(app).post(`/api/v1/academics/classes/${spare.id}/deactivate`).set(auth(s.token))).status).toBe(200);
    expect(await ExamMark.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });
});
