import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { createSchool } from "../../../test/schools";
import { addClass, auth } from "../../../test/timetable";

/**
 * Whom an exam is for (2026-11-26, the user: "exam poore school ka hoga ya kisi department ka ya kisi class ka, yeh bhi choose kar sakte hain"):
 * the whole school, some departments, or some classes. Its timetable is only for those classes. On a day a class writes a paper of a full exam,
 * the school's time for that class is the time of its papers ("9 se 12 exam hai to school ka time us din yahi"); a class with no paper keeps its day.
 */

const api = "/api/v1/exams";
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const EXAM = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-09-14", endDate: "2026-09-26" };
const names = (list: { name: string }[]) => list.map((c) => c.name);

async function setUp() {
  const s = await classroomSchool();
  const class9 = await addClass(s.token, "Class 9");
  const class10 = await addClass(s.token, "Class 10");
  const department = async (name: string, classIds: string[]) =>
    (await request(app).post("/api/v1/academics/departments/assign").set(auth(s.token)).send({ name, classIds })).body.data.department.id as string;
  const primary = await department("Primary", [s.class1.id, s.class5.id]);
  const secondary = await department("Secondary", [class9.id, class10.id]);
  const schedule = (body: object) => request(app).post(api).set(auth(s.token)).send({ ...EXAM, ...body });
  const change = (id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(s.token)).send(body);
  const add = (examId: string, classIds: string[], papers: object[]) => request(app).post(`${api}/${examId}/papers`).set(auth(s.token)).send({ classIds, papers });
  const paper = (subjectId: string, date: string, startTime = "09:00", durationMinutes = 180) => ({ subjectId, date, startTime, durationMinutes });
  return { s, class9, class10, primary, secondary, schedule, change, add, paper };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("whom an exam is for", () => {
  it("the whole school (as before), some departments or some classes; the list and the exam say whom, with the classes in the school's order", async () => {
    const { class9, class10, primary, schedule, s } = await setUp();
    const whole = await schedule({});
    expect(whole.status, JSON.stringify(whole.body)).toBe(201);
    expect(whole.body.data).toMatchObject({ scope: "school", audience: { label: "Whole school", departments: [] } });
    expect(names(whole.body.data.audience.classes)).toEqual(["Class 1", "Class 5", "Class 9", "Class 10"]);

    const wing = await schedule({ name: "Primary Unit Test", type: "unit_test", scope: "departments", departmentIds: [primary] });
    expect(wing.status, JSON.stringify(wing.body)).toBe(201);
    expect(wing.body.data).toMatchObject({ scope: "departments", audience: { label: "Primary", departments: [{ id: primary, name: "Primary" }] } });
    expect(names(wing.body.data.audience.classes)).toEqual(["Class 1", "Class 5"]);

    const boards = await schedule({ name: "Pre-Board", type: "pre_board", scope: "classes", classIds: [class10.id, class9.id] });
    expect(boards.status, JSON.stringify(boards.body)).toBe(201);
    expect(boards.body.data).toMatchObject({ scope: "classes", audience: { label: "Class 9 and Class 10" } });

    const list = (await request(app).get(api).set(auth(s.token))).body.data.items as { name: string; audience: { label: string } }[];
    expect(Object.fromEntries(list.map((e) => [e.name, e.audience.label]))).toEqual({ "Half-Yearly Exam": "Whole school", "Primary Unit Test": "Primary", "Pre-Board": "Class 9 and Class 10" });
    expect((await request(app).get(`${api}/${wing.body.data.id}`).set(auth(s.token))).body.data.audience.label).toBe("Primary");
  });

  it("asks for the departments or the classes it names, and only this school's", async () => {
    const { schedule } = await setUp();
    const noDepartments = await schedule({ scope: "departments", departmentIds: [] });
    expect(noDepartments.status).toBe(400);
    expect(details(noDepartments)).toContainEqual({ path: "departmentIds", message: "Choose the departments" });
    const noClasses = await schedule({ scope: "classes" });
    expect(noClasses.status).toBe(400);
    expect(details(noClasses)).toContainEqual({ path: "classIds", message: "Choose the classes" });

    const other = await createSchool("Moonrise Public School");
    const foreign = await addClass(other.token, "Class 7");
    const notOurs = await schedule({ scope: "classes", classIds: [foreign.id] });
    expect(notOurs.status).toBe(400);
    expect(details(notOurs)).toContainEqual({ path: "classIds", message: "Choose classes of this school" });
  });

  it("its timetable is only for its classes", async () => {
    const { s, class9, primary, schedule, add, paper } = await setUp();
    const exam = (await schedule({ scope: "departments", departmentIds: [primary] })).body.data;
    const refused = await add(exam.id, [s.class1.id, class9.id], [paper(s.maths, "2026-09-14")]);
    expect(refused.status).toBe(400);
    expect(details(refused)).toContainEqual({ path: "classIds", message: "Class 9 is not in this exam" });
    expect((await add(exam.id, [s.class1.id, s.class5.id], [paper(s.maths, "2026-09-14")])).status).toBe(201);
  });

  it("cannot be narrowed past a class that has papers in it; widened, it can", async () => {
    const { s, class9, primary, secondary, schedule, change, add, paper } = await setUp();
    const exam = (await schedule({})).body.data;
    await add(exam.id, [class9.id], [paper(s.maths, "2026-09-14")]);
    const narrowed = await change(exam.id, { scope: "departments", departmentIds: [primary] });
    expect(narrowed.status).toBe(409);
    expect(narrowed.body).toMatchObject({ code: "PAPERS_OUTSIDE", message: "Class 9 has papers in this exam: take them off first" });
    const both = await change(exam.id, { scope: "departments", departmentIds: [primary, secondary] });
    expect(both.status, JSON.stringify(both.body)).toBe(200);
    expect(both.body.data.audience.label).toBe("Primary and Secondary");
  });
});

describe("the school's time on an exam day follows the exam (2026-11-26)", () => {
  const week = async (token: string, classId: string, date: string) =>
    (await request(app).get(`${api}/class?classId=${classId}&date=${date}`).set(auth(token))).body.data.week.days as { date: string; schoolHours: { start: string; end: string } | null; replacesLessons: boolean }[];

  it("a class's day of a full exam is the time of its papers that day; a class with no paper keeps its usual day", async () => {
    const { s, class9, schedule, add, paper } = await setUp();
    const exam = (await schedule({})).body.data;
    await add(exam.id, [s.class1.id], [paper(s.maths, "2026-09-14", "09:00", 120)]);
    await add(exam.id, [s.class1.id], [paper(s.english, "2026-09-14", "12:00", 60)]);
    await add(exam.id, [class9.id], [paper(s.maths, "2026-09-15", "10:00", 180)]);
    expect(await week(s.token, s.class1.id, "2026-09-14")).toMatchObject([{ date: "2026-09-14", replacesLessons: true, schoolHours: { start: "09:00", end: "13:00" } }]);
    const nine = await week(s.token, class9.id, "2026-09-14");
    expect(nine).toMatchObject([{ date: "2026-09-15", schoolHours: { start: "10:00", end: "13:00" } }]);
    expect(nine.map((d) => d.date)).not.toContain("2026-09-14");
  });

  it("an exam that keeps school hours of its own still says them", async () => {
    const { s, schedule, add, paper } = await setUp();
    const exam = (await schedule({ schoolStart: "08:00", schoolEnd: "12:30" })).body.data;
    await add(exam.id, [s.class1.id], [paper(s.maths, "2026-09-14", "09:00", 120)]);
    expect(await week(s.token, s.class1.id, "2026-09-14")).toMatchObject([{ schoolHours: { start: "08:00", end: "12:30" } }]);
  });
});
