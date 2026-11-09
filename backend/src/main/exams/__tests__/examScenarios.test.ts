import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { addSubject, auth } from "../../../test/timetable";
import { NotificationService } from "../../notifications/services/notification.service";

/**
 * Things that happen in a real school around an exam (2026-11-06): a holiday declared after the timetable was made, a subject taken out
 * while it has papers, a principal running the exams, marks typed carelessly, a class with sections. Positive and negative cases.
 */

const api = "/api/v1/exams";
const PAST = "2026-09-15";
const FUTURE = "2027-03-15";
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
  const marks = (paperId: string, list: object[], token = s.tokens.meena, u: { classId: string; sectionId: string | null } = s.a) =>
    request(app).put(`${api}/papers/${paperId}/marks`).set(auth(token)).send({ classId: u.classId, sectionId: u.sectionId, marks: list });
  const sheet = (paperId: string, token: string, u: { classId: string; sectionId: string | null } = s.a) => request(app).get(`${api}/papers/${paperId}/marks?${unit(u)}`).set(auth(token));
  return { s, exam, addPaper, marks, sheet, unit };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a holiday declared after the timetable was made", () => {
  it("is allowed (a sudden holiday cannot wait), and the paper on that day is marked so the school can move it", async () => {
    const { s, exam, addPaper } = await setUp();
    await addPaper([s.class5.id], s.maths, FUTURE);
    await addPaper([s.class5.id], s.english, "2027-03-16");
    const holiday = await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ kind: "holiday", title: "Heavy rain", startDate: FUTURE, endDate: FUTURE });
    expect(holiday.status, JSON.stringify(holiday.body)).toBe(201);

    const detail = (await request(app).get(`${api}/${exam.id}`).set(auth(s.token))).body.data;
    const byDay = Object.fromEntries(detail.papers.map((p: { date: string; holiday: string | null }) => [p.date, p.holiday]));
    expect(byDay[FUTURE]).toBe("Heavy rain");
    expect(byDay["2027-03-16"]).toBeNull();
    // The teachers see it in their class's list too.
    const klass = (await request(app).get(`${api}/class?${`classId=${s.a.classId}&sectionId=${s.a.sectionId}`}`).set(auth(s.tokens.meena))).body.data;
    expect(klass.items[0].papers.find((p: { date: string }) => p.date === FUTURE).holiday).toBe("Heavy rain");
  });

  it("moving the paper to a working day clears the mark; moving it onto the holiday is refused", async () => {
    const { s, exam, addPaper } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, FUTURE);
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ kind: "holiday", title: "Heavy rain", startDate: FUTURE, endDate: FUTURE });
    const onto = await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ topic: "Fractions" });
    // Changing only the topic leaves it on the holiday: that is not a move, so the change is allowed.
    expect(onto.status).toBe(200);
    expect((await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ date: "2027-03-17" })).status).toBe(200);
    const detail = (await request(app).get(`${api}/${exam.id}`).set(auth(s.token))).body.data;
    expect(detail.papers[0].holiday).toBeNull();
    expect((await request(app).patch(`${api}/${exam.id}/papers/${paper.id}`).set(auth(s.token)).send({ date: FUTURE })).body.code).toBe("PAPER_ON_HOLIDAY");
  });
});

describe("taking a subject out while it has papers", () => {
  it("a subject with a paper still to come stays: the message says how many", async () => {
    const { s, addPaper } = await setUp();
    const drawing = await addSubject(s.token, "Drawing");
    await addPaper([s.class5.id], drawing, FUTURE);
    await addPaper([s.class1.id], drawing, "2027-03-16");
    const res = await request(app).patch(`/api/v1/subjects/${drawing}`).set(auth(s.token)).send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SUBJECT_IN_USE");
    expect(res.body.message).toContain("2 papers");
  });

  it("a subject whose papers are all over can be taken out; so can one once its papers are taken away", async () => {
    const { s, exam, addPaper } = await setUp();
    const drawing = await addSubject(s.token, "Drawing");
    const past = await addPaper([s.class5.id], drawing, PAST);
    expect((await request(app).patch(`/api/v1/subjects/${drawing}`).set(auth(s.token)).send({ isActive: false })).status).toBe(200);
    // Its old paper still reads with the subject's name.
    expect((await request(app).get(`${api}/${exam.id}`).set(auth(s.token))).body.data.papers[0].subject.name).toBe("Drawing");
    expect(past.id).toBeTruthy();

    const art = await addSubject(s.token, "Art");
    const future = await addPaper([s.class5.id], art, FUTURE);
    expect((await request(app).patch(`/api/v1/subjects/${art}`).set(auth(s.token)).send({ isActive: false })).status).toBe(409);
    await request(app).delete(`${api}/${exam.id}/papers/${future.id}`).set(auth(s.token));
    expect((await request(app).patch(`/api/v1/subjects/${art}`).set(auth(s.token)).send({ isActive: false })).status).toBe(200);
  });

  it("renaming or recolouring a subject with papers is not stopped", async () => {
    const { s, addPaper } = await setUp();
    const drawing = await addSubject(s.token, "Drawing");
    await addPaper([s.class5.id], drawing, FUTURE);
    expect((await request(app).patch(`/api/v1/subjects/${drawing}`).set(auth(s.token)).send({ name: "Art and Drawing" })).status).toBe(200);
  });
});

