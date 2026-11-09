import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { addClass, addTiming, auth } from "../../../test/timetable";

/**
 * Which classes have not taken today's attendance (2026-11-06): the first thing a principal asks. School runs Monday to Friday from
 * 8:30 AM; 5 Nov 2026 is a Thursday. Only a class with children counts, and only on a day school runs, once school has started.
 */

const api = "/api/v1/attendance";
const THU = "2026-11-05";
const SAT = "2026-11-07";
const at = (day: string, hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));

async function setUp() {
  const s = await classroomSchool();
  await addTiming(s.token);
  const today = (token: string) => request(app).get(`${api}/students/today`).set(auth(token));
  const take = (date: string, unit = s.a) => request(app).put("/api/v1/classroom/attendance").set(auth(s.tokens.meena)).send({ ...unit, date, marks: [{ studentId: s.asha.id, status: "present" }] });
  return { s, today, take };
}

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => vi.restoreAllMocks());

describe("the classes that have not taken today's attendance", () => {
  it("lists every class or section with children that has not, in the school's order, once school has started", async () => {
    const { s, today } = await setUp();
    at(THU, "09:00");
    const res = await today(s.token);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ date: THU, working: true, holiday: null });
    expect(res.body.data.pending).toEqual([
      { classId: s.class1.id, sectionId: null, label: "Class 1" },
      { classId: s.class5.id, sectionId: s.a.sectionId, label: "Class 5 - A" },
    ]);
  });

  it("a class drops off the list when its attendance is taken (by the class teacher, or by the school)", async () => {
    const { s, today, take } = await setUp();
    at(THU, "09:00");
    expect((await take(THU)).status).toBe(200);
    expect((await today(s.token)).body.data.pending.map((p: { label: string }) => p.label)).toEqual(["Class 1"]);
    await request(app).put("/api/v1/classroom/attendance").set(auth(s.token)).send({ ...s.one, date: THU, marks: [{ studentId: s.mira.id, status: "present" }] });
    expect((await today(s.token)).body.data.pending).toEqual([]);
  });

  it("a class with no children is not asked for attendance", async () => {
    const { s, today } = await setUp();
    await addClass(s.token, "Class 9");
    at(THU, "09:00");
    expect((await today(s.token)).body.data.pending.map((p: { label: string }) => p.label)).toEqual(["Class 1", "Class 5 - A"]);
  });

  it("nobody is asked before school starts", async () => {
    const { s, today } = await setUp();
    at(THU, "07:30");
    expect((await today(s.token)).body.data).toMatchObject({ working: true, pending: [] });
  });

  it("a holiday or a day school does not run: nothing is pending, and it says why", async () => {
    const { s, today } = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: THU });
    at(THU, "09:00");
    expect((await today(s.token)).body.data).toMatchObject({ working: false, holiday: "Diwali", pending: [] });
    at(SAT, "09:00");
    expect((await today(s.token)).body.data).toMatchObject({ working: false, holiday: null, pending: [] });
  });

  it("is for the people who run the school (the principal too): not a teacher, a parent or a stranger", async () => {
    const { s, today } = await setUp();
    at(THU, "09:00");
    expect((await today(await addColleague(s.tenantId, "principal"))).status).toBe(200);
    expect((await today(s.tokens.meena)).status).toBe(403);
    expect((await today(s.tokens.ravi)).status).toBe(403);
    expect((await request(app).get(`${api}/students/today`)).status).toBe(401);
  });
});
