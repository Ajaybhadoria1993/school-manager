import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool, LOGIN_PASSWORD, signInAs } from "../../../test/classroom";
import { emailOf, postStaff } from "../../../test/logins";
import { addColleague } from "../../../test/schools";
import { auth } from "../../../test/timetable";
import { Teacher } from "../../staff/models/Teacher";
import { todayInIndia } from "../../students/schemas/students.schemas";

/**
 * A staff member who also teaches (Add staff > Also a teacher: a Coordinator who takes a class) has BOTH lists (2026-11-26, the user: "jo staff
 * teacher bhi hai use teacher ki permission bhi mile"): their own role's, on the whole school's pages, and the Teacher and Class teacher lists,
 * in their own classes only. They sign in as a teacher; what their role's list gives is on top.
 */

const API = "/api/v1";
const tell = (token: string, profile: string, permissions: string[]) => request(app).put(`${API}/permissions/${profile}`).set(auth(token)).send({ permissions });
const get = (path: string, token: string) => request(app).get(`${API}${path}`).set(auth(token));
const status = async (path: string, token: string) => (await get(path, token)).status;
const day = todayInIndia();

let school: Awaited<ReturnType<typeof classroomSchool>>;
/** Nisha Kapoor: Coordinator, also a teacher, the class teacher of Class 1 (Meena is 5 - A's). */
let nisha: string;

beforeEach(async () => {
  await seedSuperAdmin();
  school = await classroomSchool();
  const made = await postStaff(school.token, { name: "Nisha Kapoor", role: "coordinator", alsoTeacher: true, mobile: "9876500077", login: { username: "sun.nisha", password: LOGIN_PASSWORD } });
  expect(made.status).toBe(201);
  const teacher = await Teacher.findOne({ tenantId: school.tenantId, name: "Nisha Kapoor" }).lean();
  await request(app).put(`${API}/staff/class-teachers`).set(auth(school.token)).send({ ...school.one, teacherId: String(teacher!._id) });
  nisha = await signInAs(emailOf("sun.nisha"));
});

