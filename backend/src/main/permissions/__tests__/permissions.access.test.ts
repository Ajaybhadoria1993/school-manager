import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addColleague, PASSWORD } from "../../../test/schools";
import { permissionsFor } from "../constants";
import { auth } from "../../../test/timetable";
import { StaffMember } from "../../staff/models/StaffMember";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { User } from "../../users/models/User";
import { hashPassword } from "../../../utils/authUtils";

/**
 * What a person can really do follows the school's Permissions: the school admin ticks, and the person's pages and requests follow. These tests
 * go through real routes: a refused call is 403, an allowed one is anything else (the call may still fail on its own rules: a bad body, an
 * id that does not exist).
 */

const API = "/api/v1";
const ANY_ID = "6af2b7c87fdf3025aeb6d521";
const tell = (token: string, profile: string, permissions: string[]) => request(app).put(`${API}/permissions/${profile}`).set(auth(token)).send({ permissions });
const call = (method: "get" | "post" | "put" | "patch" | "delete", path: string, token: string, body?: object) => {
  const r = request(app)[method](`${API}${path}`).set(auth(token));
  return body ? r.send(body) : r;
};
const status = async (method: "get" | "post" | "put" | "patch" | "delete", path: string, token: string, body: object = {}) => (await call(method, path, token, method === "get" ? undefined : body)).status;

let school: Awaited<ReturnType<typeof classroomSchool>>;
let reception: string;

beforeEach(async () => {
  await seedSuperAdmin();
  school = await classroomSchool();
  reception = await addColleague(school.tenantId, "receptionist");
});

describe("what a login is told it may do", () => {
  it("the session says it: everything for the admin, the kind's list for the others, and a change is there at the next request", async () => {
    const admin = (await call("get", "/auth/me", school.token)).body.data.user;
    expect(admin.permissions).toContain("students.add");
    expect(admin.permissions).toContain("exams.marks");
    expect((await call("get", "/auth/me", reception)).body.data.user.permissions).toEqual(["calendar.view"]);
    await tell(school.token, "receptionist", ["students.add"]);
    expect((await call("get", "/auth/me", reception)).body.data.user.permissions).toEqual(["students.view", "students.add"]);
    expect((await call("get", "/auth/me", school.tokens.ravi)).body.data.user.permissions).toContain("child.attendance");
  });
});

