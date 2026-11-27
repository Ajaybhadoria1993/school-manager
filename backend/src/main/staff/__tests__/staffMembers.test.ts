import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const { sent } = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string; text?: string }> }));

// No real email in tests: capture what would have been sent.
vi.mock("../../../utils/email", () => ({
  sendEmail: vi.fn(async (message: (typeof sent)[number]) => {
    sent.push(message);
    return { delivered: true };
  }),
  verifySmtp: vi.fn(),
}));

import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { acceptLoginInvite } from "../../../test/logins";
import { addColleague, createSchool } from "../../../test/schools";
import { hashPassword } from "../../../utils/authUtils";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { AuthToken } from "../../auth/models/AuthToken";
import { PasswordService } from "../../auth/services/password.service";
import { ALL_TENANTS } from "../../tenants/plugins/tenantScope";
import { User } from "../../users/models/User";
import { StaffMember } from "../models/StaffMember";
import { Teacher } from "../models/Teacher";

/**
 * Staff (2026-11-26, the user: "teacher aur staff m static username aur password nhi dena; add kro to checkbox do ki login ki permission
 * dena h, jb check kre to mail mange"). The school adds a person, and ticks **Give login access** to let them sign in: their email is the
 * login, an invitation goes to it, and the login is Pending until they choose a password from the link. Then they sign in with that email
 * and password and can use Forgot password. A person added without a login gets one later from the Staff list the same way.
 */

