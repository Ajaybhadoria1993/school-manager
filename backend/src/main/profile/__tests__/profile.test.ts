import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool, LOGIN_PASSWORD, signInAs } from "../../../test/classroom";
import { emailOf, postStaff } from "../../../test/logins";
import { auth } from "../../../test/timetable";
import { Tenant } from "../../tenants/models/Tenant";
import { User } from "../../users/models/User";

/**
 * Settings > Personal details (docs/profiles.md): each person who works at the school reads and changes their own details. What the school
 * decides about them (their login email, role, post, employee code, joining date) is shown and cannot be changed here.
 */

const API = "/api/v1/profile";
const mine = (token: string) => request(app).get(API).set(auth(token));
const change = (token: string, body: object) => request(app).put(API).set(auth(token)).send(body);

async function school() {
  const s = await classroomSchool();
  const made = await postStaff(s.token, { name: "Rita Das", role: "receptionist", mobile: "9800000001", designation: "Front office", employeeCode: "R-1", login: { username: "sun.rita", password: LOGIN_PASSWORD } });
  expect(made.status).toBe(201);
  return { ...s, rita: made.body.data.id as string, ritaToken: await signInAs(emailOf("sun.rita")) };
}
const teacherOf = async (token: string, id: string) => (await request(app).get(`/api/v1/staff/teachers/${id}`).set(auth(token))).body.data;
const staffOf = async (token: string, id: string) => (await request(app).get(`/api/v1/staff/members/${id}`).set(auth(token))).body.data;

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the administrator's own details", () => {
  it("are their name, role and mobile numbers, with the login email to read", async () => {
    const s = await school();
    const res = await mine(s.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ kind: "account", name: "Asha Verma", email: expect.stringContaining("@") });
    const saved = await change(s.token, { name: "Asha V. Verma", designation: "Owner", mobile: "98765 43210", alternateMobile: "" });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ name: "Asha V. Verma", designation: "Owner", mobile: "9876543210", alternateMobile: null });
    const me = (await request(app).get("/api/v1/auth/me").set(auth(s.token))).body.data;
    expect(me.user.name).toBe("Asha V. Verma");
  });

  it("a name and a mobile number are needed, and Other needs its words", async () => {
    const s = await school();
    expect((await change(s.token, { name: " " })).status).toBe(400);
    expect((await change(s.token, { mobile: "" })).body.details).toEqual([{ path: "mobile", message: "Enter a 10-digit mobile number" }]);
    expect((await change(s.token, { mobile: "12345" })).status).toBe(400);
    expect((await change(s.token, { designation: "Other" })).body.details).toEqual([{ path: "designationOther", message: "Tell us your role" }]);
    expect((await change(s.token, { designation: "Wizard" })).status).toBe(400);
    expect((await change(s.token, {})).status).toBe(400);
  });

  it("the login email is not changed here, whatever is sent", async () => {
    const s = await school();
    const before = (await mine(s.token)).body.data.email;
    await change(s.token, { name: "Asha", email: "thief@mail.test", role: "super_admin" });
    expect((await mine(s.token)).body.data.email).toBe(before);
    expect((await User.findOne({ email: before }).lean())?.role).toBe("school_admin");
  });

  it("are not changed while the school's application is with the platform team", async () => {
    const s = await school();
    await Tenant.updateOne({ _id: s.tenantId }, { $set: { approvalStatus: "pending" } });
    expect((await change(s.token, { name: "Someone" })).status).toBe(403);
  });
});