describe("students", () => {
  it("a receptionist sees no students until the school allows it, then sees them, and the details only with the same permission", async () => {
    expect(await status("get", "/students", reception)).toBe(403);
    expect(await status("get", `/students/${school.asha.id}`, reception)).toBe(403);
    await tell(school.token, "receptionist", ["students.view"]);
    expect(await status("get", "/students", reception)).toBe(200);
    expect(await status("get", `/students/${school.asha.id}`, reception)).toBe(200);
    expect(await status("get", "/students/capacity", reception)).toBe(200);
  });

  it("adding students: Add student and Bulk upload need students.add (and the classes to choose from come with it)", async () => {
    expect(await status("post", "/students", reception)).toBe(403);
    expect(await status("get", "/academics/structure", reception)).toBe(403);
    await tell(school.token, "receptionist", ["students.add"]);
    expect(await status("get", "/academics/structure", reception)).toBe(200);
    expect(await status("get", "/students/capacity", reception)).toBe(200);
    expect(await status("get", "/students/settings", reception)).toBe(200);
    expect(await status("post", "/students", reception)).toBe(400);
    expect(await status("post", "/students/import/match", reception, { rows: [] })).toBe(400);
    expect(await status("get", "/students/import/template", reception)).toBe(200);
    // Changing a student, and leaving, are other permissions.
    expect(await status("patch", `/students/${school.asha.id}`, reception, { firstName: "Asha" })).toBe(403);
    expect(await status("post", "/students/deactivate", reception, { ids: [school.asha.id] })).toBe(403);
    expect(await status("get", "/students/export", reception)).toBe(403);
  });

  it("each of changing, leaving and exporting is its own permission", async () => {
    await tell(school.token, "receptionist", ["students.edit"]);
    expect(await status("patch", `/students/${school.asha.id}`, reception, { firstName: "Asha" })).not.toBe(403);
    expect(await status("patch", `/students/${school.asha.id}/enrolment`, reception, { rollNumber: 5 })).not.toBe(403);
    expect(await status("post", "/students/deactivate", reception, { ids: [school.asha.id] })).toBe(403);
    await tell(school.token, "receptionist", ["students.status"]);
    expect(await status("post", "/students/deactivate", reception, {})).toBe(400);
    expect(await status("get", "/students/inactive", reception)).toBe(200);
    expect(await status("patch", `/students/${school.asha.id}`, reception, { firstName: "Asha" })).toBe(403);
    await tell(school.token, "receptionist", ["students.export"]);
    expect(await status("get", "/students/export/preview", reception)).toBe(200);
  });

  it("how the school keeps its records and the promotion list are their own permissions, not part of adding or changing students", async () => {
    await tell(school.token, "receptionist", ["students.view", "students.add", "students.edit", "students.status", "students.export"]);
    expect(await status("put", "/students/settings", reception, {})).toBe(403);
    expect(await status("get", "/students/promotions", reception)).toBe(403);
    expect(await status("post", "/students/promotions", reception, {})).toBe(403);
    await tell(school.token, "receptionist", ["students.settings"]);
    expect(await status("put", "/students/settings", reception, {})).not.toBe(403);
    // The Export page of the layout shows a preview of the file.
    expect(await status("get", "/students/export/preview", reception)).toBe(200);
    expect(await status("get", "/students/promotions", reception)).toBe(403);
    await tell(school.token, "receptionist", ["promotion.manage"]);
    expect(await status("get", "/students/promotions", reception)).not.toBe(403);
    expect(await status("post", "/students/promotions", reception, {})).not.toBe(403);
    // Approving the list is the school admin's alone.
    expect(await status("post", `/students/promotions/${ANY_ID}/approve`, reception, {})).toBe(403);
    expect(await status("post", `/students/promotions/${ANY_ID}/reject`, reception, {})).toBe(403);
  });

  it("the accountant keeps what they had (students, the dashboard, the calendar) until the school says otherwise", async () => {
    const accountant = await addColleague(school.tenantId, "accountant");
    expect(await status("get", "/students", accountant)).toBe(200);
    expect(await status("get", "/dashboard/school", accountant)).toBe(200);
    expect(await status("post", "/students", accountant)).toBe(403);
    await tell(school.token, "accountant", ["calendar.view"]);
    expect(await status("get", "/students", accountant)).toBe(403);
    expect(await status("get", "/dashboard/school", accountant)).toBe(403);
  });
});

describe("attendance", () => {
  const day = todayInIndia();
  const sheet = (token: string) => call("get", `/classroom/attendance?classId=${school.a.classId}&sectionId=${school.a.sectionId}&date=${day}`, token);
  const marks = (token: string) => call("put", "/classroom/attendance", token, { ...school.a, date: day, marks: [{ studentId: school.asha.id, status: "present" }, { studentId: school.kabir.id, status: "absent" }] });

  it("seeing the attendance of a class and taking it are two permissions; the receptionist works on any class (they have none of their own)", async () => {
    expect((await sheet(reception)).status).toBe(403);
    await tell(school.token, "receptionist", ["attendance.view"]);
    expect((await sheet(reception)).status).toBe(200);
    expect((await marks(reception)).status).toBe(403);
    await tell(school.token, "receptionist", ["attendance.mark"]);
    const saved = await marks(reception);
    expect(saved.status).toBe(200);
    expect((await sheet(reception)).body.data.students.map((s: { status: string }) => s.status)).toContain("absent");
  });

  it("the school-wide sheets are for attendance.view, and teachers' attendance for attendance.teachers", async () => {
    expect(await status("get", "/attendance/students", reception)).toBe(403);
    await tell(school.token, "receptionist", ["attendance.view"]);
    expect(await status("get", "/attendance/students", reception)).not.toBe(403);
    expect(await status("get", "/attendance/students/today", reception)).toBe(200);
    expect(await status("get", "/attendance/teachers", reception)).toBe(403);
    await tell(school.token, "receptionist", ["attendance.teachers"]);
    expect(await status("get", "/attendance/teachers", reception)).not.toBe(403);
    expect(await status("put", `/attendance/teachers/${ANY_ID}/day`, reception, {})).not.toBe(403);
  });

  it("a teacher keeps their own classes, and loses the page when the school takes the permission away", async () => {
    expect((await sheet(school.tokens.meena)).status).toBe(200);
    // Kiran teaches nothing here: not their class, whatever the permission.
    expect((await sheet(school.tokens.kiran)).status).toBe(403);
    await tell(school.token, "teacher", ["calendar.view"]);
    expect((await sheet(school.tokens.meena)).status).toBe(403);
    expect((await marks(school.tokens.meena)).status).toBe(403);
  });
});

