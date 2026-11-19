import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { auth } from "../../../test/timetable";
import { gradeOf, GRADE_BANDS, PASS_PERCENT } from "../constants";

/**
 * Documents (2026-11-19): a student's ID card and exam report card, built from what the app keeps, for one student or a whole class; the photo for the
 * card; a parent reads their own child's; one school never reaches another's.
 */
const api = "/api/v1/documents";
const exams = "/api/v1/exams";
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const PAST = "2026-09-15";

// A 1x1 PNG and JPEG (the first bytes are what is checked), and something that is not a picture.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001ff0b6b6dd00000000049454e44ae426082", "hex");
const JPEG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");

beforeEach(async () => {
  await seedSuperAdmin();
});

/** Class 5 - A (Asha, Kabir) with a Half-Yearly exam: Maths (out of 100) and English (out of 50), both held; Asha has 90 and 40, Kabir has 20 in Maths and was absent in English. */
async function school(name = "Sunrise Public School", prefix = "sun.") {
  const s = await classroomSchool(name, prefix);
  const exam = (await request(app).post(exams).set(auth(s.token)).send({ name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-04-10", endDate: "2027-03-20" })).body.data as { id: string };
  const paper = async (subjectId: string, maxMarks: number, startTime: string) =>
    (await request(app).post(`${exams}/${exam.id}/papers`).set(auth(s.token)).send({ classIds: [s.class5.id], papers: [{ subjectId, date: PAST, startTime, durationMinutes: 60, maxMarks }] })).body.data.items[0].id as string;
  const maths = await paper(s.maths, 100, "09:00");
  const english = await paper(s.english, 50, "11:00");
  const mark = (paperId: string, marks: object[]) => request(app).put(`${exams}/papers/${paperId}/marks`).set(auth(s.token)).send({ classId: s.a.classId, sectionId: s.a.sectionId, marks });
  expect((await mark(maths, [{ studentId: s.asha.id, marks: 90 }, { studentId: s.kabir.id, marks: 20 }])).status).toBe(200);
  expect((await mark(english, [{ studentId: s.asha.id, marks: 40 }, { studentId: s.kabir.id, marks: null, absent: true }])).status).toBe(200);
  return { ...s, exam: exam.id, maths, english };
}

describe("the grades", () => {
  it("every percentage from 0 to 100 has one grade, the best at the top, and the pass mark is where the passing grades stop", () => {
    for (let p = 0; p <= 100; p++) expect(gradeOf(p), String(p)).toMatch(/^[A-E][12]?$/);
    expect([100, 91, 90, 81, 80, 71, 61, 51, 41, 40, 33, 32, 0].map((p) => gradeOf(p))).toEqual(["A1", "A1", "A2", "A2", "B1", "B1", "B2", "C1", "C2", "D", "D", "E", "E"]);
    expect(GRADE_BANDS.find((b) => b.grade === "D")!.min).toBe(PASS_PERCENT);
    expect(gradeOf(PASS_PERCENT - 1)).toBe("E");
  });
});

describe("the ID card", () => {
  it("gives the school's header, the student, their class, roll number and the primary guardian's name and number", async () => {
    const s = await school();
    const res = await get(s.token, `/students/${s.asha.id}/id-card`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.school).toMatchObject({ name: "Sunrise Public School", logoUrl: expect.any(String) });
    expect(res.body.data.year).toMatchObject({ name: "2026-2027", endDate: "2027-03-31" });
    expect(res.body.data.student).toMatchObject({ id: s.asha.id, name: "Asha Verma", admissionNumber: s.asha.admissionNumber, classLabel: "Class 5 - A", dateOfBirth: "2018-05-14", gender: "Female", photo: null });
    expect(res.body.data.student).toHaveProperty("rollNumber");
    expect(res.body.data.student.address).toContain("12 MG Road");
    expect(res.body.data.guardian).toMatchObject({ name: "Ravi Verma", relation: "Father" });
  });

  it("carries the photo once one is saved, and not after it is taken away", async () => {
    const s = await school();
    const saved = await request(app).put(`${api}/students/${s.asha.id}/photo`).set(auth(s.token)).attach("photo", PNG, { filename: "asha.png", contentType: "image/png" });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.photo).toMatch(/^data:image\/png;base64,/);
    expect((await get(s.token, `/students/${s.asha.id}/id-card`)).body.data.student.photo).toMatch(/^data:image\/png;base64,/);
    expect((await get(s.token, `/students/${s.asha.id}/photo`)).body.data.photo).toMatch(/^data:image\/png;base64,/);
    // A new picture replaces the old.
    const again = await request(app).put(`${api}/students/${s.asha.id}/photo`).set(auth(s.token)).attach("photo", JPEG, { filename: "a.jpg", contentType: "image/jpeg" });
    expect(again.body.data.photo).toMatch(/^data:image\/jpeg;base64,/);
    expect((await request(app).delete(`${api}/students/${s.asha.id}/photo`).set(auth(s.token))).status).toBe(200);
    expect((await get(s.token, `/students/${s.asha.id}/id-card`)).body.data.student.photo).toBeNull();
  });

  it("refuses what is not a picture (whatever its name says), a picture that is too big, a missing file and a student that is not the school's", async () => {
    const s = await school();
    const put = (id: string, buffer: Buffer | null, filename = "x.png") => {
      const r = request(app).put(`${api}/students/${id}/photo`).set(auth(s.token));
      return buffer ? r.attach("photo", buffer, { filename, contentType: "image/png" }) : r;
    };
    const fake = await put(s.asha.id, Buffer.from("<svg onload=alert(1)></svg>"));
    expect(fake.status).toBe(400);
    expect(fake.body.code).toBe("PHOTO_NOT_IMAGE");
    const big = await put(s.asha.id, Buffer.concat([PNG, Buffer.alloc(301 * 1024)]));
    expect(big.status).toBe(400);
    expect(big.body.code).toBe("PHOTO_TOO_BIG");
    expect((await put(s.asha.id, null)).status).toBe(400);
    expect((await put("a".repeat(24), PNG)).status).toBe(404);
    expect((await get(s.token, `/students/${s.asha.id}/photo`)).body.data.photo).toBeNull();
  });

  it("makes the cards of a whole class, in roll order, or of one section; a class of another kind is not found", async () => {
    const s = await school();
    const res = await get(s.token, `/classes/${s.class5.id}/id-cards`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((c: { student: { name: string } }) => c.student.name).sort()).toEqual(["Asha Verma", "Kabir Rao"]);
    expect((await get(s.token, `/classes/${s.class5.id}/id-cards?sectionId=${s.a.sectionId}`)).body.data.items).toHaveLength(2);
    expect((await get(s.token, `/classes/${s.class1.id}/id-cards`)).body.data.items.map((c: { student: { name: string } }) => c.student.name)).toEqual(["Mira Shah"]);
    expect((await get(s.token, `/classes/${"a".repeat(24)}/id-cards`)).status).toBe(404);
  });

  it("a student who left the school has no card", async () => {
    const s = await school();
    await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [s.kabir.id], reason: "Moved" });
    expect((await get(s.token, `/students/${s.kabir.id}/id-card`)).status).toBe(404);
    expect((await get(s.token, `/classes/${s.class5.id}/id-cards`)).body.data.items.map((c: { student: { name: string } }) => c.student.name)).toEqual(["Asha Verma"]);
  });
});

