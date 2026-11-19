import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { auth } from "../../../test/timetable";

/**
 * Documents, the second part (2026-11-19): the school's own grading and pass mark, the class rank and the class teacher's remark on a report card, the
 * admit card, and the certificates (bonafide, character, transfer) with their register.
 */
const api = "/api/v1/documents";
const exams = "/api/v1/exams";
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const put = (token: string, path: string, body: object) => request(app).put(`${api}${path}`).set(auth(token)).send(body);
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

beforeEach(async () => {
  await seedSuperAdmin();
});

/** Class 5 - A with a Half-Yearly exam: Maths (out of 100, 15 Sep 9:00, 60 min) and English (out of 50, 16 Sep 11:00, 90 min); Asha 90 and 40, Kabir 20 and absent. */
async function school(name = "Sunrise Public School", prefix = "sun.") {
  const s = await classroomSchool(name, prefix);
  const exam = (await request(app).post(exams).set(auth(s.token)).send({ name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-04-10", endDate: "2027-03-20" })).body.data as { id: string };
  const paper = async (subjectId: string, maxMarks: number, date: string, startTime: string, durationMinutes: number) =>
    (await request(app).post(`${exams}/${exam.id}/papers`).set(auth(s.token)).send({ classIds: [s.class5.id], papers: [{ subjectId, date, startTime, durationMinutes, maxMarks }] })).body.data.items[0].id as string;
  const maths = await paper(s.maths, 100, "2026-09-15", "09:00", 60);
  const english = await paper(s.english, 50, "2026-09-16", "11:00", 90);
  const mark = (paperId: string, marks: object[]) => request(app).put(`${exams}/papers/${paperId}/marks`).set(auth(s.token)).send({ classId: s.a.classId, sectionId: s.a.sectionId, marks });
  await mark(maths, [{ studentId: s.asha.id, marks: 90 }, { studentId: s.kabir.id, marks: 20 }]);
  await mark(english, [{ studentId: s.asha.id, marks: 40 }, { studentId: s.kabir.id, marks: null, absent: true }]);
  return { ...s, exam: exam.id, maths, english, mark };
}
const card = async (token: string, studentId: string, examId: string) => (await get(token, `/students/${studentId}/report-card?examId=${examId}`)).body.data;

describe("how the school grades", () => {
  it("has the usual scale until the school saves its own; saving it changes the grades and the result of every report card", async () => {
    const s = await school();
    const usual = (await get(s.token, "/settings")).body.data;
    expect(usual).toMatchObject({ passPercent: 33, showRank: true, principalName: null, isDefault: true });
    expect(usual.gradeBands[0]).toEqual({ min: 91, grade: "A1" });
    // Kabir's 20% fails by the usual mark and passes by a pass mark of 15; the grades are the school's own.
    expect((await card(s.token, s.kabir.id, s.exam)).totals.result).toBe("fail");
    const saved = await put(s.token, "/settings", { passPercent: 15, gradeBands: [{ min: 0, grade: "Needs work" }, { min: 80, grade: "Excellent" }, { min: 50, grade: "Good" }], showRank: false, principalName: "Dr. R. Sharma" });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // Listed in any order, kept best first.
    expect(saved.body.data).toMatchObject({ passPercent: 15, isDefault: false, principalName: "Dr. R. Sharma", gradeBands: [{ min: 80, grade: "Excellent" }, { min: 50, grade: "Good" }, { min: 0, grade: "Needs work" }] });
    const kabir = await card(s.token, s.kabir.id, s.exam);
    expect(kabir.totals).toMatchObject({ percent: 20, grade: "Needs work", result: "pass" });
    expect(kabir).toMatchObject({ passPercent: 15, principalName: "Dr. R. Sharma", rank: null });
    expect((await card(s.token, s.asha.id, s.exam)).totals.grade).toBe("Excellent");
    expect((await request(app).delete(`${api}/settings`).set(auth(s.token))).body.data.isDefault).toBe(true);
    expect((await card(s.token, s.kabir.id, s.exam)).totals.result).toBe("fail");
  });

  it("says what is wrong with a scale: no grade from 0, two from the same percentage, a grade twice, too few, a pass mark that is not 1 to 100", async () => {
    const s = await school();
    const band = (min: number, grade: string) => ({ min, grade });
    const bad = async (over: object) => put(s.token, "/settings", { passPercent: 33, gradeBands: [band(0, "E"), band(50, "B")], showRank: true, ...over });
    expect(details(await bad({ gradeBands: [band(10, "E"), band(50, "B")] }))[0].message).toBe("The lowest grade must start at 0, so every percentage has a grade");
    expect(details(await bad({ gradeBands: [band(0, "E"), band(50, "B"), band(50, "C")] }))[0].message).toBe("Two grades start at the same percentage");
    expect(details(await bad({ gradeBands: [band(0, "B"), band(50, "b")] }))[0].message).toBe("A grade is named once");
    expect(details(await bad({ gradeBands: [band(0, "E")] }))[0].message).toBe("A scale has at least 2 grades");
    expect(details(await bad({ passPercent: 0 }))[0].message).toBe("The pass mark is 1 to 100");
    expect(details(await bad({ passPercent: 101 }))[0].message).toBe("The pass mark is 1 to 100");
    expect(details(await bad({ gradeBands: [band(0, ""), band(50, "B")] }))[0].message).toBe("Enter the grade");
  });
});

describe("the class rank", () => {
  it("a report card says the child's place among the class's children who have a total; the same percentage shares a place", async () => {
    const s = await school();
    expect((await card(s.token, s.asha.id, s.exam)).rank).toEqual({ position: 1, of: 2 });
    expect((await card(s.token, s.kabir.id, s.exam)).rank).toEqual({ position: 2, of: 2 });
    // Kabir catches up to the same total: both are first.
    await s.mark(s.maths, [{ studentId: s.kabir.id, marks: 90 }]);
    await s.mark(s.english, [{ studentId: s.kabir.id, marks: 40, absent: false }]);
    expect((await card(s.token, s.asha.id, s.exam)).rank).toEqual({ position: 1, of: 2 });
    expect((await card(s.token, s.kabir.id, s.exam)).rank).toEqual({ position: 1, of: 2 });
    const all = (await get(s.token, `/classes/${s.class5.id}/report-cards?examId=${s.exam}`)).body.data.items as { rank: unknown }[];
    expect(all.map((c) => c.rank)).toEqual([{ position: 1, of: 2 }, { position: 1, of: 2 }]);
  });

  it("a child with no mark yet has no rank and is not counted", async () => {
    const s = await school();
    for (const paper of [s.maths, s.english]) await s.mark(paper, [{ studentId: s.kabir.id, marks: null, absent: false }]);
    expect((await card(s.token, s.kabir.id, s.exam)).rank).toBeNull();
    expect((await card(s.token, s.asha.id, s.exam)).rank).toEqual({ position: 1, of: 1 });
  });
});

describe("the class teacher's remark", () => {
  it("is written for one child and one exam, shows on the report card (the parent's too), is changed by writing again and goes when it is emptied", async () => {
    const s = await school();
    const saved = await put(s.token, "/remarks", { studentId: s.asha.id, examId: s.exam, remark: "Works hard. Needs to write neatly." });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((await card(s.token, s.asha.id, s.exam)).remark).toBe("Works hard. Needs to write neatly.");
    expect((await card(s.token, s.kabir.id, s.exam)).remark).toBeNull();
    const parent = await request(app).get(`/api/v1/parent/children/${s.asha.id}/report-card?examId=${s.exam}`).set(auth(s.tokens.ravi));
    expect(parent.body.data.remark).toBe("Works hard. Needs to write neatly.");
    await put(s.token, "/remarks", { studentId: s.asha.id, examId: s.exam, remark: "  Very good term.  " });
    expect((await card(s.token, s.asha.id, s.exam)).remark).toBe("Very good term.");
    await put(s.token, "/remarks", { studentId: s.asha.id, examId: s.exam, remark: "" });
    expect((await card(s.token, s.asha.id, s.exam)).remark).toBeNull();
  });

  it("refuses a remark that is too long or has markup, a student or exam that is not the school's", async () => {
    const s = await school();
    expect(details(await put(s.token, "/remarks", { studentId: s.asha.id, examId: s.exam, remark: "x".repeat(301) }))[0].message).toBe("Keep the remark under 300 characters");
    expect((await put(s.token, "/remarks", { studentId: s.asha.id, examId: s.exam, remark: "<b>hi</b>" })).status).toBe(400);
    expect((await put(s.token, "/remarks", { studentId: "a".repeat(24), examId: s.exam, remark: "ok" })).status).toBe(404);
    expect((await put(s.token, "/remarks", { studentId: s.asha.id, examId: "a".repeat(24), remark: "ok" })).status).toBe(404);
  });
});

describe("the admit card", () => {
  it("has the student and the class's papers in the order they are written, with day, start and end (24 hours) and marks", async () => {
    const s = await school();
    const res = await get(s.token, `/students/${s.asha.id}/admit-card?examId=${s.exam}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.student).toMatchObject({ name: "Asha Verma", classLabel: "Class 5 - A", fatherName: "Ravi Verma" });
    expect(res.body.data.exam).toMatchObject({ name: "Half-Yearly Exam" });
    expect(res.body.data.papers).toEqual([
      { date: "2026-09-15", day: "Tuesday", subject: "Mathematics", start: "09:00", end: "10:00", durationMinutes: 60, maxMarks: 100 },
      { date: "2026-09-16", day: "Wednesday", subject: "English", start: "11:00", end: "12:30", durationMinutes: 90, maxMarks: 50 },
    ]);
    expect(res.body.data.instructions.length).toBeGreaterThan(0);
    // Class 1 has no paper in this exam: its child's card has none.
    expect((await get(s.token, `/students/${s.mira.id}/admit-card?examId=${s.exam}`)).body.data.papers).toEqual([]);
  });

  it("makes the admit cards of a class; an exam that is not the school's is not found; the exam is needed", async () => {
    const s = await school();
    const res = await get(s.token, `/classes/${s.class5.id}/admit-cards?examId=${s.exam}`);
    expect(res.body.data.items.map((c: { student: { name: string } }) => c.student.name).sort()).toEqual(["Asha Verma", "Kabir Rao"]);
    expect((await get(s.token, `/classes/${s.class5.id}/admit-cards?examId=${"a".repeat(24)}`)).status).toBe(404);
    expect((await get(s.token, `/classes/${s.class5.id}/admit-cards`)).status).toBe(400);
  });
});

describe("what a parent reads of these", () => {
  it("their own child's admit card; another family's child is not found; the school's leave is needed", async () => {
    const s = await school();
    const mine = await request(app).get(`/api/v1/parent/children/${s.asha.id}/admit-card?examId=${s.exam}`).set(auth(s.tokens.ravi));
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body.data.papers.map((p: { subject: string }) => p.subject)).toEqual(["Mathematics", "English"]);
    expect((await request(app).get(`/api/v1/parent/children/${s.kabir.id}/admit-card?examId=${s.exam}`).set(auth(s.tokens.ravi))).status).toBe(404);
    await request(app).put("/api/v1/permissions/parent").set(auth(s.token)).send({ permissions: ["child.attendance"] });
    expect((await request(app).get(`/api/v1/parent/children/${s.asha.id}/admit-card?examId=${s.exam}`).set(auth(s.tokens.ravi))).status).toBe(403);
  });
});

describe("the certificates", () => {
  const issue = (token: string, studentId: string, body: object) => post(token, `/students/${studentId}/certificates`, body);

  it("a bonafide and a character certificate are numbered in order, each kind on its own, and keep what they said", async () => {
    const s = await school();
    const first = await issue(s.token, s.asha.id, { type: "bonafide", purpose: "opening a bank account" });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data).toMatchObject({ type: "bonafide", number: "BON/2026-2027/0001", purpose: "opening a bank account", status: "valid" });
    expect(first.body.data.facts).toMatchObject({ studentName: "Asha Verma", admissionNumber: s.asha.admissionNumber, classLabel: "Class 5 - A", dateOfBirth: "2018-05-14", fatherName: "Ravi Verma", leftOn: null });
    expect((await issue(s.token, s.kabir.id, { type: "bonafide" })).body.data.number).toBe("BON/2026-2027/0002");
    const character = await issue(s.token, s.asha.id, { type: "character", conduct: "Good" });
    expect(character.body.data).toMatchObject({ number: "CHR/2026-2027/0001", conduct: "Good" });
  });

  it("a transfer certificate is for a student who has left; the other two are for one who is here", async () => {
    const s = await school();
    const early = await issue(s.token, s.asha.id, { type: "transfer" });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("STUDENT_NOT_LEFT");
    await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [s.asha.id], reason: "Moved to Indore" });
    const left = await issue(s.token, s.asha.id, { type: "bonafide" });
    expect(left.status).toBe(409);
    expect(left.body.code).toBe("STUDENT_LEFT");
    const tc = await issue(s.token, s.asha.id, { type: "transfer" });
    expect(tc.status, JSON.stringify(tc.body)).toBe(201);
    expect(tc.body.data).toMatchObject({ number: "TC/2026-2027/0001" });
    // The class they were last in, when they left and why.
    expect(tc.body.data.facts).toMatchObject({ studentName: "Asha Verma", classLabel: "Class 5 - A", leavingReason: "Moved to Indore" });
    expect(tc.body.data.facts.leftOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("many issued at once each get their own number", async () => {
    const s = await school();
    const res = await Promise.all([s.asha.id, s.kabir.id, s.mira.id].map((id) => issue(s.token, id, { type: "bonafide" })));
    expect(res.every((r) => r.status === 201)).toBe(true);
    expect(res.map((r) => r.body.data.number).sort()).toEqual(["BON/2026-2027/0001", "BON/2026-2027/0002", "BON/2026-2027/0003"]);
  });

  it("the register lists them, newest first, by kind or by student; one opens whole with the school's header", async () => {
    const s = await school();
    const bon = (await issue(s.token, s.asha.id, { type: "bonafide" })).body.data;
    await issue(s.token, s.kabir.id, { type: "character" });
    expect((await get(s.token, "/certificates")).body.data.items.map((c: { number: string }) => c.number)).toEqual(["CHR/2026-2027/0001", "BON/2026-2027/0001"]);
    expect((await get(s.token, "/certificates?type=bonafide")).body.data.items).toHaveLength(1);
    expect((await get(s.token, `/certificates?studentId=${s.kabir.id}`)).body.data.items).toHaveLength(1);
    await put(s.token, "/settings", { passPercent: 33, gradeBands: [{ min: 0, grade: "E" }, { min: 33, grade: "D" }], showRank: true, principalName: "Dr. R. Sharma" });
    const whole = (await get(s.token, `/certificates/${bon.id}`)).body.data;
    expect(whole).toMatchObject({ number: "BON/2026-2027/0001", year: "2026-2027", principalName: "Dr. R. Sharma", school: { name: "Sunrise Public School" } });
    expect((await get(s.token, `/certificates/${"a".repeat(24)}`)).status).toBe(404);
  });

  it("is cancelled with a reason, once; its number stays and the next is the next", async () => {
    const s = await school();
    const made = (await issue(s.token, s.asha.id, { type: "bonafide" })).body.data;
    expect(details(await post(s.token, `/certificates/${made.id}/cancel`, {}))[0].path).toBe("reason");
    const done = await post(s.token, `/certificates/${made.id}/cancel`, { reason: "Wrong purpose" });
    expect(done.body.data).toMatchObject({ status: "cancelled", cancelReason: "Wrong purpose" });
    const again = await post(s.token, `/certificates/${made.id}/cancel`, { reason: "Again" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CERTIFICATE_CANCELLED");
    expect((await issue(s.token, s.asha.id, { type: "bonafide" })).body.data.number).toBe("BON/2026-2027/0002");
  });

  it("finds a student to issue one for, by name or admission number, from this school only", async () => {
    const a = await school("Sunrise Public School", "sun.");
    const b = await school("Moonrise Public School", "moon.");
    expect((await get(a.token, "/students/search?q=asha")).body.data.items).toMatchObject([{ id: a.asha.id, name: "Asha Verma", classLabel: "Class 5 - A" }]);
    expect((await get(a.token, "/students/search?q=")).body.data.items).toEqual([]);
    expect((await get(b.token, "/students/search?q=asha")).body.data.items.map((i: { id: string }) => i.id)).not.toContain(a.asha.id);
    expect((await get(a.tokens.ravi, "/students/search?q=asha")).status).toBe(403);
  });

  it("refuses an unknown kind, a student that is not the school's, and markup in the purpose", async () => {
    const s = await school();
    expect((await issue(s.token, s.asha.id, { type: "lunch" })).status).toBe(400);
    expect((await issue(s.token, "a".repeat(24), { type: "bonafide" })).status).toBe(404);
    expect((await issue(s.token, s.asha.id, { type: "bonafide", purpose: "<script>" })).status).toBe(400);
  });
});

describe("who may, and one school never reaches another's", () => {
  it("documents.view reads (the register, the settings, admit cards); documents.manage writes (remarks, certificates, grading); a teacher and a parent do neither", async () => {
    const s = await school();
    const reception = await addColleague(s.tenantId, "receptionist");
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["documents.view"] });
    expect((await get(reception, "/settings")).status).toBe(200);
    expect((await get(reception, "/certificates")).status).toBe(200);
    expect((await get(reception, `/students/${s.asha.id}/admit-card?examId=${s.exam}`)).status).toBe(200);
    expect((await put(reception, "/settings", { passPercent: 40, gradeBands: [{ min: 0, grade: "E" }, { min: 40, grade: "P" }], showRank: true })).status).toBe(403);
    expect((await put(reception, "/remarks", { studentId: s.asha.id, examId: s.exam, remark: "ok" })).status).toBe(403);
    expect((await post(reception, `/students/${s.asha.id}/certificates`, { type: "bonafide" })).status).toBe(403);
    // Writing brings reading with it.
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["documents.manage"] });
    expect((await post(reception, `/students/${s.asha.id}/certificates`, { type: "bonafide" })).status).toBe(201);
    expect((await get(reception, "/certificates")).status).toBe(200);
    for (const token of [s.tokens.meena, s.tokens.ravi]) {
      expect((await get(token, "/certificates")).status).toBe(403);
      expect((await get(token, "/settings")).status).toBe(403);
      expect((await post(token, `/students/${s.asha.id}/certificates`, { type: "bonafide" })).status).toBe(403);
    }
  });

  it("another school cannot read, issue, cancel, remark or reach the grading and admit cards of this school", async () => {
    const a = await school("Sunrise Public School", "sun.");
    const b = await school("Moonrise Public School", "moon.");
    const made = (await post(a.token, `/students/${a.asha.id}/certificates`, { type: "bonafide" })).body.data;
    await put(a.token, "/settings", { passPercent: 50, gradeBands: [{ min: 0, grade: "F" }, { min: 50, grade: "P" }], showRank: true, principalName: "A's principal" });
    expect((await get(b.token, `/certificates/${made.id}`)).status).toBe(404);
    expect((await post(b.token, `/certificates/${made.id}/cancel`, { reason: "x" })).status).toBe(404);
    expect((await post(b.token, `/students/${a.asha.id}/certificates`, { type: "bonafide" })).status).toBe(404);
    expect((await get(b.token, "/certificates")).body.data.items).toEqual([]);
    expect((await get(b.token, "/settings")).body.data).toMatchObject({ passPercent: 33, isDefault: true, principalName: null });
    expect((await put(b.token, "/remarks", { studentId: a.asha.id, examId: b.exam, remark: "x" })).status).toBe(404);
    expect((await get(b.token, `/students/${a.asha.id}/admit-card?examId=${b.exam}`)).status).toBe(404);
    expect((await get(b.token, `/classes/${a.class5.id}/admit-cards?examId=${b.exam}`)).status).toBe(404);
    // A's own are untouched.
    expect((await get(a.token, `/certificates/${made.id}`)).body.data.status).toBe("valid");
    expect((await get(a.token, "/settings")).body.data.passPercent).toBe(50);
  });
});