describe("leave requests", () => {
  it("seeing needs leaves.view, answering leaves.decide", async () => {
    expect(await status("get", "/classroom/leaves", reception)).toBe(403);
    await tell(school.token, "receptionist", ["leaves.view"]);
    expect(await status("get", "/classroom/leaves", reception)).toBe(200);
    expect(await status("post", `/classroom/leaves/${ANY_ID}/decide`, reception, { status: "approved" })).toBe(403);
    await tell(school.token, "receptionist", ["leaves.decide"]);
    expect(await status("post", `/classroom/leaves/${ANY_ID}/decide`, reception, { status: "approved" })).not.toBe(403);
  });
});

describe("the dashboard", () => {
  it("is for dashboard.view", async () => {
    expect(await status("get", "/dashboard/school", reception)).toBe(403);
    await tell(school.token, "receptionist", ["dashboard.view"]);
    expect(await status("get", "/dashboard/school", reception)).toBe(200);
    expect(await status("get", "/dashboard/school/trend?period=week", reception)).toBe(200);
  });

  it("a teacher is not let into the whole school's dashboard or attendance sheets by a permission: theirs is their own classes", async () => {
    expect(await status("get", "/dashboard/school", school.tokens.meena)).toBe(403);
    expect(await status("get", "/attendance/students", school.tokens.meena)).toBe(403);
  });
});

describe("a teacher's classes", () => {
  const unit = () => `classId=${school.a.classId}&sectionId=${school.a.sectionId}`;

  it("the diary and the tests: classwork.view reads, classwork.manage writes; the school can take them away", async () => {
    expect(await status("get", `/classroom/tests?${unit()}`, school.tokens.meena)).toBe(200);
    expect(await status("post", "/classroom/tests", school.tokens.meena, {})).toBe(400);
    await tell(school.token, "teacher", ["classwork.view"]);
    expect(await status("get", `/classroom/tests?${unit()}`, school.tokens.meena)).toBe(200);
    expect(await status("post", "/classroom/tests", school.tokens.meena, {})).toBe(403);
    await tell(school.token, "teacher", []);
    expect(await status("get", `/classroom/tests?${unit()}`, school.tokens.meena)).toBe(403);
    expect(await status("get", `/classroom/diary?${unit()}&date=${todayInIndia()}`, school.tokens.meena)).toBe(403);
  });

  it("exams: exams.view shows their classes' exams, exams.marks lets them enter marks; the list of every exam is not theirs", async () => {
    expect(await status("get", `/exams/class?${unit()}`, school.tokens.meena)).toBe(200);
    expect(await status("get", "/exams", school.tokens.meena)).toBe(403);
    expect(await status("put", `/exams/papers/${ANY_ID}/marks`, school.tokens.meena, {})).not.toBe(403);
    await tell(school.token, "teacher", ["exams.view"]);
    expect(await status("get", `/exams/class?${unit()}`, school.tokens.meena)).toBe(200);
    expect(await status("put", `/exams/papers/${ANY_ID}/marks`, school.tokens.meena, {})).toBe(403);
    await tell(school.token, "teacher", []);
    expect(await status("get", `/exams/class?${unit()}`, school.tokens.meena)).toBe(403);
  });

  it("timetables: seen with timetable.view; making them stays with the people who run the school", async () => {
    expect(await status("get", "/timetable/schedules", school.tokens.meena)).toBe(200);
    expect(await status("put", "/timetable/grid", school.tokens.meena, {})).toBe(403);
    await tell(school.token, "teacher", ["calendar.view"]);
    expect(await status("get", "/timetable/schedules", school.tokens.meena)).toBe(403);
  });

  it("the layout of classes is readable by anyone whose work is about a class, and by nobody else", async () => {
    expect(await status("get", "/academics/structure", school.tokens.meena)).toBe(200);
    await tell(school.token, "teacher", ["calendar.view"]);
    expect(await status("get", "/academics/structure", school.tokens.meena)).toBe(403);
  });
});

