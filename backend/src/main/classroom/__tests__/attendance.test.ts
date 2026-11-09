import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { Notification } from "../../notifications/models/Notification";
import { NotificationService } from "../../notifications/services/notification.service";
import { todayInIndia } from "../../students/schemas/students.schemas";

/**
 * Attendance (docs/parent-teacher-flow.md, phase 3): taken once a day for a section (or a class without sections) by its class teacher or
 * the school: everyone is Present to start with, an approved leave is already Leave; one Save. Not on a holiday, not in the future. The
 * parent sees their child's days and percentage.
 */

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = todayInIndia();
const yesterday = shift(today, -1);
const sheet = (token: string, unit: { classId: string; sectionId: string | null }, date: string) =>
  request(app).get(`/api/v1/classroom/attendance?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}&date=${date}`).set(auth(token));
const save = (token: string, unit: { classId: string; sectionId: string | null }, date: string, marks: object[]) =>
  request(app).put("/api/v1/classroom/attendance").set(auth(token)).send({ ...unit, date, marks });

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("taking attendance", () => {
  it("the class teacher opens the day: every child Present to start with, a child on approved leave already Leave", async () => {
    const s = await classroomSchool();
    const leave = (await request(app).post(`/api/v1/parent/children/${s.kabir.id}/leaves`).set(auth(s.tokens.sita)).send({ fromDate: today, reason: "Fever" })).body.data;
    await request(app).post(`/api/v1/classroom/leaves/${leave.id}/decide`).set(auth(s.tokens.meena)).send({ status: "approved" });

    const res = await sheet(s.tokens.meena, s.a, today);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ label: "Class 5 - A", date: today, holiday: null, saved: false });
    expect(res.body.data.students.map((st: { name: string; status: string }) => [st.name, st.status])).toEqual([
      ["Asha Verma", "present"],
      ["Kabir Rao", "leave"],
    ]);
  });

  it("one Save keeps the day; opening it again shows what was saved, with who took it; saving again changes it", async () => {
    const s = await classroomSchool();
    const saved = await save(s.tokens.meena, s.a, today, [
      { studentId: s.asha.id, status: "present" },
      { studentId: s.kabir.id, status: "absent" },
    ]);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ saved: true, counts: { present: 1, absent: 1, late: 0, leave: 0 }, markedBy: { name: "Meena Singh" } });
    expect((await sheet(s.token, s.a, today)).body.data.students.map((st: { status: string }) => st.status)).toEqual(["present", "absent"]);
    const again = await save(s.token, s.a, today, [
      { studentId: s.asha.id, status: "late" },
      { studentId: s.kabir.id, status: "present" },
    ]);
    expect(again.body.data.counts).toEqual({ present: 1, absent: 0, late: 1, leave: 0 });
  });

  it("is not taken on a holiday, in the future, or for a child who is not in that class", async () => {
    const s = await classroomSchool();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: yesterday });
    const holiday = await sheet(s.tokens.meena, s.a, yesterday);
    expect(holiday.body.data.holiday).toEqual({ title: "Diwali" });
    const onHoliday = await save(s.tokens.meena, s.a, yesterday, [{ studentId: s.asha.id, status: "present" }]);
    expect(onHoliday.status).toBe(409);
    expect(onHoliday.body.code).toBe("HOLIDAY");
    const future = await save(s.tokens.meena, s.a, shift(today, 1), [{ studentId: s.asha.id, status: "present" }]);
    expect(future.status).toBe(400);
    const stranger = await save(s.tokens.meena, s.a, today, [{ studentId: s.mira.id, status: "present" }]);
    expect(stranger.status).toBe(400);
    expect(stranger.body.code).toBe("NOT_IN_CLASS");
  });

  it("is taken only by the class teacher of that class or the people who run the school", async () => {
    const s = await classroomSchool();
    for (const token of [s.tokens.dev, s.tokens.kiran]) {
      const res = await save(token, s.a, today, [{ studentId: s.asha.id, status: "present" }]);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_CLASS_TEACHER");
      expect((await sheet(token, s.a, today)).status).toBe(403);
    }
    expect((await save(s.tokens.ravi, s.a, today, [])).status).toBe(403);
  });
});

describe("a parent sees the attendance", () => {
  it("their child's days of a month and the percentage of the year (late counts as present); another family's child is not found", async () => {
    const s = await classroomSchool();
    await save(s.tokens.meena, s.a, yesterday, [
      { studentId: s.asha.id, status: "absent" },
      { studentId: s.kabir.id, status: "present" },
    ]);
    await save(s.tokens.meena, s.a, today, [
      { studentId: s.asha.id, status: "late" },
      { studentId: s.kabir.id, status: "present" },
    ]);
    const res = await request(app).get(`/api/v1/parent/children/${s.asha.id}/attendance?month=${today.slice(0, 7)}`).set(auth(s.tokens.ravi));
    expect(res.status).toBe(200);
    expect(res.body.data.year).toEqual({ present: 0, absent: 1, late: 1, leave: 0, days: 2, percent: 50 });
    const days = res.body.data.days.map((d: { date: string; status: string }) => [d.date, d.status]);
    expect(days).toContainEqual([today, "late"]);
    if (yesterday.slice(0, 7) === today.slice(0, 7)) expect(days).toContainEqual([yesterday, "absent"]);
    expect((await request(app).get(`/api/v1/parent/children/${s.kabir.id}/attendance`).set(auth(s.tokens.ravi))).status).toBe(404);
  });
});

