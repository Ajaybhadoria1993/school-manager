import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { addColleague, createSchool } from "../../../test/schools";
import { addClass, addTiming, auth, timetableSchool } from "../../../test/timetable";
import { Teacher } from "../../staff/models/Teacher";
import { Student } from "../../students/models/Student";

/**
 * The school's home page in ONE answer (2026-11-09): how many students and teachers it has, who came today, what is waiting for the head,
 * how the admissions went and what is coming up. School runs Monday to Friday from 8:30 AM to 2:20 PM; 5 Nov 2026 is a Thursday.
 */

const api = "/api/v1/dashboard/school";
const THU = "2026-11-05";
const at = (day: string, hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));
const home = (token: string) => request(app).get(api).set(auth(token));

/** Class 5 - A (Asha, Kabir) and Class 1 (Mira); Meena is the class teacher of 5 - A, Class 1 has none; three teachers. */
async function setUp() {
  const s = await classroomSchool();
  await addTiming(s.token);
  // Admitted on the 2nd and the 15th of the last two months, and the 20th of October.
  const on = (id: string, day: string) => Student.updateOne({ _id: id, tenantId: s.tenantId }, { $set: { admissionDate: new Date(`${day}T00:00:00.000Z`) } });
  await on(s.asha.id, "2026-11-02");
  await on(s.kabir.id, "2026-10-15");
  await on(s.mira.id, "2026-10-20");
  // The teachers joined when the session began: a day counts for a teacher only from the day they joined.
  await Teacher.updateMany({ tenantId: s.tenantId }, { $set: { joiningDate: new Date("2026-04-01T00:00:00.000Z") } });
  return s;
}

beforeEach(async () => {
  await seedSuperAdmin();
  at(THU, "09:00");
});
afterEach(() => vi.restoreAllMocks());

describe("students", () => {
  it("counts the students of the school, by class (teaching order) and by gender", async () => {
    const s = await setUp();
    const res = await home(s.token);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ date: THU, academicYear: { name: "2026-2027" }, classes: 2 });
    expect(res.body.data.students).toEqual({
      total: 3,
      byClass: [
        { classId: s.class1.id, name: "Class 1", enrolled: 1 },
        { classId: s.class5.id, name: "Class 5", enrolled: 2 },
      ],
      gender: { male: 0, female: 3, other: 0 },
    });
  });

  it("does not list a class that has no students", async () => {
    const s = await setUp();
    await addClass(s.token, "Class 9");
    const { students, classes } = (await home(s.token)).body.data;
    expect(students.byClass.map((c: { name: string }) => c.name)).toEqual(["Class 1", "Class 5"]);
    // The school has three classes now; only two of them have students.
    expect(classes).toBe(3);
  });

  it("a child who has left is not counted", async () => {
    const s = await setUp();
    const out = await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [s.mira.id], reason: "Moved to another city" });
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    const { students } = (await home(s.token)).body.data;
    expect(students.total).toBe(2);
    expect(students.byClass.map((c: { name: string }) => c.name)).toEqual(["Class 5"]);
  });
});

describe("teachers and staff", () => {
  it("counts the teachers who teach here, and the staff who do not teach, apart", async () => {
    const s = await setUp();
    const staff = await request(app)
      .post("/api/v1/staff/members")
      .set(auth(s.token))
      .send({ name: "Asha Rao", role: "receptionist", mobile: "9876543210", login: { username: "asha.rao_41", password: "Recep@Desk1" } });
    expect(staff.status, JSON.stringify(staff.body)).toBe(201);
    expect((await home(s.token)).body.data.people).toEqual({ teachers: 3, staff: 1 });
  });

  it("a staff member who also teaches is one of the teachers, not counted twice", async () => {
    const s = await setUp();
    const staff = await request(app)
      .post("/api/v1/staff/members")
      .set(auth(s.token))
      .send({ name: "Neha Joshi", role: "vice_principal", alsoTeacher: true, mobile: "9876543211", login: { username: "neha.joshi_42", password: "Recep@Desk1" } });
    expect(staff.status, JSON.stringify(staff.body)).toBe(201);
    expect((await home(s.token)).body.data.people).toEqual({ teachers: 4, staff: 0 });
  });

  it("a staff member the school switched off is not counted", async () => {
    const s = await setUp();
    const made = await request(app)
      .post("/api/v1/staff/members")
      .set(auth(s.token))
      .send({ name: "Asha Rao", role: "receptionist", mobile: "9876543210", login: { username: "asha.rao_41", password: "Recep@Desk1" } });
    await request(app).patch(`/api/v1/staff/members/${made.body.data.id}`).set(auth(s.token)).send({ isActive: false });
    expect((await home(s.token)).body.data.people.staff).toBe(0);
  });
});