describe("what stays with the people who run the school, whatever a kind is given", () => {
  it("whatever a kind of staff is given, four things stay with the school admin: the permissions, switching a year on, approving a promotion, a teacher's other mediums", async () => {
    await tell(school.token, "receptionist", [...permissionsFor("staff")]);
    for (const [method, path] of [
      ["get", "/permissions"],
      ["put", "/permissions/librarian"],
      ["post", `/academics/academic-years/${ANY_ID}/activate`],
      ["post", `/students/promotions/${ANY_ID}/approve`],
      ["post", `/students/promotions/${ANY_ID}/reject`],
      ["get", `/staff/teachers/${ANY_ID}/mediums`],
      ["post", `/staff/teachers/${ANY_ID}/mediums`],
    ] as const) {
      expect(await status(method, path, reception), `${method} ${path}`).toBe(403);
    }
  });

  it("a parent's login: making one goes with adding students; a new password or username goes with changing students", async () => {
    await tell(school.token, "receptionist", ["students.add"]);
    expect(await status("post", `/students/guardians/${ANY_ID}/login`, reception, {})).not.toBe(403);
    expect(await status("post", `/students/guardians/${ANY_ID}/reset-password`, reception, {})).toBe(403);
    await tell(school.token, "receptionist", ["students.edit"]);
    expect(await status("post", `/students/guardians/${ANY_ID}/reset-password`, reception, {})).not.toBe(403);
    expect(await status("patch", `/students/guardians/${ANY_ID}/login`, reception, {})).not.toBe(403);
  });

  it("the calendar: seen by default, changed only with calendar.manage; a kind with no calendar permission does not see it", async () => {
    expect(await status("get", "/classroom/calendar?from=2026-11-01&to=2026-11-30", reception)).toBe(200);
    expect(await status("post", "/classroom/calendar", reception, {})).toBe(403);
    await tell(school.token, "receptionist", ["calendar.manage"]);
    expect(await status("post", "/classroom/calendar", reception, {})).toBe(400);
    await tell(school.token, "receptionist", []);
    expect(await status("get", "/classroom/calendar?from=2026-11-01&to=2026-11-30", reception)).toBe(403);
  });

  it("the class's name for a page of attendance comes with attendance.view, not only with students.view", async () => {
    expect(await status("get", `/students/class-overview?classId=${school.a.classId}`, reception)).toBe(403);
    await tell(school.token, "receptionist", ["attendance.view"]);
    expect(await status("get", `/students/class-overview?classId=${school.a.classId}`, reception)).toBe(200);
  });
});

