import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool as makeSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { auth } from "../../../test/timetable";
import { Notification } from "../models/Notification";
import { NotificationService } from "../services/notification.service";

/**
 * Who hears of the exams (2026-11-06, docs/notifications.md): everyone of the school hears that an exam is scheduled, changed or taken
 * off; a timetable added or a paper changed or taken away reaches the parents and the teachers of those classes and nobody else; marks
 * reach the parent of the child they are new for. Nobody is told of what they did themselves; saving the same thing again tells nobody.
 */

const api = "/api/v1/exams";
/** A day that has passed (its papers are held) and one that has not come: both inside the test school's year. */
const PAST = "2026-09-15";
const EXAM = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-04-10", endDate: "2027-03-20", schoolStart: "08:00", schoolEnd: "12:30" };

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  childId: string | null;
}

async function bell(token: string) {
  await NotificationService.idle();
  const res = await request(app).get("/api/v1/notifications").set(auth(token));
  expect(res.status).toBe(200);
  return res.body.data.items as Item[];
}
const kinds = async (token: string) => (await bell(token)).map((i) => i.kind);
const examKinds = async (token: string) => (await kinds(token)).filter((k) => k.startsWith("exam."));

async function setUp() {
  const s = await makeSchool();
  await NotificationService.idle();
  await Notification.deleteMany({ tenantId: s.tenantId });
  const schedule = (over: object = {}) => request(app).post(api).set(auth(s.token)).send({ ...EXAM, ...over });
  const addPapers = (examId: string, classIds: string[], papers: object[], token = s.token) => request(app).post(`${api}/${examId}/papers`).set(auth(token)).send({ classIds, papers });
  const paper = (subjectId: string, date: string, over: object = {}) => ({ subjectId, date, startTime: "09:00", durationMinutes: 60, maxMarks: 50, ...over });
  const people = [s.tokens.meena, s.tokens.dev, s.tokens.kiran, s.tokens.ravi, s.tokens.sita, s.tokens.anil];
  return { s, schedule, addPapers, paper, people };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("an exam scheduled, changed or taken off", () => {
  it("scheduling tells every teacher and every parent of the school, with the days and the school's hours; the one who did it hears nothing", async () => {
    const { s, schedule, people } = await setUp();
    const res = await schedule({ startDate: "2026-09-15", endDate: "2026-09-26" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    for (const token of people) {
      const items = (await bell(token)).filter((i) => i.kind === "exam.scheduled");
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Half-Yearly Exam is scheduled");
      expect(items[0].body).toContain("15 Sep to 26 Sep");
      expect(items[0].body).toContain("School 8:00 AM to 12:30 PM");
    }
    expect(await examKinds(s.token)).toEqual([]);
  });

  it("a one-day test says the day only, and no school hours", async () => {
    const { s, schedule } = await setUp();
    await schedule({ name: "Class test", type: "class_test", startDate: "2026-11-20", endDate: "2026-11-20", schoolStart: null, schoolEnd: null });
    const item = (await bell(s.tokens.ravi)).find((i) => i.kind === "exam.scheduled")!;
    expect(item.title).toBe("Class test is scheduled");
    expect(item.body).toBe("20 Nov");
  });

  it("changing the days, the school's hours or the name tells everyone; changing only the note tells nobody", async () => {
    const { s, schedule } = await setUp();
    const exam = (await schedule({ startDate: "2026-09-15", endDate: "2026-09-26" })).body.data;
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });

    expect((await request(app).patch(`${api}/${exam.id}`).set(auth(s.token)).send({ note: "Bring your own geometry box" })).status).toBe(200);
    expect(await examKinds(s.tokens.ravi)).toEqual([]);

    expect((await request(app).patch(`${api}/${exam.id}`).set(auth(s.token)).send({ endDate: "2026-09-29", schoolEnd: "13:00" })).status).toBe(200);
    for (const token of [s.tokens.meena, s.tokens.ravi, s.tokens.anil]) {
      const item = (await bell(token)).find((i) => i.kind === "exam.changed")!;
      expect(item.title).toBe("Half-Yearly Exam changed");
      expect(item.body).toContain("15 Sep to 29 Sep");
      expect(item.body).toContain("School 8:00 AM to 1:00 PM");
    }
    // The same save again changes nothing: nobody hears twice.
    await request(app).patch(`${api}/${exam.id}`).set(auth(s.token)).send({ endDate: "2026-09-29", schoolEnd: "13:00" });
    expect((await kinds(s.tokens.ravi)).filter((k) => k === "exam.changed")).toHaveLength(1);

    await request(app).patch(`${api}/${exam.id}`).set(auth(s.token)).send({ name: "Mid-term Exam" });
    expect((await bell(s.tokens.ravi))[0].title).toBe("Mid-term Exam changed");
  });

  it("taking the exam away tells everyone", async () => {
    const { s, schedule } = await setUp();
    const exam = (await schedule({ startDate: "2026-09-15", endDate: "2026-09-26" })).body.data;
    expect((await request(app).delete(`${api}/${exam.id}`).set(auth(s.token))).status).toBe(200);
    const item = (await bell(s.tokens.sita)).find((i) => i.kind === "exam.removed")!;
    expect(item.title).toBe("Half-Yearly Exam is taken off");
    expect(await examKinds(s.tokens.dev)).toContain("exam.removed");
  });

  it("a refused request tells nobody", async () => {
    const { s, schedule } = await setUp();
    const bad = await schedule({ startDate: "2025-01-01", endDate: "2025-01-02" });
    expect(bad.status).toBe(400);
    expect(await examKinds(s.tokens.ravi)).toEqual([]);
  });
});

describe("a timetable added, a paper changed or taken away", () => {
  it("a timetable for Class 5 reaches Class 5's parents and the teachers of Class 5, each with the page that shows it; not Class 1's parents, not Kiran", async () => {
    const { s, schedule, addPapers, paper } = await setUp();
    const exam = (await schedule()).body.data;
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    const res = await addPapers(exam.id, [s.class5.id], [paper(s.maths, "2027-03-15"), paper(s.english, "2027-03-17")]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const ravi = (await bell(s.tokens.ravi)).filter((i) => i.kind === "exam.timetable");
    expect(ravi).toHaveLength(1);
    expect(ravi[0]).toMatchObject({ title: "Half-Yearly Exam: Class 5 timetable", link: `/my-children/${s.asha.id}`, childId: s.asha.id });
    expect(ravi[0].body).toBe("Mathematics 15 Mar · English 17 Mar");
    expect((await bell(s.tokens.sita)).find((i) => i.kind === "exam.timetable")?.childId).toBe(s.kabir.id);
    for (const token of [s.tokens.meena, s.tokens.dev]) {
      const item = (await bell(token)).find((i) => i.kind === "exam.timetable")!;
      expect(item.title).toBe("Half-Yearly Exam: Class 5 timetable");
      expect(item.link).toBe(`/class-work/${s.class5.id}?section=${s.a.sectionId}&tab=exams`);
    }
    expect(await examKinds(s.tokens.anil)).toEqual([]);
    expect(await examKinds(s.tokens.kiran)).toEqual([]);
  });

  it("a timetable for two classes names both; a teacher of both hears once", async () => {
    const { s, schedule, addPapers, paper } = await setUp();
    const exam = (await schedule()).body.data;
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    await addPapers(exam.id, [s.class5.id, s.class1.id], [paper(s.maths, "2027-03-15")]);
    expect((await bell(s.tokens.anil)).find((i) => i.kind === "exam.timetable")!.title).toBe("Half-Yearly Exam: Class 1 timetable");
    expect((await kinds(s.tokens.meena)).filter((k) => k === "exam.timetable")).toHaveLength(1);
  });

  it("a long timetable lists the first papers and says how many more", async () => {
    const { s, schedule, addPapers, paper } = await setUp();
    const exam = (await schedule()).body.data;
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    const days = ["2027-03-10", "2027-03-11", "2027-03-12", "2027-03-13", "2027-03-15", "2027-03-16"];
    await addPapers(exam.id, [s.class5.id], days.map((d, i) => paper(i % 2 ? s.english : s.maths, d)));
    const body = (await bell(s.tokens.ravi)).find((i) => i.kind === "exam.timetable")!.body!;
    expect(body).toBe("Mathematics 10 Mar · English 11 Mar · Mathematics 12 Mar · English 13 Mar · and 2 more");
  });

  it("a refused timetable (a clash) tells nobody", async () => {
    const { s, schedule, addPapers, paper } = await setUp();
    const exam = (await schedule()).body.data;
    await addPapers(exam.id, [s.class5.id], [paper(s.maths, "2027-03-15")]);
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    expect((await addPapers(exam.id, [s.class5.id], [paper(s.english, "2027-03-15")])).status).toBe(409);
    expect(await examKinds(s.tokens.ravi)).toEqual([]);
  });

  it("changing a paper's day tells the parents and teachers of its classes what it is now; saving the same again tells nobody", async () => {
    const { s, schedule, addPapers, paper } = await setUp();
    const exam = (await schedule()).body.data;
    const made = (await addPapers(exam.id, [s.class5.id], [paper(s.maths, "2027-03-15")])).body.data.items[0];
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });

    const patch = (body: object) => request(app).patch(`${api}/${exam.id}/papers/${made.id}`).set(auth(s.token)).send(body);
    expect((await patch({ date: "2027-03-16", startTime: "10:30" })).status).toBe(200);
    const ravi = (await bell(s.tokens.ravi)).find((i) => i.kind === "exam.paper_changed")!;
    expect(ravi).toMatchObject({ title: "Mathematics paper changed: Asha Verma", childId: s.asha.id, link: `/my-children/${s.asha.id}` });
    expect(ravi.body).toBe("Half-Yearly Exam · 16 Mar, 10:30 AM to 11:30 AM");
    expect((await bell(s.tokens.meena)).find((i) => i.kind === "exam.paper_changed")!.title).toBe("Mathematics paper changed: Class 5");
    expect(await examKinds(s.tokens.anil)).toEqual([]);

    await patch({ date: "2027-03-16", startTime: "10:30" });
    expect((await kinds(s.tokens.ravi)).filter((k) => k === "exam.paper_changed")).toHaveLength(1);
  });

  it("taking a class off a paper tells that class's parents too", async () => {
    const { s, schedule, addPapers, paper } = await setUp();
    const exam = (await schedule()).body.data;
    const made = (await addPapers(exam.id, [s.class5.id, s.class1.id], [paper(s.maths, "2027-03-15")])).body.data.items[0];
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    await request(app).patch(`${api}/${exam.id}/papers/${made.id}`).set(auth(s.token)).send({ classIds: [s.class5.id] });
    expect((await bell(s.tokens.anil)).find((i) => i.kind.startsWith("exam."))).toMatchObject({ kind: "exam.paper_removed", title: "Mathematics paper on 15 Mar is taken off: Mira Shah" });
    expect(await examKinds(s.tokens.ravi)).toEqual(["exam.paper_changed"]);
  });

  it("taking a paper away tells the parents and teachers of its classes", async () => {
    const { s, schedule, addPapers, paper } = await setUp();
    const exam = (await schedule()).body.data;
    const made = (await addPapers(exam.id, [s.class5.id], [paper(s.maths, "2027-03-15")])).body.data.items[0];
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    expect((await request(app).delete(`${api}/${exam.id}/papers/${made.id}`).set(auth(s.token))).status).toBe(200);
    const ravi = (await bell(s.tokens.ravi)).find((i) => i.kind === "exam.paper_removed")!;
    expect(ravi.title).toBe("Mathematics paper on 15 Mar is taken off: Asha Verma");
    expect(ravi.body).toBe("Half-Yearly Exam");
    expect(await examKinds(s.tokens.meena)).toEqual(["exam.paper_removed"]);
    expect(await examKinds(s.tokens.anil)).toEqual([]);
  });

  it("a child who has left is not told, but a classmate's parent still is", async () => {
    const { s, schedule, addPapers, paper } = await setUp();
    const exam = (await schedule()).body.data;
    expect((await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [s.asha.id], reason: "Moved away" })).status).toBe(200);
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    await addPapers(exam.id, [s.class5.id], [paper(s.maths, "2027-03-15")]);
    // Asha's parent has no open login now (the bell itself is closed to them), and nothing was kept for them either.
    await NotificationService.idle();
    expect(await Notification.countDocuments({ tenantId: s.tenantId, childId: s.asha.id })).toBe(0);
    expect(await examKinds(s.tokens.sita)).toEqual(["exam.timetable"]);
  });
});