describe("the exam report card", () => {
  it("gives each subject's marks, percentage and grade, the total, the grade, the result, the class teacher and the parents' names", async () => {
    const s = await school();
    const res = await get(s.token, `/students/${s.asha.id}/report-card?examId=${s.exam}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const card = res.body.data;
    expect(card.exam).toMatchObject({ name: "Half-Yearly Exam", kind: "half_yearly" });
    expect(card.student).toMatchObject({ name: "Asha Verma", className: "Class 5", sectionName: "A", fatherName: "Ravi Verma" });
    expect(card.subjects).toEqual([
      { subject: "English", marks: 40, outOf: 50, absent: false, percent: 80, grade: "B1", passed: true },
      { subject: "Mathematics", marks: 90, outOf: 100, absent: false, percent: 90, grade: "A2", passed: true },
    ]);
    expect(card.totals).toEqual({ marks: 130, outOf: 150, percent: 87, grade: "A2", result: "pass" });
    expect(card.classTeacher).toBe("Meena Singh");
    expect(card.passPercent).toBe(33);
  });

  it("a subject below the pass mark fails the exam; an absent paper is left out of the total and shown as absent", async () => {
    const s = await school();
    const card = (await get(s.token, `/students/${s.kabir.id}/report-card?examId=${s.exam}`)).body.data;
    expect(card.subjects).toEqual([
      { subject: "English", marks: null, outOf: 0, absent: true, percent: null, grade: null, passed: null },
      { subject: "Mathematics", marks: 20, outOf: 100, absent: false, percent: 20, grade: "E", passed: false },
    ]);
    expect(card.totals).toEqual({ marks: 20, outOf: 100, percent: 20, grade: "E", result: "fail" });
  });

  it("while no mark is in, the card has the subjects and no total", async () => {
    const s = await school();
    const card = (await get(s.token, `/students/${s.asha.id}/report-card?examId=${s.exam}`)).body.data;
    const empty = (await get(s.token, `/students/${s.asha.id}/report-card?examId=${s.exam}`)).body.data;
    expect(empty.totals).not.toBeNull();
    // Clearing every mark of Asha: marks: null with no absence clears a result.
    for (const paper of [s.maths, s.english]) await request(app).put(`${exams}/papers/${paper}/marks`).set(auth(s.token)).send({ classId: s.a.classId, sectionId: s.a.sectionId, marks: [{ studentId: s.asha.id, marks: null, absent: false }] });
    const cleared = (await get(s.token, `/students/${s.asha.id}/report-card?examId=${s.exam}`)).body.data;
    expect(cleared.subjects.map((x: { marks: number | null }) => x.marks)).toEqual([null, null]);
    expect(cleared.totals).toBeNull();
    expect(card.subjects).toHaveLength(2);
  });

  it("carries the attendance tally of the session (late counts as there)", async () => {
    const s = await school();
    const put = (date: string, marks: object[]) => request(app).put("/api/v1/classroom/attendance").set(auth(s.tokens.meena)).send({ classId: s.a.classId, sectionId: s.a.sectionId, date, marks });
    await put("2026-11-02", [{ studentId: s.asha.id, status: "absent" }]);
    await put("2026-11-03", [{ studentId: s.asha.id, status: "late" }]);
    await put("2026-11-04", []);
    const a = (await get(s.token, `/students/${s.asha.id}/report-card?examId=${s.exam}`)).body.data.attendance;
    expect(a).toMatchObject({ absent: 1, late: 1, present: 1, days: 3, percent: 67 });
  });

  it("makes the report cards of a whole class for one exam; an exam that is not the school's is not found", async () => {
    const s = await school();
    const res = await get(s.token, `/classes/${s.class5.id}/report-cards?examId=${s.exam}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((c: { student: { name: string }; totals: { result: string } | null }) => [c.student.name, c.totals?.result])).toEqual(expect.arrayContaining([["Asha Verma", "pass"], ["Kabir Rao", "fail"]]));
    expect((await get(s.token, `/classes/${s.class5.id}/report-cards?examId=${"a".repeat(24)}`)).status).toBe(404);
    expect((await get(s.token, `/classes/${s.class5.id}/report-cards`)).status).toBe(400);
    expect((await get(s.token, `/students/${s.asha.id}/report-card`)).status).toBe(400);
  });

  it("the Documents page's boxes: the classes with their sections and the exams of the session", async () => {
    const s = await school();
    const options = (await get(s.token, "/options")).body.data;
    expect(options.classes.find((c: { name: string }) => c.name === "Class 5")).toMatchObject({ sections: [{ name: "A" }] });
    expect(options.exams).toMatchObject([{ name: "Half-Yearly Exam", kind: "half_yearly" }]);
  });
});