describe("the school's own work, given key by key (Teachers, Staff, the set-up, timetables, exams)", () => {
  const as = (permissions: string[]) => tell(school.token, "receptionist", permissions);

  it("teachers: seeing, adding, changing, exporting and the extra fields are five permissions", async () => {
    expect(await status("get", "/staff/teachers", reception)).toBe(403);
    await as(["teachers.view"]);
    expect(await status("get", "/staff/teachers", reception)).toBe(200);
    expect(await status("get", "/staff/teachers/summary", reception)).toBe(200);
    expect(await status("get", `/staff/teachers/${ANY_ID}`, reception)).not.toBe(403);
    expect(await status("get", "/staff/teachers/settings", reception)).toBe(200);
    expect(await status("post", "/staff/teachers", reception, {})).toBe(403);
    expect(await status("patch", `/staff/teachers/${ANY_ID}`, reception, {})).toBe(403);
    expect(await status("get", "/staff/teachers/export", reception)).toBe(403);
    expect(await status("put", "/staff/teachers/settings", reception, {})).toBe(403);

    await as(["teachers.add"]);
    expect(await status("post", "/staff/teachers", reception, {})).toBe(400);
    // Add teacher makes the subjects it is given.
    expect(await status("post", "/subjects", reception, {})).toBe(400);
    expect(await status("get", "/staff/teachers/import/template", reception)).toBe(200);
    expect(await status("get", "/staff/usernames/check?username=free.name_01", reception)).toBe(200);
    expect(await status("get", "/staff/teachers", reception)).toBe(200);
    expect(await status("patch", `/staff/teachers/${ANY_ID}`, reception, {})).toBe(403);

    await as(["teachers.edit"]);
    expect(await status("patch", `/staff/teachers/${ANY_ID}`, reception, {})).not.toBe(403);
    expect(await status("post", `/staff/teachers/${ANY_ID}/reset-password`, reception, {})).not.toBe(403);
    expect(await status("put", "/staff/class-teachers", reception, {})).toBe(400);
    expect(await status("put", "/subjects/allotments", reception, {})).toBe(400);
    expect(await status("post", "/staff/teachers", reception, {})).toBe(403);

    await as(["teachers.export"]);
    expect(await status("get", "/staff/teachers/export", reception)).toBe(200);
    await as(["teachers.settings"]);
    expect(await status("put", "/staff/teachers/settings", reception, {})).not.toBe(403);
  });

  it("staff: seeing, adding and changing staff members are three permissions", async () => {
    expect(await status("get", "/staff/members", reception)).toBe(403);
    await as(["staff.view"]);
    expect(await status("get", "/staff/members", reception)).toBe(200);
    expect(await status("post", "/staff/members", reception, {})).toBe(403);
    expect(await status("delete", `/staff/members/${ANY_ID}`, reception)).toBe(403);
    await as(["staff.add"]);
    expect(await status("post", "/staff/members", reception, {})).toBe(400);
    expect(await status("get", "/staff/usernames/check?username=free.name_01", reception)).toBe(200);
    expect(await status("patch", `/staff/members/${ANY_ID}`, reception, {})).toBe(403);
    await as(["staff.edit"]);
    expect(await status("patch", `/staff/members/${ANY_ID}`, reception, {})).not.toBe(403);
    expect(await status("post", `/staff/members/${ANY_ID}/reset-password`, reception, {})).not.toBe(403);
    expect(await status("delete", `/staff/members/${ANY_ID}`, reception)).not.toBe(403);
  });

  it("classes: seeing them, then making and changing them (the classes, sections and departments)", async () => {
    expect(await status("get", "/academics/classes", reception)).toBe(403);
    await as(["classes.view"]);
    expect(await status("get", "/academics/structure", reception)).toBe(200);
    expect(await status("get", `/students/class-overview?classId=${school.a.classId}`, reception)).toBe(200);
    expect(await status("post", "/academics/classes", reception, {})).toBe(403);
    expect(await status("post", `/academics/classes/${ANY_ID}/sections`, reception, {})).toBe(403);
    // The class page shows its teachers.
    expect(await status("get", "/staff/teachers", reception)).toBe(200);
    expect(await status("put", "/staff/class-teachers", reception, {})).toBe(403);
    await as(["classes.manage"]);
    expect(await status("put", "/staff/class-teachers", reception, {})).toBe(400);
    expect(await status("get", "/academics/structure", reception)).toBe(200);
    expect(await status("post", "/academics/classes", reception, {})).toBe(400);
    expect(await status("post", `/academics/classes/${ANY_ID}/sections`, reception, {})).not.toBe(403);
    expect(await status("post", "/academics/departments", reception, {})).toBe(400);
    expect(await status("post", "/academics/quick-setup", reception, {})).toBe(400);
    expect(await status("delete", `/academics/classes/${ANY_ID}`, reception)).not.toBe(403);
  });

  it("academic years: setting up the next one is a permission; switching it on is not", async () => {
    expect(await status("post", "/academics/academic-years", reception, {})).toBe(403);
    await as(["years.manage"]);
    expect(await status("get", "/academics/academic-years", reception)).toBe(200);
    expect(await status("post", "/academics/academic-years", reception, {})).toBe(400);
    expect(await status("post", `/academics/academic-years/${ANY_ID}/activate`, reception, {})).toBe(403);
  });

  it("timetables: one permission makes and changes them (the school's timings and the classes' weeks), and reads come with it", async () => {
    expect(await status("get", "/timetable/overview", reception)).toBe(403);
    await as(["timetable.edit"]);
    expect(await status("get", "/timetable/overview", reception)).toBe(200);
    expect(await status("get", "/timetable/schedules", reception)).toBe(200);
    expect(await status("put", "/timetable/grid", reception, {})).toBe(400);
    expect(await status("put", "/timetable/school-day", reception, {})).toBe(400);
    expect(await status("post", "/subjects", reception, {})).toBe(400);
    expect(await status("get", "/subjects", reception)).toBe(200);
  });

  it("exams: one permission makes and changes the school's exams; a teacher still has only their own classes' exams", async () => {
    expect(await status("get", "/exams", reception)).toBe(403);
    await as(["exams.manage"]);
    expect(await status("get", "/exams", reception)).toBe(200);
    expect(await status("post", "/exams", reception, {})).toBe(400);
    expect(await status("put", `/exams/papers/${ANY_ID}/marks`, reception, {})).not.toBe(403);
    expect(await status("get", "/exams", school.tokens.meena)).toBe(403);
    expect(await status("post", "/exams", school.tokens.meena, {})).toBe(403);
  });

  it("a teacher is never given the school's pages by these keys: they are for the staff only", async () => {
    expect((await tell(school.token, "teacher", ["teachers.add"])).status).toBe(400);
    expect((await tell(school.token, "teacher", ["classes.manage"])).status).toBe(400);
    expect((await tell(school.token, "parent", ["exams.manage"])).status).toBe(400);
  });
});