describe("a staff member who also teaches (2026-11-26)", () => {
  it("signs in as a teacher, and the session has their role's list with the teacher lists; their role's list is what works on the whole school", async () => {
    await tell(school.token, "coordinator", ["students.view", "attendance.view"]);
    const me = (await get("/auth/me", nisha)).body.data.user;
    expect(me.role).toBe("teacher");
    expect(me.permissions).toEqual(expect.arrayContaining(["students.view", "attendance.view", "attendance.mark", "classwork.manage", "exams.marks", "timetable.view"]));
    expect(me.schoolPermissions).toEqual(["students.view", "attendance.view"]);
    // A teacher who is only a teacher has nothing on the whole school; a receptionist has their whole list there.
    expect((await get("/auth/me", school.tokens.meena)).body.data.user.schoolPermissions).toEqual([]);
    const reception = await addColleague(school.tenantId, "receptionist");
    await tell(school.token, "receptionist", ["students.view"]);
    expect((await get("/auth/me", reception)).body.data.user).toMatchObject({ permissions: ["students.view"], schoolPermissions: ["students.view"] });
  });

  it("their role's list opens the whole school's pages; a teacher who is only a teacher stays out", async () => {
    expect(await status("/students", nisha)).toBe(403);
    expect(await status(`/attendance/students/day?date=${day}`, nisha)).toBe(403);
    expect(await status("/dashboard/school", nisha)).toBe(403);
    await tell(school.token, "coordinator", ["students.view", "attendance.view", "dashboard.view"]);
    expect(await status("/students", nisha)).toBe(200);
    expect(await status(`/attendance/students/day?date=${day}`, nisha)).toBe(200);
    expect(await status("/dashboard/school", nisha)).toBe(200);
    for (const path of ["/students", `/attendance/students/day?date=${day}`, "/dashboard/school"]) expect(await status(path, school.tokens.meena), path).toBe(403);
  });

  it("their teacher's work stays theirs: their own classes, and the teacher lists the school can take away", async () => {
    expect(await status("/classroom/my-classes", nisha)).toBe(200);
    const sheet = (unit: { classId: string; sectionId: string | null }) => `/classroom/attendance?classId=${unit.classId}${unit.sectionId ? `&sectionId=${unit.sectionId}` : ""}&date=${day}`;
    expect(await status(sheet(school.one), nisha)).toBe(200);
    // 5 - A is Meena's: not Nisha's class.
    expect(await status(sheet(school.a), nisha)).toBe(403);
    await tell(school.token, "class_teacher", []);
    expect(await status(sheet(school.one), nisha)).toBe(403);
  });

  it("students' attendance: their own class as its class teacher; every class's when their role may see them, still taken only by the class teacher", async () => {
    const sheet = `/classroom/attendance?classId=${school.a.classId}&sectionId=${school.a.sectionId}&date=${day}`;
    expect(await status(sheet, nisha)).toBe(403);
    await tell(school.token, "coordinator", ["attendance.view"]);
    expect(await status(sheet, nisha)).toBe(200);
    const marks = await request(app).put(`${API}/classroom/attendance`).set(auth(nisha)).send({ ...school.a, date: day, marks: [{ studentId: school.asha.id, status: "present" }, { studentId: school.kabir.id, status: "present" }] });
    expect(marks.status).toBe(403);
  });

  it("students' leave: their own class's as its class teacher, every class's when their role may see them", async () => {
    const apply = (token: string, child: { id: string }) => request(app).post(`${API}/parent/children/${child.id}/leaves`).set(auth(token)).send({ fromDate: day, toDate: day, reason: "Fever" });
    expect((await apply(school.tokens.sita, school.kabir)).status).toBe(201);
    expect((await apply(school.tokens.anil, school.mira)).status).toBe(201);
    const names = async () => ((await get("/classroom/leaves", nisha)).body.data.items as { student: { name: string } }[]).map((l) => l.student.name).sort();
    expect(await names()).toEqual(["Mira Shah"]);
    await tell(school.token, "coordinator", ["leaves.view"]);
    expect(await names()).toEqual(["Kabir Rao", "Mira Shah"]);
  });

  it("timetables: a draft only with their role's timetable.edit (a teacher sees what is published)", async () => {
    const grid = `/timetable/grid?classId=${school.one.classId}&sectionId=none`;
    const notPublished = await get(grid, nisha);
    expect(notPublished.status).toBe(404);
    expect(notPublished.body.code).toBe("TIMETABLE_NOT_PUBLISHED");
    await tell(school.token, "coordinator", ["timetable.edit"]);
    expect(await status(grid, nisha)).toBe(200);
    expect(await status("/timetable/overview", nisha)).toBe(200);
    expect((await get(grid, school.tokens.meena)).status).toBe(404);
  });

  it("exams: every class's with their role's exams.manage; without it, only the classes they teach", async () => {
    const classExams = `/exams/class?classId=${school.a.classId}&sectionId=${school.a.sectionId}`;
    expect(await status("/exams", nisha)).toBe(403);
    expect(await status(classExams, nisha)).toBe(403);
    await tell(school.token, "coordinator", ["exams.manage"]);
    expect(await status("/exams", nisha)).toBe(200);
    expect(await status(classExams, nisha)).toBe(200);
  });

  it("an Accountant who also teaches signs in as a teacher now, with the accountant's list on the whole school (fees, students)", async () => {
    const made = await postStaff(school.token, { name: "Sunil Rao", role: "accountant", alsoTeacher: true, mobile: "9876500078", login: { username: "sun.sunil", password: LOGIN_PASSWORD } });
    expect(made.status).toBe(201);
    const sunil = await signInAs(emailOf("sun.sunil"));
    const me = (await get("/auth/me", sunil)).body.data.user;
    expect(me.role).toBe("teacher");
    expect(me.schoolPermissions).toEqual(expect.arrayContaining(["students.view", "fees.collect"]));
    expect(await status("/classroom/my-classes", sunil)).toBe(200);
    expect(await status("/students", sunil)).toBe(200);
    expect(await status("/fees/heads", sunil)).toBe(200);
  });
});