describe("the principal runs the exams like the school admin", () => {
  it("schedules an exam, adds a timetable, reads a class's exams and enters marks", async () => {
    const { s, addPaper } = await setUp();
    const principal = await addColleague(s.tenantId, "principal");
    const made = await request(app).post(api).set(auth(principal)).send({ ...EXAM, name: "Annual Exam", type: "annual" });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    expect((await request(app).get(`${api}/class?${`classId=${s.a.classId}&sectionId=${s.a.sectionId}`}`).set(auth(principal))).status).toBe(200);
    const put = await request(app).put(`${api}/papers/${paper.id}/marks`).set(auth(principal)).send({ classId: s.a.classId, sectionId: s.a.sectionId, marks: [{ studentId: s.asha.id, marks: 40, absent: false }] });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
  });

  it("an accountant, a parent and a stranger cannot schedule an exam", async () => {
    const { s } = await setUp();
    const accountant = await addColleague(s.tenantId, "accountant");
    for (const token of [accountant, s.tokens.ravi, s.tokens.meena]) expect((await request(app).post(api).set(auth(token)).send({ ...EXAM, name: "Mine" })).status).toBe(403);
    expect((await request(app).post(api).send({ ...EXAM, name: "Mine" })).status).toBe(401);
  });
});

describe("marks typed carelessly", () => {
  it("a mark that is not whole or half is refused, a child named twice counts once (the last line)", async () => {
    const { s, addPaper, marks, sheet } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    const third = await marks(paper.id, [{ studentId: s.asha.id, marks: 33.3, absent: false }]);
    expect(third.status).toBe(400);
    expect((third.body.details as { message: string }[]).map((d) => d.message)).toContain("Marks are whole or half marks");
    const twice = await marks(paper.id, [{ studentId: s.asha.id, marks: 10, absent: false }, { studentId: s.asha.id, marks: 20, absent: false }]);
    expect(twice.status).toBe(200);
    const now = (await sheet(paper.id, s.token)).body.data;
    expect(now.marked).toBe(1);
    expect(now.students.find((c: { name: string }) => c.name === "Asha Verma").marks).toBe(20);
  });

  it("text, a missing list, or too many lines are refused", async () => {
    const { s, addPaper } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    const put = (body: object) => request(app).put(`${api}/papers/${paper.id}/marks`).set(auth(s.token)).send(body);
    expect((await put({ classId: s.a.classId, sectionId: s.a.sectionId, marks: [{ studentId: s.asha.id, marks: "ten", absent: false }] })).status).toBe(400);
    expect((await put({ classId: s.a.classId, sectionId: s.a.sectionId })).status).toBe(400);
    expect((await put({ classId: "nope", marks: [] })).status).toBe(400);
    expect((await request(app).put(`${api}/papers/not-an-id/marks`).set(auth(s.token)).send({ classId: s.a.classId, marks: [] })).status).toBe(400);
  });

  it("an empty list is fine and changes nothing", async () => {
    const { s, addPaper, marks, sheet } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    expect((await marks(paper.id, [])).status).toBe(200);
    expect((await sheet(paper.id, s.token)).body.data.marked).toBe(0);
  });
});