describe("parents", () => {
  const child = () => `/parent/children/${school.asha.id}`;

  it("a parent sees what the school allows about their child, and the list of their children always", async () => {
    expect(await status("get", child() + "/attendance", school.tokens.ravi)).toBe(200);
    await tell(school.token, "parent", ["calendar.view"]);
    for (const part of ["/attendance", "/timetable", "/exams", "/diary?date=" + todayInIndia(), "/tests", "/leaves"]) {
      expect(await status("get", child() + part, school.tokens.ravi), part).toBe(403);
    }
    expect(await status("get", "/parent/children", school.tokens.ravi)).toBe(200);
    expect(await status("get", child(), school.tokens.ravi)).toBe(200);
  });

  it("each part of the child's record is its own permission", async () => {
    await tell(school.token, "parent", ["child.attendance"]);
    expect(await status("get", child() + "/attendance", school.tokens.ravi)).toBe(200);
    expect(await status("get", child() + "/timetable", school.tokens.ravi)).toBe(403);
    await tell(school.token, "parent", ["child.timetable", "child.exams", "child.diary"]);
    expect(await status("get", child() + "/timetable", school.tokens.ravi)).toBe(200);
    expect(await status("get", child() + "/exams", school.tokens.ravi)).toBe(200);
    expect(await status("get", child() + "/tests", school.tokens.ravi)).toBe(200);
    expect(await status("get", child() + "/leaves", school.tokens.ravi)).toBe(403);
    await tell(school.token, "parent", ["child.leave"]);
    expect(await status("get", child() + "/leaves", school.tokens.ravi)).toBe(200);
    expect(await status("post", child() + "/leaves", school.tokens.ravi, {})).toBe(400);
    expect(await status("get", "/classroom/calendar?from=2026-11-01&to=2026-11-30", school.tokens.ravi)).toBe(403);
  });
});

describe("kinds of staff are not the same", () => {
  it("a librarian and a driver have their own lists, so one can be given what the other is not", async () => {
    const make = async (role: string) => {
      const user = await User.create({ name: "Rao", username: `${role}.rao`, passwordHash: await hashPassword(PASSWORD), role: "staff", tenantId: school.tenantId });
      await StaffMember.create({ tenantId: school.tenantId, name: "Rao", nameKey: `rao ${role}`, role, status: "active", userId: user._id });
      return (await request(app).post(`${API}/auth/login`).send({ identifier: `${role}.rao`, password: PASSWORD })).body.data.accessToken as string;
    };
    const librarian = await make("librarian");
    const driver = await make("driver");
    await tell(school.token, "librarian", ["students.view"]);
    expect(await status("get", "/students", librarian)).toBe(200);
    expect(await status("get", "/students", driver)).toBe(403);
  });
});