describe("what a parent reads", () => {
  it("their own child's ID card and report card; another family's child is not found; each needs the school's leave", async () => {
    const s = await school();
    const card = await request(app).get(`/api/v1/parent/children/${s.asha.id}/id-card`).set(auth(s.tokens.ravi));
    expect(card.status).toBe(200);
    expect(card.body.data.student.name).toBe("Asha Verma");
    const report = await request(app).get(`/api/v1/parent/children/${s.asha.id}/report-card?examId=${s.exam}`).set(auth(s.tokens.ravi));
    expect(report.body.data.totals.result).toBe("pass");
    for (const path of [`id-card`, `report-card?examId=${s.exam}`]) expect((await request(app).get(`/api/v1/parent/children/${s.kabir.id}/${path}`).set(auth(s.tokens.ravi))).status, path).toBe(404);
    await request(app).put("/api/v1/permissions/parent").set(auth(s.token)).send({ permissions: ["child.attendance"] });
    expect((await request(app).get(`/api/v1/parent/children/${s.asha.id}/id-card`).set(auth(s.tokens.ravi))).status).toBe(403);
    expect((await request(app).get(`/api/v1/parent/children/${s.asha.id}/report-card?examId=${s.exam}`).set(auth(s.tokens.ravi))).status).toBe(403);
  });
});