describe("a class with sections", () => {
  it("a teacher of section A cannot open or write section B's sheet; the school can read B (no children yet)", async () => {
    const { s, addPaper, sheet, marks } = await setUp();
    const b = (await request(app).post(`/api/v1/academics/classes/${s.class5.id}/sections`).set(auth(s.token)).send({ name: "B" })).body.data as { id: string };
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    const unitB = { classId: s.class5.id, sectionId: b.id };
    const read = await sheet(paper.id, s.tokens.meena, unitB);
    expect(read.status).toBe(403);
    expect(read.body.code).toBe("NOT_YOUR_CLASS");
    expect((await marks(paper.id, [], s.tokens.meena, unitB)).status).toBe(403);
    const admin = await sheet(paper.id, s.token, unitB);
    expect(admin.status).toBe(200);
    expect(admin.body.data).toMatchObject({ label: "Class 5 - B", students: [], marked: 0 });
  });

  it("the class without a section named is refused when the class has sections", async () => {
    const { s, addPaper } = await setUp();
    const paper = await addPaper([s.class5.id], s.maths, PAST);
    const res = await request(app).get(`${api}/papers/${paper.id}/marks?classId=${s.class5.id}&sectionId=none`).set(auth(s.token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("UNIT_NEEDS_SECTION");
  });
});

describe("the whole journey, as the people of a school live it", () => {
  it("scheduled, timetable out, teachers see it, the day passes, marks go in, the parent sees the result, a correction reaches them", async () => {
    const { s, exam, addPaper, marks } = await setUp();
    await NotificationService.idle();
    const bell = async (token: string) => {
      await NotificationService.idle();
      return ((await request(app).get("/api/v1/notifications").set(auth(token))).body.data.items as { kind: string; title: string }[]).filter((i) => i.kind.startsWith("exam."));
    };

    // 1. The school gives the exam school hours and a timetable for the two classes (Class 1 writes Maths a day later).
    expect((await request(app).patch(`${api}/${exam.id}`).set(auth(s.token)).send({ schoolStart: "08:00", schoolEnd: "12:30" })).status).toBe(200);
    const maths5 = await addPaper([s.class5.id], s.maths, PAST, { maxMarks: 50, topic: "Fractions" });
    const english5 = await addPaper([s.class5.id], s.english, "2026-09-16", { maxMarks: 100 });
    await addPaper([s.class1.id], s.maths, "2026-09-16", { startTime: "10:00" });

    // 2. The teachers of Class 5 and its parents were told; Class 1's parent heard of the exam, not of Class 5's papers.
    expect((await bell(s.tokens.dev)).map((i) => i.kind).sort()).toEqual(["exam.changed", "exam.scheduled", "exam.timetable", "exam.timetable"]);
    const anil = (await bell(s.tokens.anil)).map((i) => i.kind);
    expect(anil).toContain("exam.scheduled");
    expect(anil.filter((k) => k === "exam.timetable")).toHaveLength(1);

    // 3. A class teacher sees the class's exam, the paper of the day that came is writable, the week shows the exam day.
    const view = (await request(app).get(`${api}/class?classId=${s.a.classId}&sectionId=${s.a.sectionId}&date=${PAST}`).set(auth(s.tokens.meena))).body.data;
    expect(view.items[0].papers.map((p: { subject: { name: string }; held: boolean }) => `${p.subject.name}:${p.held}`)).toEqual(["Mathematics:true", "English:true"]);
    expect(view.week.days.map((d: { date: string; replacesLessons: boolean }) => [d.date, d.replacesLessons])).toEqual([[PAST, true], ["2026-09-16", true]]);

    // 4. The subject teachers enter their own marks; the class teacher may not be refused the other's subject.
    expect((await marks(maths5.id, [{ studentId: s.asha.id, marks: 45, absent: false }, { studentId: s.kabir.id, marks: null, absent: true }])).status).toBe(200);
    expect((await marks(english5.id, [{ studentId: s.asha.id, marks: 80, absent: false }, { studentId: s.kabir.id, marks: 60, absent: false }], s.tokens.dev)).status).toBe(200);
    expect((await marks(maths5.id, [{ studentId: s.asha.id, marks: 45, absent: false }], s.tokens.dev)).status).toBe(403);

    // 5. The parents see their own child's result and total.
    const asha = (await request(app).get(`/api/v1/parent/children/${s.asha.id}/exams`).set(auth(s.tokens.ravi))).body.data.items[0];
    expect(asha.summary).toEqual({ marks: 125, outOf: 150, percent: 83, papers: 2 });
    const kabir = (await request(app).get(`/api/v1/parent/children/${s.kabir.id}/exams`).set(auth(s.tokens.sita))).body.data.items[0];
    expect(kabir.papers[0].result).toEqual({ marks: null, absent: true, percent: null });
    expect(kabir.summary).toEqual({ marks: 60, outOf: 100, percent: 60, papers: 1 });
    expect((await bell(s.tokens.ravi)).some((i) => i.kind === "exam.marks")).toBe(true);

    // 6. A correction: Asha's Maths was 47. Her parent hears; Kabir's does not hear again.
    await marks(maths5.id, [{ studentId: s.asha.id, marks: 47, absent: false }, { studentId: s.kabir.id, marks: null, absent: true }]);
    expect((await bell(s.tokens.ravi)).filter((i) => i.kind === "exam.marks")).toHaveLength(3);
    expect((await bell(s.tokens.sita)).filter((i) => i.kind === "exam.marks")).toHaveLength(2);

    // 7. The school takes the Maths paper away: its marks go from the result, the English ones stay.
    expect((await request(app).delete(`${api}/${exam.id}/papers/${maths5.id}`).set(auth(s.token))).status).toBe(200);
    const after = (await request(app).get(`/api/v1/parent/children/${s.asha.id}/exams`).set(auth(s.tokens.ravi))).body.data.items[0];
    expect(after.papers.map((p: { subject: { name: string } }) => p.subject.name)).toEqual(["English"]);
    expect(after.summary).toEqual({ marks: 80, outOf: 100, percent: 80, papers: 1 });
  });
});