describe("a teacher's own classes", () => {
  it("are the ones they are the class teacher of and the ones they teach a subject in, with those subjects", async () => {
    const s = await classroomSchool();
    const mine = (token: string) => request(app).get("/api/v1/classroom/my-classes").set(auth(token));
    expect((await mine(s.tokens.meena)).body.data.items).toEqual([
      { classId: s.a.classId, sectionId: s.a.sectionId, label: "Class 5 - A", isClassTeacher: true, subjects: [{ id: s.maths, name: "Mathematics" }] },
    ]);
    expect((await mine(s.tokens.dev)).body.data.items).toEqual([
      { classId: s.a.classId, sectionId: s.a.sectionId, label: "Class 5 - A", isClassTeacher: false, subjects: [{ id: s.english, name: "English" }] },
    ]);
    expect((await mine(s.tokens.kiran)).body.data.items).toEqual([]);
    expect((await mine(s.tokens.ravi)).status).toBe(403);
  });
});

describe("the reason of an absence (2026-11-06)", () => {
  it("a mark can carry a reason; it is kept, comes back on the sheet and the child's month, and a present child keeps none", async () => {
    const s = await classroomSchool();
    const saved = await save(s.tokens.meena, s.a, today, [
      { studentId: s.asha.id, status: "present", reason: "ignored for a child who came" },
      { studentId: s.kabir.id, status: "absent", reason: "  Fever, doctor's advice  " },
    ]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const byName = Object.fromEntries(saved.body.data.students.map((st: { name: string }) => [st.name, st]));
    expect(byName["Kabir Rao"]).toMatchObject({ status: "absent", reason: "Fever, doctor's advice" });
    expect(byName["Asha Verma"]).toMatchObject({ status: "present", reason: null });
    // Opening the day again (as the school) shows the same.
    expect((await sheet(s.token, s.a, today)).body.data.students.find((st: { name: string }) => st.name === "Kabir Rao").reason).toBe("Fever, doctor's advice");
    // The child's parent sees the reason on that day.
    const month = await request(app).get(`/api/v1/parent/children/${s.kabir.id}/attendance`).set(auth(s.tokens.sita));
    expect(month.body.data.days).toEqual([{ date: today, status: "absent", reason: "Fever, doctor's advice" }]);
  });

  it("late and leave may give a reason too; a reason left empty is none; saving the day again without it clears it", async () => {
    const s = await classroomSchool();
    await save(s.tokens.meena, s.a, today, [{ studentId: s.asha.id, status: "late", reason: "Bus was late" }, { studentId: s.kabir.id, status: "leave", reason: "" }]);
    let now = (await sheet(s.token, s.a, today)).body.data.students;
    expect(now.map((st: { reason: string | null }) => st.reason)).toEqual(["Bus was late", null]);
    await save(s.tokens.meena, s.a, today, [{ studentId: s.asha.id, status: "late" }, { studentId: s.kabir.id, status: "leave" }]);
    now = (await sheet(s.token, s.a, today)).body.data.students;
    expect(now.map((st: { reason: string | null }) => st.reason)).toEqual([null, null]);
  });

  it("a reason of more than 200 letters is refused; a reason that is not text is refused", async () => {
    const s = await classroomSchool();
    const long = await save(s.tokens.meena, s.a, today, [{ studentId: s.asha.id, status: "absent", reason: "x".repeat(201) }]);
    expect(long.status).toBe(400);
    expect((long.body.details as { message: string }[]).map((d) => d.message)).toContain("The reason is up to 200 letters");
    expect((await save(s.tokens.meena, s.a, today, [{ studentId: s.asha.id, status: "absent", reason: 12 }])).status).toBe(400);
  });

  it("the parent is told the reason with the absence", async () => {
    const s = await classroomSchool();
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    await save(s.tokens.meena, s.a, today, [{ studentId: s.asha.id, status: "absent", reason: "Family function" }, { studentId: s.kabir.id, status: "present" }]);
    await NotificationService.idle();
    const items = (await request(app).get("/api/v1/notifications").set(auth(s.tokens.ravi))).body.data.items as { kind: string; title: string; body: string }[];
    expect(items.find((i) => i.kind === "attendance.saved")).toMatchObject({ title: "Asha Verma was absent" });
    expect(items.find((i) => i.kind === "attendance.saved")!.body).toContain("Family function");
  });
});