describe("marks", () => {
  async function held() {
    const ctx = await setUp();
    const exam = (await ctx.schedule()).body.data;
    const made = (await ctx.addPapers(exam.id, [ctx.s.class5.id], [ctx.paper(ctx.s.maths, PAST)])).body.data.items[0];
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: ctx.s.tenantId });
    const put = (marks: object[], token = ctx.s.tokens.meena) =>
      request(app).put(`${api}/papers/${made.id}/marks`).set(auth(token)).send({ classId: ctx.s.a.classId, sectionId: ctx.s.a.sectionId, marks });
    return { ...ctx, exam, made, put };
  }

  it("the parent of a child with a new mark hears it; the school hears the average; the teacher who entered it hears nothing", async () => {
    const { s, put } = await held();
    expect((await put([{ studentId: s.asha.id, marks: 42, absent: false }, { studentId: s.kabir.id, marks: 30, absent: false }])).status).toBe(200);
    const ravi = (await bell(s.tokens.ravi)).find((i) => i.kind === "exam.marks")!;
    expect(ravi).toMatchObject({ title: "Asha Verma: 42 / 50 in Mathematics", childId: s.asha.id, link: `/my-children/${s.asha.id}` });
    expect(ravi.body).toContain("Half-Yearly Exam");
    expect((await bell(s.tokens.sita)).find((i) => i.kind === "exam.marks")!.title).toBe("Kabir Rao: 30 / 50 in Mathematics");
    const admin = (await bell(s.token)).find((i) => i.kind === "exam.marks")!;
    expect(admin.title).toBe("Marks of Mathematics: Half-Yearly Exam");
    expect(admin.body).toContain("Class 5 - A");
    expect(admin.body).toContain("average 72%");
    expect(admin.body).toContain("Meena Singh");
    expect(await examKinds(s.tokens.meena)).toEqual([]);
    expect(await examKinds(s.tokens.anil)).toEqual([]);
  });

  it("an absent child is said absent; saving the same marks again tells nobody; a changed mark tells only that parent", async () => {
    const { s, put } = await held();
    await put([{ studentId: s.asha.id, marks: null, absent: true }, { studentId: s.kabir.id, marks: 30, absent: false }]);
    expect((await bell(s.tokens.ravi)).find((i) => i.kind === "exam.marks")!.title).toBe("Asha Verma was absent for the Mathematics paper");
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    await put([{ studentId: s.asha.id, marks: null, absent: true }, { studentId: s.kabir.id, marks: 30, absent: false }]);
    expect(await examKinds(s.tokens.ravi)).toEqual([]);
    expect(await examKinds(s.tokens.sita)).toEqual([]);
    await put([{ studentId: s.kabir.id, marks: 35, absent: false }]);
    expect(await examKinds(s.tokens.sita)).toEqual(["exam.marks"]);
    expect(await examKinds(s.tokens.ravi)).toEqual([]);
  });

  it("marks the school entered are heard by the class teacher too", async () => {
    const { s, put } = await held();
    await put([{ studentId: s.asha.id, marks: 20, absent: false }], s.token);
    expect(await examKinds(s.tokens.meena)).toEqual(["exam.marks"]);
  });
});