describe("today's attendance", () => {
  const take = (s: Awaited<ReturnType<typeof setUp>>, marks: object[]) =>
    request(app).put("/api/v1/classroom/attendance").set(auth(s.tokens.meena)).send({ ...s.a, date: THU, marks });

  it("tells how many of the children who were marked came, and how many classes have taken it", async () => {
    const s = await setUp();
    await take(s, [
      { studentId: s.asha.id, status: "present" },
      { studentId: s.kabir.id, status: "absent" },
    ]);
    expect((await home(s.token)).body.data.attendance).toMatchObject({
      working: true,
      holiday: null,
      students: { present: 1, late: 0, absent: 1, leave: 0, percent: 50, classesTaken: 1, classesTotal: 2 },
    });
  });

  it("counts a late child as there, as the class pages do", async () => {
    const s = await setUp();
    await take(s, [
      { studentId: s.asha.id, status: "late" },
      { studentId: s.kabir.id, status: "present" },
    ]);
    expect((await home(s.token)).body.data.attendance.students).toMatchObject({ late: 1, present: 1, percent: 100 });
  });

  it("has no percentage until a class has taken it (not 0%)", async () => {
    const s = await setUp();
    expect((await home(s.token)).body.data.attendance.students).toEqual({ present: 0, late: 0, absent: 0, leave: 0, percent: null, classesTaken: 0, classesTotal: 2 });
  });

  it("on a holiday it says so, and nothing is asked", async () => {
    const s = await setUp();
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: THU });
    const { attendance, attention } = (await home(s.token)).body.data;
    expect(attendance).toMatchObject({ working: false, holiday: "Diwali" });
    expect(attendance.students.classesTotal).toBe(0);
    expect(attention.map((a: { kind: string }) => a.kind)).not.toContain("attendance_pending");
  });

  it("tells how many teachers are in school today", async () => {
    const s = await setUp();
    at(THU, "08:15");
    expect((await request(app).post("/api/v1/attendance/teachers/me/present").set(auth(s.tokens.meena))).status).toBe(201);
    const { teachers } = (await home(s.token)).body.data.attendance;
    expect(teachers).toEqual({ total: 3, present: 1, late: 0, absent: 0 });
  });

  it("a teacher who came after school started is late (and is in school)", async () => {
    const s = await setUp();
    at(THU, "09:00");
    await request(app).post("/api/v1/attendance/teachers/me/present").set(auth(s.tokens.meena));
    expect((await home(s.token)).body.data.attendance.teachers).toEqual({ total: 3, present: 0, late: 1, absent: 0 });
  });
});

describe("what needs the head's attention", () => {
  it("lists only what is waiting, most urgent first, each with how many", async () => {
    const s = await setUp();
    const leave = await request(app)
      .post(`/api/v1/parent/children/${s.asha.id}/leaves`)
      .set(auth(s.tokens.ravi))
      .send({ fromDate: "2026-11-06", toDate: "2026-11-06", reason: "Fever" });
    expect(leave.status, JSON.stringify(leave.body)).toBe(201);
    at(THU, "15:00");
    // Nobody has taken attendance, no teacher came; Class 1 has no class teacher.
    expect((await home(s.token)).body.data.attention).toEqual([
      { kind: "teachers_absent", count: 3 },
      { kind: "attendance_pending", count: 2 },
      { kind: "leave_pending", count: 1 },
      { kind: "no_class_teacher", count: 1 },
    ]);
  });

  it("a leave that was answered is no longer waiting", async () => {
    const s = await setUp();
    const leave = await request(app)
      .post(`/api/v1/parent/children/${s.asha.id}/leaves`)
      .set(auth(s.tokens.ravi))
      .send({ fromDate: "2026-11-06", toDate: "2026-11-06", reason: "Fever" });
    await request(app).post(`/api/v1/classroom/leaves/${leave.body.data.id}/decide`).set(auth(s.token)).send({ status: "approved" });
    expect((await home(s.token)).body.data.attention.map((a: { kind: string }) => a.kind)).not.toContain("leave_pending");
  });

  it("a class that has no children is not asked for a class teacher", async () => {
    const s = await setUp();
    await addClass(s.token, "Class 9");
    const noTeacher = (await home(s.token)).body.data.attention.find((a: { kind: string }) => a.kind === "no_class_teacher");
    expect(noTeacher).toEqual({ kind: "no_class_teacher", count: 1 });
  });

  it("names the sections that are full", async () => {
    const s = await setUp();
    const section = (await request(app).post(`/api/v1/academics/classes/${s.class5.id}/sections`).set(auth(s.token)).send({ name: "B", capacity: 1 })).body.data;
    const admit = await request(app)
      .post("/api/v1/students")
      .set(auth(s.token))
      .send({
        firstName: "Rohan",
        lastName: "Das",
        gender: "Male",
        dateOfBirth: "2018-05-14",
        address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
        previousSchool: { name: "Little Flower School" },
        classId: s.class5.id,
        sectionId: section.id,
        guardians: [{ name: "Ajay Das", relation: "Father", isPrimary: true, mobile: "9800000099" }],
      });
    expect(admit.status, JSON.stringify(admit.body)).toBe(201);
    expect((await home(s.token)).body.data.attention.find((a: { kind: string }) => a.kind === "full_sections")).toEqual({ kind: "full_sections", count: 1 });
  });

  it("a school with nothing waiting has an empty list", async () => {
    const s = await timetableSchool();
    expect((await home(s.token)).body.data.attention).toEqual([]);
  });
});