describe("who may, and one school never reaches another's", () => {
  it("needs documents.view: a receptionist without it, a teacher and a parent are refused; with it a receptionist reads but cannot change a photo", async () => {
    const s = await school();
    const reception = await addColleague(s.tenantId, "receptionist");
    expect((await get(reception, `/students/${s.asha.id}/id-card`)).status).toBe(403);
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["documents.view"] });
    expect((await get(reception, `/students/${s.asha.id}/id-card`)).status).toBe(200);
    expect((await get(reception, `/students/${s.asha.id}/report-card?examId=${s.exam}`)).status).toBe(200);
    expect((await request(app).put(`${api}/students/${s.asha.id}/photo`).set(auth(reception)).attach("photo", PNG, { filename: "a.png", contentType: "image/png" })).status).toBe(403);
    for (const token of [s.tokens.meena, s.tokens.ravi]) {
      expect((await get(token, `/students/${s.asha.id}/id-card`)).status).toBe(403);
      expect((await get(token, "/options")).status).toBe(403);
    }
    expect((await request(app).get(`${api}/options`)).status).toBe(401);
  });

  it("another school cannot read or change this school's cards, report cards, photos or classes", async () => {
    const a = await school("Sunrise Public School", "sun.");
    const b = await school("Moonrise Public School", "moon.");
    await request(app).put(`${api}/students/${a.asha.id}/photo`).set(auth(a.token)).attach("photo", PNG, { filename: "a.png", contentType: "image/png" });
    expect((await get(b.token, `/students/${a.asha.id}/id-card`)).status).toBe(404);
    expect((await get(b.token, `/students/${a.asha.id}/report-card?examId=${b.exam}`)).status).toBe(404);
    expect((await get(b.token, `/students/${a.asha.id}/photo`)).status).toBe(404);
    expect((await request(app).put(`${api}/students/${a.asha.id}/photo`).set(auth(b.token)).attach("photo", PNG, { filename: "a.png", contentType: "image/png" })).status).toBe(404);
    expect((await request(app).delete(`${api}/students/${a.asha.id}/photo`).set(auth(b.token))).status).toBe(404);
    expect((await get(b.token, `/classes/${a.class5.id}/id-cards`)).status).toBe(404);
    // B's own student with A's exam: not found.
    expect((await get(b.token, `/students/${b.asha.id}/report-card?examId=${a.exam}`)).status).toBe(404);
    expect((await get(a.token, `/students/${a.asha.id}/photo`)).body.data.photo).toMatch(/^data:image\/png/);
  });
});