describe("a teacher's own details", () => {
  it("reads the personal details to change and the school's to look at", async () => {
    const s = await school();
    const data = (await mine(s.tokens.meena)).body.data;
    expect(data).toMatchObject({ kind: "member", teaches: true, name: "Meena Singh", email: emailOf("sun.meena"), address: { line1: null, city: null, state: null, pincode: null }, job: { employeeCode: null, designation: null, joiningDate: null } });
  });

  it("changes their name, mobile, birthday, address and qualification; the school sees it", async () => {
    const s = await school();
    const res = await change(s.tokens.meena, {
      name: "Meena S. Rawat",
      mobile: "9812345678",
      gender: "Female",
      dateOfBirth: "1990-07-14",
      address: { line1: "4 Lake View", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      qualification: "M.Sc, B.Ed",
      experienceYears: 8,
    });
    expect(res.status).toBe(200);
    expect(await teacherOf(s.token, s.meena)).toMatchObject({ name: "Meena S. Rawat", mobile: "9812345678", gender: "Female", dateOfBirth: "1990-07-14", qualification: "M.Sc, B.Ed", experienceYears: 8, address: { city: "Bhopal" } });
    // The top bar and the bell know the new name.
    expect((await request(app).get("/api/v1/auth/me").set(auth(s.tokens.meena))).body.data.user.name).toBe("Meena S. Rawat");
  });

  it("cannot change what the school decides", async () => {
    const s = await school();
    const before = await teacherOf(s.token, s.meena);
    await change(s.tokens.meena, { name: "Meena Singh", email: "other@mail.test", employeeCode: "BOSS", designation: "Principal", joiningDate: "2001-01-01", subjectIds: [], isActive: false });
    expect(await teacherOf(s.token, s.meena)).toMatchObject({ email: before.email, employeeCode: before.employeeCode, designation: before.designation, joiningDate: before.joiningDate, subjectIds: before.subjectIds, isActive: true });
  });

  it("another teacher's mobile number is refused, and a number cannot be emptied", async () => {
    const s = await school();
    const other = (await teacherOf(s.token, s.dev)).mobile as string;
    const taken = await change(s.tokens.meena, { mobile: other });
    expect(taken.status).toBe(409);
    expect(taken.body.details[0].path).toBe("mobile");
    expect((await change(s.tokens.meena, { mobile: "" })).body.details).toEqual([{ path: "mobile", message: "Enter your mobile number" }]);
  });
});

describe("a staff member's own details", () => {
  it("reads and changes them; the school sees it on the staff list", async () => {
    const s = await school();
    expect((await mine(s.ritaToken)).body.data).toMatchObject({ kind: "member", teaches: false, name: "Rita Das", mobile: "9800000001", roleLabel: "Receptionist", job: { employeeCode: "R-1", designation: "Front office" } });
    const res = await change(s.ritaToken, { name: "Rita Das Sen", address: { city: "Indore" }, qualification: "ignored for staff" });
    expect(res.status).toBe(200);
    expect(await staffOf(s.token, s.rita)).toMatchObject({ name: "Rita Das Sen", address: { city: "Indore" }, role: "receptionist", employeeCode: "R-1" });
  });

  it("a staff member who also teaches changes both records at once", async () => {
    const s = await school();
    const made = await postStaff(s.token, { name: "Vik Nair", role: "management", alsoTeacher: true, subjectIds: [s.maths], mobile: "9811122233", login: { username: "sun.vik", password: LOGIN_PASSWORD } });
    const token = await signInAs(emailOf("sun.vik"));
    expect((await mine(token)).body.data).toMatchObject({ kind: "member", teaches: true });
    const res = await change(token, { name: "Vikram Nair", mobile: "9811122244", qualification: "MBA" });
    expect(res.status).toBe(200);
    expect(await staffOf(s.token, made.body.data.id)).toMatchObject({ name: "Vikram Nair", mobile: "9811122244", subjectIds: [s.maths] });
    const teacher = (await request(app).get("/api/v1/staff/teachers").set(auth(s.token))).body.data.items.find((t: { name: string }) => t.name === "Vikram Nair");
    expect(teacher).toMatchObject({ mobile: "9811122244", qualification: "MBA" });
  });
});

describe("who has personal details", () => {
  it("not a parent, and nobody who is not signed in", async () => {
    const s = await school();
    expect((await mine(s.tokens.ravi)).status).toBe(403);
    expect((await change(s.tokens.ravi, { name: "x" })).status).toBe(403);
    expect((await request(app).get(API)).status).toBe(401);
  });
});