describe("admissions", () => {
  it("counts the students admitted in each of the last six months, oldest first", async () => {
    const s = await setUp();
    const { admissions } = (await home(s.token)).body.data;
    expect(admissions).toEqual([
      { month: "2026-06", count: 0 },
      { month: "2026-07", count: 0 },
      { month: "2026-08", count: 0 },
      { month: "2026-09", count: 0 },
      { month: "2026-10", count: 2 },
      { month: "2026-11", count: 1 },
    ]);
  });
});

describe("coming up", () => {
  it("lists the next days, events and exams that are not over, soonest first, and nothing past or far away", async () => {
    const s = await setUp();
    const make = (body: object) => request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send(body);
    await make({ title: "Old function", kind: "event", startDate: "2026-11-01" });
    await make({ title: "Sports Day", kind: "event", startDate: "2026-11-12" });
    await make({ title: "Children's Day", kind: "holiday", startDate: "2026-11-14" });
    await make({ title: "Annual Day", kind: "event", startDate: "2027-01-10" });
    // Running today: still "coming up" until it is over.
    await make({ title: "Book fair", kind: "event", startDate: "2026-11-04", endDate: "2026-11-06" });
    const exam = await request(app).post("/api/v1/exams").set(auth(s.token)).send({ name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-11-20", endDate: "2026-11-27", schoolStart: "08:00", schoolEnd: "12:30" });
    expect(exam.status, JSON.stringify(exam.body)).toBe(201);

    const { upcoming } = (await home(s.token)).body.data;
    expect(upcoming).toEqual([
      { title: "Book fair", kind: "event", startDate: "2026-11-04", endDate: "2026-11-06" },
      { title: "Sports Day", kind: "event", startDate: "2026-11-12", endDate: "2026-11-12" },
      { title: "Children's Day", kind: "holiday", startDate: "2026-11-14", endDate: "2026-11-14" },
      { title: "Half-Yearly Exam", kind: "exam", startDate: "2026-11-20", endDate: "2026-11-27" },
    ]);
  });

  it("shows at most five", async () => {
    const s = await setUp();
    for (let day = 10; day < 18; day++) {
      await request(app).post("/api/v1/classroom/calendar").set(auth(s.token)).send({ title: `Event ${day}`, kind: "event", startDate: `2026-11-${day}` });
    }
    expect((await home(s.token)).body.data.upcoming).toHaveLength(5);
  });
});

describe("a new school", () => {
  it("answers with zeros, not an error, before any class or student is added", async () => {
    const s = await timetableSchool();
    const res = await home(s.token);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.students).toEqual({ total: 0, byClass: [], gender: { male: 0, female: 0, other: 0 } });
    expect(res.body.data.people).toEqual({ teachers: 0, staff: 0 });
    expect(res.body.data.upcoming).toEqual([]);
    expect(res.body.data.admissions).toHaveLength(6);
    expect(res.body.data.attendance.students.percent).toBeNull();
  });

  it("answers even when the school has no academic year yet", async () => {
    const s = await createSchool("Moonrise Public School");
    const res = await home(s.token);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.academicYear).toBeNull();
    expect(res.body.data.students.total).toBe(0);
  });
});

describe("who may read it", () => {
  it("the school admin, the principal and the accountant: not a teacher, a parent or a stranger", async () => {
    const s = await setUp();
    expect((await home(s.token)).status).toBe(200);
    expect((await home(await addColleague(s.tenantId, "principal"))).status).toBe(200);
    expect((await home(await addColleague(s.tenantId, "accountant"))).status).toBe(200);
    expect((await home(s.tokens.meena)).status).toBe(403);
    expect((await home(s.tokens.ravi)).status).toBe(403);
    expect((await request(app).get(api)).status).toBe(401);
  });
});