const api = "/api/v1/staff/members";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const add = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);
const list = (token: string, query = "") => request(app).get(`${api}${query}`).set(auth(token));
const patch = (token: string, id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(token)).send(body);
const giveLogin = (token: string, id: string, body: object = {}) => request(app).post(`${api}/${id}/login`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const login = (identifier: string, password = PASSWORD) => request(app).post("/api/v1/auth/login").send({ identifier, password });

const PASSWORD = "Recep@Desk1";
const ASHA = { name: "Asha Rao", role: "receptionist", mobile: "9876543210", email: "asha@school.example", giveLogin: true };

/** A school and its admin, who adds Asha with login access; `accepted`: Asha opened the invitation and chose PASSWORD. */
async function school(extra: Record<string, unknown> = {}, accepted = true) {
  const s = await createSchool("Sunrise Public School");
  const res = await add(s.token, { ...ASHA, ...extra });
  if (accepted && res.status === 201) expect((await acceptLoginInvite(res.body.data.invite.devInviteLink, PASSWORD)).status).toBe(200);
  return { s, res, id: res.body.data?.id as string };
}

/** A person added before 2026-11-08, while a person could wait for an invitation ("invited"): no login. */
async function oldWithoutLogin(tenantId: string, over: Record<string, unknown> = {}) {
  const made = await StaffMember.create({ tenantId, name: "Ravi Menon", nameKey: nameKeyOf("Ravi Menon"), email: "ravi@school.example", role: "librarian", status: "invited", ...over });
  return made._id.toString();
}

beforeEach(async () => {
  sent.length = 0;
  await seedSuperAdmin();
});

describe("adding a staff member", () => {
  it("with login access: the person is active, their login is their email and Pending, and the invitation is emailed", async () => {
    const { s, res } = await school({ gender: "Female", dateOfBirth: "1992-03-09", designation: "Front desk", employeeCode: "st-01", joiningDate: "2026-04-01", address: { line1: "5 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" } }, false);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Asha Rao",
      role: "receptionist",
      roleLabel: "Receptionist",
      email: "asha@school.example",
      mobile: "9876543210",
      status: "active",
      login: { username: null, email: "asha@school.example", isActive: true, pending: true },
      invite: { email: "asha@school.example", emailSent: true },
      gender: "Female",
      dateOfBirth: "1992-03-09",
      designation: "Front desk",
      employeeCode: "ST-01",
      joiningDate: "2026-04-01",
      address: { line1: "5 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
    });
    expect(sent.map((m) => m.to)).toEqual(["asha@school.example"]);

    const user = await User.findOne({ email: "asha@school.example" }).lean();
    expect(user).toMatchObject({ role: "receptionist", roleLabel: "Receptionist", isActive: true, phone: "9876543210", invitePending: true });
    expect(user?.username).toBeUndefined();
    expect(String(user?.tenantId)).toBe(s.tenantId);
    // Pending: nothing opens it until the password is chosen from the link.
    expect((await login("asha@school.example")).status).toBe(401);
    expect((await acceptLoginInvite(res.body.data.invite.devInviteLink, PASSWORD)).status).toBe(200);
    const signed = await login("asha@school.example");
    expect(signed.status).toBe(200);
    expect(signed.body.data.user).toMatchObject({ role: "receptionist", name: "Asha Rao", roleLabel: "Receptionist" });
    expect((await login("asha@school.example", "Wrong@Pass1")).status).toBe(401);
    expect((await request(app).get(`${api}/${res.body.data.id}`).set(auth(s.token))).body.data.login).toMatchObject({ pending: false });
  });

  it("without login access: no login, nothing emailed, the email is optional and only a contact", async () => {
    const s = await createSchool("Sunrise Public School");
    const bare = await add(s.token, { name: "Ravi Menon", role: "librarian" });
    expect(bare.status).toBe(201);
    expect(bare.body.data).toMatchObject({ status: "active", email: null, login: null });
    expect(bare.body.data.invite).toBeUndefined();
    const mailed = await add(s.token, { name: "Kabir Khan", role: "driver", email: "Kabir@School.Example" });
    expect(mailed.body.data).toMatchObject({ email: "kabir@school.example", login: null });
    expect(sent).toHaveLength(0);
    expect(await User.countDocuments({ tenantId: s.tenantId, role: { $ne: "school_admin" } })).toBe(0);
  });

  it("needs a name, a role the school has, and the email when login access is ticked; takes no username or password", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["teacher", "parent", "school_admin", "super_admin", "student", "nonsense"]) {
      const res = await add(s.token, { ...ASHA, role });
      expect(res.status, role).toBe(400);
      expect(details(res)[0].path, role).toBe("role");
    }
    const bare = await add(s.token, { role: "management" });
    expect(bare.status).toBe(400);
    expect(details(bare).map((d) => d.path)).toEqual(["name"]);
    const noEmail = await add(s.token, { ...ASHA, email: undefined });
    expect(details(noEmail)).toEqual([{ path: "email", message: "Enter the email: the login invitation is sent to it" }]);
    expect(details(await add(s.token, { ...ASHA, email: "not-an-email" }))[0].path).toBe("email");
    expect(details(await add(s.token, { ...ASHA, mobile: "12345" }))[0].path).toBe("mobile");
    expect(await StaffMember.countDocuments({ tenantId: s.tenantId })).toBe(0);

    // An old screen's username and password make no login.
    const old = await add(s.token, { name: "Asha Rao", role: "receptionist", login: { username: "asha.rao_41", password: PASSWORD } });
    expect(old.status).toBe(201);
    expect(old.body.data.login).toBeNull();
    expect(await User.countDocuments({ username: "asha.rao_41" })).toBe(0);
  });

  it("refuses an email that is a login anywhere, or another staff member's; nothing is made", async () => {
    const a = await school();
    const other = await createSchool("Moonrise Public School");
    const taken = await add(other.token, { ...ASHA, name: "Another" });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("LOGIN_EMAIL_TAKEN");
    expect(details(taken)[0].path).toBe("email");
    expect(await StaffMember.countDocuments({ tenantId: other.tenantId })).toBe(0);

    const mailTaken = await add(a.s.token, { name: "Kabir", role: "driver", email: "ASHA@school.example" });
    expect(mailTaken.status).toBe(409);
    expect(details(mailTaken)[0].path).toBe("email");
    expect(await StaffMember.countDocuments({ tenantId: a.s.tenantId })).toBe(1);
  });

  it("is for the people who run the school only: a teacher, an accountant and a parent are refused", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["teacher", "accountant", "parent"] as const) expect((await add(await addColleague(s.tenantId, role), ASHA)).status, role).toBe(403);
    expect((await request(app).post(api).send(ASHA)).status).toBe(401);
    const principal = await addColleague(s.tenantId, "principal");
    expect((await add(principal, ASHA)).status).toBe(201);
  });

  it("an employee code another staff member has is refused", async () => {
    const { s } = await school({ employeeCode: "ST-01" });
    const again = await add(s.token, { name: "Ravi", role: "management", email: "ravi@school.example", giveLogin: true, employeeCode: "st-01" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("STAFF_CODE_EXISTS");
    expect(details(again)[0].path).toBe("employeeCode");
    expect(await User.countDocuments({ email: "ravi@school.example" })).toBe(0);
  });

  it("a person who also teaches is a Teacher of the school with or without a login", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await add(s.token, { name: "Neha Joshi", role: "vice_principal", alsoTeacher: true, mobile: "9876543211" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ isTeacher: true, login: null });
    const teacher = await Teacher.findOne({ tenantId: s.tenantId, name: "Neha Joshi" }).lean();
    expect(teacher).toMatchObject({ isActive: true, userId: null });
  });
});