describe("the school hears too (another admin or the principal)", () => {
  it("when the principal schedules an exam the school admin hears it with the exam's page; the principal hears nothing of their own act", async () => {
    const { s, people } = await setUp();
    const principal = await addColleague(s.tenantId, "principal");
    const made = await request(app).post(api).set(auth(principal)).send({ ...EXAM, startDate: "2026-09-15", endDate: "2026-09-26" });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const admin = (await bell(s.token)).find((i) => i.kind === "exam.scheduled")!;
    expect(admin).toMatchObject({ title: "Half-Yearly Exam is scheduled", link: `/school/exams/${made.body.data.id}` });
    expect(await examKinds(principal)).toEqual([]);
    // Everyone else was sent to their home.
    expect((await bell(people[3])).find((i) => i.kind === "exam.scheduled")!.link).toBe("/dashboard");
  });

  it("a timetable the principal adds tells the school admin how many papers for which classes; marks the teacher enters tell both admin and principal", async () => {
    const { s, schedule, paper } = await setUp();
    const principal = await addColleague(s.tenantId, "principal");
    const exam = (await schedule()).body.data;
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    const added = await request(app).post(`${api}/${exam.id}/papers`).set(auth(principal)).send({ classIds: [s.class5.id, s.class1.id], papers: [paper(s.maths, PAST), paper(s.english, "2026-09-16")] });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const item = (await bell(s.token)).find((i) => i.kind === "exam.timetable")!;
    expect(item).toMatchObject({ title: "Half-Yearly Exam: timetable added", link: `/school/exams/${exam.id}` });
    expect(item.body).toBe("2 papers for Class 1 and Class 5");

    const paperId = added.body.data.items[0].id;
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    await request(app).put(`${api}/papers/${paperId}/marks`).set(auth(s.tokens.meena)).send({ classId: s.a.classId, sectionId: s.a.sectionId, marks: [{ studentId: s.asha.id, marks: 40, absent: false }] });
    expect(await examKinds(s.token)).toEqual(["exam.marks"]);
    expect(await examKinds(principal)).toEqual(["exam.marks"]);
  });
});
