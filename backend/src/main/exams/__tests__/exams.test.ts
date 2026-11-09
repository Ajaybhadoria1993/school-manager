import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { examStatus, sortExams } from "../services/status";
import { todayInIndia } from "../../students/schemas/students.schemas";

/**
 * Test & Exam (Manage school): the school schedules an exam (Half-Yearly, Annual) or a test (Unit, Monthly, Class test) for its academic
 * year: a name, what it is, the days it runs, and for a full exam the hours the school keeps while it is on. What each class writes
 * on which day is in examPapers.test.ts.
 */

const api = "/api/v1/exams";
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const HALF_YEARLY = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-09-15", endDate: "2026-09-26", schoolStart: "08:00", schoolEnd: "12:30", note: "Bring your own geometry box" };
const create = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("scheduling an exam", () => {
  it("the school puts an exam on its year with the days it runs and the hours the school keeps meanwhile", async () => {
    const s = await classroomSchool();
    const res = await create(s.token, HALF_YEARLY);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Half-Yearly Exam",
      type: "half_yearly",
      typeLabel: "Half-yearly exam",
      full: true,
      startDate: "2026-09-15",
      endDate: "2026-09-26",
      schoolHours: { start: "08:00", end: "12:30" },
      note: "Bring your own geometry box",
      paperCount: 0,
      classCount: 0,
    });
    expect(["upcoming", "running", "over"]).toContain(res.body.data.status);
    expect(res.body.data.status).toBe(examStatus("2026-09-15", "2026-09-26", todayInIndia()));

    const list = await request(app).get(api).set(auth(s.token));
    expect(list.body.data.items.map((e: { name: string }) => e.name)).toEqual(["Half-Yearly Exam"]);
    const one = await request(app).get(`${api}/${res.body.data.id}`).set(auth(s.token));
    expect(one.body.data).toMatchObject({ name: "Half-Yearly Exam", papers: [] });
  });

  it("a test has one day (the last day is the first when none is given) and no school hours: the day goes on as usual", async () => {
    const s = await classroomSchool();
    const res = await create(s.token, { name: "Monthly Test - October", type: "monthly_test", startDate: "2026-10-30" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ typeLabel: "Monthly test", full: false, startDate: "2026-10-30", endDate: "2026-10-30", schoolHours: null, note: null });
  });

  it("is made only by the people who run the school, and read by them (teachers and parents have no say here yet)", async () => {
    const s = await classroomSchool();
    for (const token of [s.tokens.meena, s.tokens.ravi]) {
      expect((await create(token, HALF_YEARLY)).status).toBe(403);
      expect((await request(app).get(api).set(auth(token))).status).toBe(403);
    }
  });

  it("refuses what cannot be, in words: no name, an unknown kind, the last day before the first, school hours half given or on a test", async () => {
    const s = await classroomSchool();
    const bad = async (over: object) => details(await create(s.token, { ...HALF_YEARLY, ...over }));
    expect(await bad({ name: " " })).toContainEqual({ path: "name", message: "Enter the exam name" });
    expect(await bad({ type: "party" })).toContainEqual({ path: "type", message: "Choose what it is" });
    expect(await bad({ startDate: undefined })).toContainEqual({ path: "startDate", message: "Choose the first day" });
    expect(await bad({ endDate: "2026-09-10" })).toContainEqual({ path: "endDate", message: "The last day cannot be before the first day" });
    expect(await bad({ schoolEnd: null })).toContainEqual({ path: "schoolEnd", message: "Give the time the school starts and the time it ends" });
    expect(await bad({ schoolStart: "13:00" })).toContainEqual({ path: "schoolEnd", message: "School must end after it starts" });
    expect(await bad({ type: "class_test" })).toContainEqual({ path: "schoolStart", message: "School hours are for a full exam, not for a test" });
  });

  it("stays inside the academic year, and no two of the year share a name", async () => {
    const s = await classroomSchool();
    const outside = await create(s.token, { ...HALF_YEARLY, startDate: "2027-03-25", endDate: "2027-04-05" });
    expect(outside.status).toBe(400);
    expect(details(outside)).toContainEqual({ path: "endDate", message: "The exam must fall inside the academic year (1 Apr 2026 to 31 Mar 2027)" });
    expect((await create(s.token, { ...HALF_YEARLY, startDate: "2026-03-30", endDate: "2026-04-03" })).status).toBe(400);

    expect((await create(s.token, HALF_YEARLY)).status).toBe(201);
    const again = await create(s.token, { ...HALF_YEARLY, name: "  half-yearly exam " });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("EXAM_EXISTS");
  });

  it("changes its name, days and hours, and takes it away", async () => {
    const s = await classroomSchool();
    const id = (await create(s.token, HALF_YEARLY)).body.data.id;
    const changed = await request(app).patch(`${api}/${id}`).set(auth(s.token)).send({ name: "Half-Yearly 2026", endDate: "2026-09-30", schoolEnd: "13:00" });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data).toMatchObject({ name: "Half-Yearly 2026", startDate: "2026-09-15", endDate: "2026-09-30", schoolHours: { start: "08:00", end: "13:00" } });
    const noHours = await request(app).patch(`${api}/${id}`).set(auth(s.token)).send({ schoolStart: null, schoolEnd: null });
    expect(noHours.body.data.schoolHours).toBeNull();

    expect((await request(app).delete(`${api}/${id}`).set(auth(s.token))).status).toBe(200);
    expect((await request(app).get(`${api}/${id}`).set(auth(s.token))).status).toBe(404);
    expect((await request(app).get(api).set(auth(s.token))).body.data.items).toEqual([]);
  });

  it("an exam that is not the school's (or not there) is said so in words", async () => {
    const s = await classroomSchool();
    const missing = await request(app).get(`${api}/64b64b64b64b64b64b64b64b`).set(auth(s.token));
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("EXAM_NOT_FOUND");
    expect((await request(app).get(`${api}/nonsense`).set(auth(s.token))).status).toBe(400);
  });
});

describe("whether an exam has come", () => {
  it("is upcoming before its first day, running from the first to the last day, and over after it", () => {
    expect(examStatus("2026-09-15", "2026-09-26", "2026-09-14")).toBe("upcoming");
    expect(examStatus("2026-09-15", "2026-09-26", "2026-09-15")).toBe("running");
    expect(examStatus("2026-09-15", "2026-09-26", "2026-09-20")).toBe("running");
    expect(examStatus("2026-09-15", "2026-09-26", "2026-09-26")).toBe("running");
    expect(examStatus("2026-09-15", "2026-09-26", "2026-09-27")).toBe("over");
  });

  it("lists the one that is on first, then the next ones in the order they come, then the ones over, the latest first", () => {
    const exams = [
      { name: "annual", status: "upcoming", startDate: "2027-03-01" },
      { name: "unit 1", status: "over", startDate: "2026-07-10" },
      { name: "half yearly", status: "running", startDate: "2026-09-15" },
      { name: "unit 2", status: "over", startDate: "2026-08-10" },
      { name: "monthly", status: "upcoming", startDate: "2026-10-30" },
    ] as const;
    expect(sortExams([...exams]).map((e) => e.name)).toEqual(["half yearly", "monthly", "annual", "unit 2", "unit 1"]);
  });
});