describe("the list of staff", () => {
  it("shows everyone with their status and login, filtered by status, role and search (name, email, code), with the counts", async () => {
    const s = await createSchool("Sunrise Public School");
    const asha = await add(s.token, ASHA);
    await add(s.token, { name: "Ravi Menon", role: "management", email: "ravi@school.example" });
    await add(s.token, { name: "Sunita Bose", role: "accountant", employeeCode: "AC-9", email: "sunita@school.example", giveLogin: true });
    await patch(s.token, asha.body.data.id, { isActive: false });
    await oldWithoutLogin(s.tenantId, { name: "Zoya Khan", nameKey: nameKeyOf("Zoya Khan"), email: null });
    const all = await list(s.token);
    expect(all.body.data.items.map((m: { name: string }) => m.name)).toEqual(["Asha Rao", "Ravi Menon", "Sunita Bose", "Zoya Khan"]);
    expect(all.body.data.counts).toEqual({ active: 2, invited: 1, inactive: 1 });
    const names = async (q: string) => (await list(s.token, q)).body.data.items.map((m: { name: string }) => m.name);
    expect(await names("?status=inactive")).toEqual(["Asha Rao"]);
    expect(await names("?role=management")).toEqual(["Ravi Menon"]);
    expect(await names("?search=sunita")).toEqual(["Sunita Bose"]);
    expect(await names("?search=ravi%40school")).toEqual(["Ravi Menon"]);
    expect(await names("?search=ac-9")).toEqual(["Sunita Bose"]);
    expect((await list(s.token, "?status=everyone")).status).toBe(400);
    const by = (name: string) => all.body.data.items.find((m: { name: string }) => m.name === name);
    expect(by("Zoya Khan").login).toBeNull();
    expect(by("Ravi Menon").login).toBeNull();
    expect(by("Sunita Bose").login).toEqual({ username: null, email: "sunita@school.example", isActive: true, pending: true });
    expect(by("Asha Rao").login).toEqual({ username: null, email: "asha@school.example", isActive: false, pending: true });
  });

  it("holds the caller's school only", async () => {
    const a = await school();
    const b = await createSchool("Moonrise Public School");
    await add(b.token, { name: "Kabir Khan", role: "management" });
    expect((await list(a.s.token)).body.data.items.map((m: { name: string }) => m.name)).toEqual(["Asha Rao"]);
    expect((await list(b.token)).body.data.items.map((m: { name: string }) => m.name)).toEqual(["Kabir Khan"]);
    expect((await request(app).get(`${api}/${a.id}`).set(auth(b.token))).status).toBe(404);
    expect((await patch(b.token, a.id, { name: "Hacked" })).status).toBe(404);
    expect((await request(app).delete(`${api}/${a.id}`).set(auth(b.token))).status).toBe(404);
    expect((await giveLogin(b.token, a.id, { email: "hacker@mail.test" })).status).toBe(404);
    expect((await StaffMember.findOne({ _id: a.id, tenantId: a.s.tenantId }).lean())?.email).toBe("asha@school.example");
  });
});

describe("a staff member who works here", () => {
  it("can be made inactive (their login closes at once) and active again", async () => {
    const { s, id } = await school();
    const off = await patch(s.token, id, { isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.status).toBe("inactive");
    expect(off.body.data.login.isActive).toBe(false);
    expect((await login("asha@school.example")).status).toBe(403);
    const on = await patch(s.token, id, { isActive: true });
    expect(on.body.data.status).toBe("active");
    expect((await login("asha@school.example")).status).toBe(200);
  });

  it("can be made inactive and active without a login too", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = (await add(s.token, { name: "Ravi Menon", role: "librarian" })).body.data.id as string;
    expect((await patch(s.token, id, { isActive: false })).body.data.status).toBe("inactive");
    expect((await patch(s.token, id, { isActive: true })).body.data.status).toBe("active");
  });

  it("has details, a role and an email that can be changed (the login follows); an email somebody else has, or none, is refused", async () => {
    const { s, id } = await school();
    await add(s.token, { name: "Ravi", role: "management", email: "ravi@school.example" });
    const res = await patch(s.token, id, { name: "Asha Rao Verma", role: "management", designation: "Front office", email: "asha.verma@school.example" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Asha Rao Verma", role: "management", roleLabel: "Management", designation: "Front office", email: "asha.verma@school.example" });
    const user = await User.findOne({ email: "asha.verma@school.example" }).lean();
    expect(user).toMatchObject({ role: "management", name: "Asha Rao Verma" });
    expect((await login("asha.verma@school.example")).status).toBe(200);
    expect((await login("asha@school.example")).status).toBe(401);
    const taken = await patch(s.token, id, { email: "RAVI@school.example" });
    expect(taken.status).toBe(409);
    expect(details(taken)[0].path).toBe("email");
    // The login is the email: it cannot be taken away.
    const none = await patch(s.token, id, { email: "" });
    expect(none.status).toBe(400);
    expect(details(none)).toEqual([{ path: "email", message: "Their login is this email: it cannot be left empty" }]);
    expect((await patch(s.token, id, { role: "teacher" })).status).toBe(400);
    expect((await patch(s.token, id, {})).status).toBe(400);
  });

  it("with their role they reach what the role is for and nothing of the people who run the school", async () => {
    const { s } = await school();
    const asha = (await login("asha@school.example")).body.data.accessToken as string;
    expect((await request(app).get("/api/v1/classroom/calendar?year=2026").set(auth(asha))).status).not.toBe(403);
    expect((await list(asha)).status).toBe(403);
    expect((await request(app).get("/api/v1/staff/teachers").set(auth(asha))).status).toBe(403);
    expect((await request(app).post("/api/v1/staff/teachers").set(auth(asha)).send({ name: "Sneaky" })).status).toBe(403);
    expect((await request(app).get("/api/v1/academics/structure").set(auth(asha))).status).toBe(403);
    expect(s.tenantId).toBeTruthy();
  });

  it("resets their own password by Forgot password, like the school admin", async () => {
    await school();
    expect((await request(app).post("/api/v1/auth/forgot-password").send({ email: "asha@school.example" })).status).toBe(200);
    await PasswordService.idle();
    expect(await AuthToken.countDocuments({ type: "password_reset" })).toBe(1);
    const reset = /reset-password\?token=([a-f0-9]+)/.exec([...sent].reverse().find((m) => m.subject.includes("Reset"))?.text ?? "")?.[1];
    expect((await request(app).post("/api/v1/auth/reset-password").send({ token: reset, newPassword: "New@Desk123" })).status).toBe(200);
    expect((await login("asha@school.example", "New@Desk123")).status).toBe(200);
  });

  it("no longer has the school's own password or username for them", async () => {
    const { s, id } = await school();
    expect((await request(app).post(`${api}/${id}/reset-password`).set(auth(s.token)).send({ password: "New@Desk123" })).status).toBe(404);
    expect((await request(app).patch(`${api}/${id}/login`).set(auth(s.token)).send({ username: "asha.verma_77" })).status).toBe(404);
  });

  it("cannot be removed (they have a login): they are made inactive instead", async () => {
    const { s, id } = await school();
    const res = await request(app).delete(`${api}/${id}`).set(auth(s.token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });
});

describe("Give login access to a person who has none, or the invitation again", () => {
  it("uses their email, or asks for one and keeps it; the role they had; the login opens once they choose a password", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = (await add(s.token, { name: "Ravi Menon", role: "librarian" })).body.data.id as string;
    const asked = await giveLogin(s.token, id);
    expect(asked.status).toBe(400);
    expect(details(asked)).toEqual([{ path: "email", message: "Enter the email: the login invitation is sent to it" }]);

    const given = await giveLogin(s.token, id, { email: "Ravi@School.Example" });
    expect(given.status).toBe(200);
    expect(given.body.data).toMatchObject({ email: "ravi@school.example", status: "active", login: { email: "ravi@school.example", pending: true } });
    expect((await acceptLoginInvite(given.body.data.invite.devInviteLink, PASSWORD)).status).toBe(200);
    expect((await login("ravi@school.example")).body.data.user).toMatchObject({ role: "staff", roleLabel: "Librarian" });
  });

  it("gives a person from before 2026-11-08 (\"invited\", no login) one with the email they have, and they are active from then on", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await oldWithoutLogin(s.tenantId);
    expect((await request(app).get(`${api}/${id}`).set(auth(s.token))).body.data).toMatchObject({ status: "invited", login: null, roleLabel: "Librarian" });
    const given = await giveLogin(s.token, id);
    expect(given.status).toBe(200);
    expect(given.body.data).toMatchObject({ status: "active", login: { email: "ravi@school.example", pending: true } });
  });

  it("sends the invitation again (the old link stops), and a login that works a link to choose a new password", async () => {
    const { s, id, res } = await school({}, false);
    const again = await giveLogin(s.token, id);
    expect(again.status).toBe(200);
    expect((await acceptLoginInvite(res.body.data.invite.devInviteLink, PASSWORD)).body.code).toBe("INVITE_INVALID");
    expect((await acceptLoginInvite(again.body.data.invite.devInviteLink, PASSWORD)).status).toBe(200);

    const reset = await giveLogin(s.token, id);
    expect(reset.body.data.login).toMatchObject({ pending: false });
    expect((await acceptLoginInvite(reset.body.data.invite.devInviteLink, "New@Desk123")).status).toBe(200);
    expect((await login("asha@school.example", "New@Desk123")).status).toBe(200);
  });

  it("gives an older login that has only a username an email: both then open it", async () => {
    const s = await createSchool("Sunrise Public School");
    const user = await User.create({ name: "Old Desk", username: "old.desk_10", passwordHash: await hashPassword(PASSWORD), role: "receptionist", tenantId: s.tenantId, isActive: true });
    const member = await StaffMember.create({ tenantId: s.tenantId, name: "Old Desk", nameKey: nameKeyOf("Old Desk"), email: null, role: "receptionist", status: "active", userId: user._id });
    expect((await request(app).get(`${api}/${member._id}`).set(auth(s.token))).body.data.login).toEqual({ username: "old.desk_10", email: null, isActive: true, pending: false });
    const res = await giveLogin(s.token, member._id.toString(), { email: "old@school.example" });
    expect(res.status).toBe(200);
    expect((await acceptLoginInvite(res.body.data.invite.devInviteLink, "New@Desk123")).status).toBe(200);
    expect((await login("old@school.example", "New@Desk123")).status).toBe(200);
    expect((await login("old.desk_10", "New@Desk123")).status).toBe(200);
  });

  it("links the Teacher record of a person who also teaches to the login when it is a teacher's", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = (await add(s.token, { name: "Ravi Iyer", role: "librarian", alsoTeacher: true, mobile: "9876543212" })).body.data.id as string;
    const given = await giveLogin(s.token, id, { email: "ravi.iyer@school.example" });
    expect(given.status).toBe(200);
    const member = await StaffMember.findById(id).setOptions(ALL_TENANTS).lean();
    const teacher = await Teacher.findById(member?.teacherId).setOptions(ALL_TENANTS).lean();
    expect(String(teacher?.userId)).toBe(String(member?.userId));
    expect(teacher?.email).toBe("ravi.iyer@school.example");
    expect((await User.findById(member?.userId).lean())?.role).toBe("teacher");
  });

  it("is refused for a person made inactive, and for an email somebody's login has", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = (await add(s.token, { name: "Ravi Menon", role: "librarian", email: "ravi@school.example" })).body.data.id as string;
    expect((await giveLogin(s.token, id, { email: "school_admin@sunrisepublicschool.example" })).body.code).toBe("LOGIN_EMAIL_TAKEN");
    await patch(s.token, id, { isActive: false });
    const off = await giveLogin(s.token, id);
    expect(off.status).toBe(409);
    expect(off.body.code).toBe("INVALID_STATE");
    expect(await User.countDocuments({ email: "ravi@school.example" })).toBe(0);
  });

  it("a person with no login can be removed; one with a login cannot", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await oldWithoutLogin(s.tenantId);
    expect((await request(app).delete(`${api}/${id}`).set(auth(s.token))).status).toBe(200);
    expect((await list(s.token)).body.data.items).toEqual([]);
    // Its email is free again.
    expect((await add(s.token, { ...ASHA, email: "ravi@school.example" })).status).toBe(201);
  });

  it("an email already on a person with no login is refused for a new one", async () => {
    const s = await createSchool("Sunrise Public School");
    await oldWithoutLogin(s.tenantId);
    const res = await add(s.token, { ...ASHA, email: "RAVI@school.example" });
    expect(res.status).toBe(409);
    expect(details(res)[0].path).toBe("email");
  });
});
