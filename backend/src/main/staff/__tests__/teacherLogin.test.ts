import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const { sent } = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string; html: string; text?: string }> }));

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
import { acceptLoginInvite, tokenOfLink } from "../../../test/logins";
import { addColleague, createSchool } from "../../../test/schools";
import { hashPassword } from "../../../utils/authUtils";
import { AuthToken } from "../../auth/models/AuthToken";
import { RefreshToken } from "../../auth/models/RefreshToken";
import { PasswordService } from "../../auth/services/password.service";
import { ALL_TENANTS } from "../../tenants/plugins/tenantScope";
import { User } from "../../users/models/User";
import { StaffMember } from "../models/StaffMember";
import { Teacher } from "../models/Teacher";

/**
 * A teacher's own login (2026-11-26, the user: "add ho to usska email mange ... invitation link jaye uske mail per, jb tk pending status rhe;
 * teacher link click krke password set krega, fir pending s complete; mail aur password s login; forget bhi kr skte h; static username aur
 * password nhi dena; bulk upload waalon ko baad me login ki permission"). The school ticks "Give login access" and gives the email; the login
 * is that email and is Pending until the teacher opens the invitation and chooses a password; then they sign in with the email and that
 * password, and reset it themselves by Forgot password. A teacher with no login (a bulk upload) gets one later the same way. A teacher who has
 * left cannot sign in.
 */

const api = "/api/v1/staff/teachers";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const post = (token: string, body: object, path = "") => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(token)).send(body);
const signIn = (identifier: string, password: string, device = "web") => request(app).post("/api/v1/auth/login").send({ identifier, password, device });
const checkLink = (link: string | undefined) => request(app).post("/api/v1/auth/login-invite/check").send({ token: tokenOfLink(link) });
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
/** The link of the last email sent to this address. */
const linkMailedTo = (email: string) => {
  const mail = [...sent].reverse().find((m) => m.to === email);
  const match = /(http\S+\/set-password\?token=[a-f0-9]+)/.exec(mail?.text ?? "");
  if (!match) throw new Error(`No invitation link mailed to ${email}`);
  return match[1];
};

// These tests look across schools on purpose: "nothing was left behind" means in no school.
const teacherCount = () => Teacher.countDocuments().setOptions(ALL_TENANTS);
const teacherById = (id: string) => Teacher.findById(id).setOptions(ALL_TENANTS).lean();

const PASSWORD = "Sch00l@Teach1";
const MEENA = { name: "Meena Singh", mobile: "9876543210", email: "meena@school.example", giveLogin: true };

/** Meena added with login access, and the invitation opened with PASSWORD. */
async function meenaSignedUp(token: string, over: object = {}) {
  const res = await post(token, { ...MEENA, ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  expect((await acceptLoginInvite(res.body.data.invite.devInviteLink, PASSWORD)).status).toBe(200);
  return res.body.data.id as string;
}

beforeEach(async () => {
  sent.length = 0;
  await seedSuperAdmin();
});

describe("adding a teacher with login access", () => {
  it("makes the teacher and a Pending login (their email), emails the invitation, and has no username or password from the school", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const res = await post(token, { ...MEENA, email: "Meena@School.Example" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Meena Singh",
      email: "meena@school.example",
      login: { username: null, email: "meena@school.example", isActive: true, pending: true },
      invite: { email: "meena@school.example", emailSent: true, inviteExpiresAt: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const user = await User.findOne({ email: "meena@school.example" }).lean();
    expect(user).toMatchObject({ name: "Meena Singh", role: "teacher", phone: "9876543210", isActive: true, invitePending: true });
    expect(user?.username).toBeUndefined();
    expect(String(user?.tenantId)).toBe(tenantId);
    expect(String((await teacherById(res.body.data.id))?.userId)).toBe(String(user?._id));

    // One email, to the teacher, with the link to choose the password.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "meena@school.example", subject: expect.stringContaining("Sunrise Public School") });
    expect(linkMailedTo("meena@school.example")).toBe(res.body.data.invite.devInviteLink);
  });

  it("cannot sign in while Pending; the link shows who it is for; the password chosen opens it, and the login is no longer Pending", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, MEENA);
    const link = res.body.data.invite.devInviteLink as string;
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(401);

    const info = await checkLink(link);
    expect(info.status).toBe(200);
    expect(info.body.data).toMatchObject({ name: "Meena Singh", email: "meena@school.example", schoolName: "Sunrise Public School" });

    const accepted = await acceptLoginInvite(link, PASSWORD);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.user).toMatchObject({ role: "teacher", email: "meena@school.example", username: null });
    expect(accepted.body.data.accessToken).toEqual(expect.any(String));
    // That session works at once.
    expect((await request(app).get(`${api}/me`).set(auth(accepted.body.data.accessToken))).status).toBe(200);

    const session = await signIn("meena@school.example", PASSWORD, "android");
    expect(session.status).toBe(200);
    expect(session.body.data.user.emailVerifiedAt).toEqual(expect.any(String));
    const teacher = (await request(app).get(`${api}/${res.body.data.id}`).set(auth(token))).body.data;
    expect(teacher.login).toEqual({ username: null, email: "meena@school.example", isActive: true, pending: false });
    expect((await User.findOne({ email: "meena@school.example" }).lean())?.invitePending).toBeUndefined();

    // The link works once.
    const again = await acceptLoginInvite(link, "An0ther@Pass1");
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_REGISTERED");
    expect((await signIn("meena@school.example", "An0ther@Pass1")).status).toBe(401);
  });

  it("holds the password to the platform's rules, and says a wrong or an old link plainly", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const link = (await post(token, MEENA)).body.data.invite.devInviteLink as string;
    const weak = await acceptLoginInvite(link, "weak");
    expect(weak.status).toBe(400);
    expect(details(weak).map((d) => d.path)).toEqual(["password"]);

    const wrong = await request(app).post("/api/v1/auth/login-invite/check").send({ token: "f".repeat(64) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("INVITE_INVALID");

    await AuthToken.updateOne({ type: "login_invite" }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const old = await acceptLoginInvite(link, PASSWORD);
    expect(old.status).toBe(400);
    expect(old.body.code).toBe("INVITE_EXPIRED");
  });

  it("needs the email when login access is ticked (and no mobile number for it), and makes nothing without it", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { name: "Meena Singh", giveLogin: true });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([{ path: "email", message: "Enter the email: the login invitation is sent to it" }]);
    expect(await teacherCount()).toBe(0);

    const noMobile = await post(token, { name: "Meena Singh", email: "meena@school.example", giveLogin: true });
    expect(noMobile.status).toBe(201);
    expect(noMobile.body.data.login).toMatchObject({ pending: true });
  });

  it("makes no login and sends nothing when it is not ticked (an email is only the teacher's contact then)", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { name: "Meena Singh", email: "meena@school.example" });
    expect(res.status).toBe(201);
    expect(res.body.data.login).toBeNull();
    expect(res.body.data.invite).toBeUndefined();
    expect(sent).toHaveLength(0);
    expect(await User.countDocuments({ role: "teacher" })).toBe(0);
  });

  it("takes no username or password from the school any more (an old screen's login is not made)", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { name: "Meena Singh", mobile: "9876543210", login: { username: "meena.singh", password: PASSWORD } });
    expect(res.status).toBe(201);
    expect(res.body.data.login).toBeNull();
    expect(await User.countDocuments({ username: "meena.singh" })).toBe(0);
    expect((await signIn("meena.singh", PASSWORD)).status).toBe(401);
  });

  it("refuses an email that already has a login, or another teacher's email, and makes no teacher", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const taken = await post(token, { ...MEENA, email: "school_admin@sunrisepublicschool.example" });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("LOGIN_EMAIL_TAKEN");
    expect(details(taken)).toEqual([expect.objectContaining({ path: "email" })]);
    expect(await teacherCount()).toBe(0);

    expect((await post(token, { name: "Dev Patel", email: "dev@school.example" })).status).toBe(201);
    const twin = await post(token, { ...MEENA, email: "dev@school.example" });
    expect(twin.status).toBe(409);
    expect(twin.body.code).toBe("TEACHER_EMAIL_EXISTS");
    expect(await teacherCount()).toBe(1);
  });

  it("keeps the school's other rules: a mobile number another teacher has still stops it, and no login is left behind", async () => {
    const { token } = await createSchool("Sunrise Public School");
    expect((await post(token, { name: "First", mobile: "9876543210" })).status).toBe(201);
    const res = await post(token, MEENA);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEACHER_MOBILE_EXISTS");
    expect(await User.countDocuments({ email: "meena@school.example" })).toBe(0);
  });

  it("leaves exactly one login when two schools give the same email at the same moment", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const [one, two] = await Promise.all([post(a.token, MEENA), post(b.token, MEENA)]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    expect(await User.countDocuments({ email: "meena@school.example" })).toBe(1);
    expect(await teacherCount()).toBe(1);
  });
});

describe("Give login access, for a teacher who has none (a bulk upload) or whose invitation is pending", () => {
  it("uses the teacher's email, or asks for one when they have none and keeps it", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const withEmail = (await post(token, { name: "Meena Singh", email: "meena@school.example" })).body.data.id as string;
    const given = await post(token, {}, `/${withEmail}/login`);
    expect(given.status).toBe(200);
    expect(given.body.data).toMatchObject({ id: withEmail, login: { email: "meena@school.example", pending: true }, invite: { email: "meena@school.example" } });
    expect((await acceptLoginInvite(given.body.data.invite.devInviteLink, PASSWORD)).status).toBe(200);
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(200);

    const bare = (await post(token, { name: "Dev Patel", mobile: "9876500000" })).body.data.id as string;
    const asked = await post(token, {}, `/${bare}/login`);
    expect(asked.status).toBe(400);
    expect(details(asked)).toEqual([{ path: "email", message: "Enter the email: the login invitation is sent to it" }]);
    expect(await User.countDocuments({ role: "teacher" })).toBe(1);

    const typed = await post(token, { email: "Dev@School.Example" }, `/${bare}/login`);
    expect(typed.status).toBe(200);
    expect(typed.body.data).toMatchObject({ email: "dev@school.example", login: { email: "dev@school.example", pending: true } });
    expect((await teacherById(bare))?.email).toBe("dev@school.example");
  });

  it("sends the invitation again: a fresh link, and the old one stops working", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const first = await post(token, MEENA);
    const again = await post(token, {}, `/${first.body.data.id}/login`);
    expect(again.status).toBe(200);
    expect(again.body.data.login).toMatchObject({ pending: true });
    expect(again.body.data.invite.devInviteLink).not.toBe(first.body.data.invite.devInviteLink);
    expect(sent.filter((m) => m.to === "meena@school.example")).toHaveLength(2);

    expect((await acceptLoginInvite(first.body.data.invite.devInviteLink, PASSWORD)).body.code).toBe("INVITE_INVALID");
    expect((await acceptLoginInvite(again.body.data.invite.devInviteLink, PASSWORD)).status).toBe(200);
    expect(await User.countDocuments({ email: "meena@school.example" })).toBe(1);
  });

  it("sends a login that works a link to choose a new password: the old one works until then, and its sessions end after", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = await meenaSignedUp(token);
    const session = await signIn("meena@school.example", PASSWORD, "android");
    const res = await post(token, {}, `/${id}/login`);
    expect(res.status).toBe(200);
    expect(res.body.data.login).toMatchObject({ pending: false });
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(200);

    // Tokens are compared in whole seconds: the reset must come after the old session's second.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await acceptLoginInvite(res.body.data.invite.devInviteLink, "N3w@Passw0rd")).status).toBe(200);
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(401);
    expect((await signIn("meena@school.example", "N3w@Passw0rd")).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: session.body.data.refreshToken })).status).toBe(401);
  });

  it("gives an older login that has only a username an email the same way: both then open it", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const user = await User.create({ name: "Old Teacher", username: "old.teacher", passwordHash: await hashPassword(PASSWORD), role: "teacher", tenantId, isActive: true });
    const id = (await post(token, { name: "Old Teacher", mobile: "9876500011" })).body.data.id as string;
    await Teacher.updateOne({ _id: id, tenantId }, { $set: { userId: user._id } });
    expect((await request(app).get(`${api}/${id}`).set(auth(token))).body.data.login).toEqual({ username: "old.teacher", email: null, isActive: true, pending: false });

    const res = await post(token, { email: "old@school.example" }, `/${id}/login`);
    expect(res.status).toBe(200);
    expect((await acceptLoginInvite(res.body.data.invite.devInviteLink, "N3w@Passw0rd")).status).toBe(200);
    expect((await signIn("old@school.example", "N3w@Passw0rd")).status).toBe(200);
    expect((await signIn("old.teacher", "N3w@Passw0rd")).status).toBe(200);
  });

  it("is refused for a teacher who has left and for a staff member's teacher record; 404 for another school's; 403 for a teacher", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const id = (await post(a.token, { name: "Meena Singh", mobile: "9876543210", email: "meena@school.example" })).body.data.id as string;
    expect((await post(b.token, { email: "x@mail.test" }, `/${id}/login`)).status).toBe(404);
    expect((await post(await addColleague(a.tenantId, "teacher"), {}, `/${id}/login`)).status).toBe(403);

    await patch(a.token, id, { isActive: false });
    const left = await post(a.token, {}, `/${id}/login`);
    expect(left.status).toBe(409);
    expect(left.body.code).toBe("TEACHER_HAS_LEFT");

    const staff = await request(app).post("/api/v1/staff/members").set(auth(a.token)).send({ name: "Neha Joshi", role: "vice_principal", alsoTeacher: true, mobile: "9876543211", email: "neha@school.example" });
    expect(staff.status).toBe(201);
    const fromStaff = await post(a.token, {}, `/${(await StaffMember.findById(staff.body.data.id).setOptions(ALL_TENANTS).lean())?.teacherId}/login`);
    expect(fromStaff.status).toBe(409);
    expect(fromStaff.body.code).toBe("LOGIN_FROM_STAFF");
    expect(await User.countDocuments({ email: { $in: ["meena@school.example", "neha@school.example"] } })).toBe(0);
  });

  it("no longer has the school's own password or username for a teacher", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = await meenaSignedUp(token);
    expect((await post(token, { password: "N3w@Passw0rd" }, `/${id}/reset-password`)).status).toBe(404);
    expect((await request(app).patch(`${api}/${id}/login`).set(auth(token)).send({ username: "meena.s" })).status).toBe(404);
  });
});

describe("Forgot password: a teacher resets their own, like the school admin", () => {
  it("emails a teacher whose login works a reset link, and the new password opens it", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await meenaSignedUp(token);
    expect((await request(app).post("/api/v1/auth/forgot-password").send({ email: "meena@school.example" })).status).toBe(200);
    // The reset is done after the answer (so the answer's time tells nothing): wait for it.
    await PasswordService.idle();
    const mail = [...sent].reverse().find((m) => m.to === "meena@school.example");
    const reset = /reset-password\?token=([a-f0-9]+)/.exec(mail?.text ?? "")?.[1];
    expect(reset).toBeTruthy();
    expect((await request(app).post("/api/v1/auth/reset-password").send({ token: reset, newPassword: "N3w@Passw0rd" })).status).toBe(200);
    expect((await signIn("meena@school.example", "N3w@Passw0rd")).status).toBe(200);
  });

  it("lets a teacher who lost the invitation choose the password from a reset link instead: the login is no longer Pending", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, MEENA)).body.data.id as string;
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "meena@school.example" });
    await PasswordService.idle();
    const reset = /reset-password\?token=([a-f0-9]+)/.exec([...sent].reverse().find((m) => m.subject.includes("Reset"))?.text ?? "")?.[1];
    expect((await request(app).post("/api/v1/auth/reset-password").send({ token: reset, newPassword: PASSWORD })).status).toBe(200);
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(200);
    expect((await request(app).get(`${api}/${id}`).set(auth(token))).body.data.login).toMatchObject({ pending: false });
  });
});

describe("a teacher who has left", () => {
  it("cannot sign in, loses the session they had, and signs in again when brought back", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = await meenaSignedUp(token);
    const session = await signIn("meena@school.example", PASSWORD, "android");
    const own = auth(session.body.data.accessToken);

    expect((await patch(token, id, { isActive: false })).body.data.login).toMatchObject({ email: "meena@school.example", isActive: false });
    const refused = await signIn("meena@school.example", PASSWORD);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("ACCOUNT_DISABLED");
    expect((await request(app).get(api).set(own)).status).toBe(403);
    expect(await RefreshToken.countDocuments({ userId: (await User.findOne({ email: "meena@school.example" }))?._id })).toBe(0);

    expect((await patch(token, id, { isActive: true })).body.data.login).toMatchObject({ isActive: true });
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(200);
  });

  it("cannot open an invitation sent before they left", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, MEENA);
    await patch(token, res.body.data.id, { isActive: false });
    const opened = await acceptLoginInvite(res.body.data.invite.devInviteLink, PASSWORD);
    expect(opened.status).toBe(400);
    expect(opened.body.code).toBe("INVITE_INVALID");
  });

  it("is also closed when their classes are given to another teacher and they are marked as left in the same step", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = await meenaSignedUp(token);
    const other = (await post(token, { name: "Dev Patel" })).body.data.id as string;
    const res = await request(app).post(`/api/v1/timetable/teachers/${id}/replace`).set(auth(token)).send({ withTeacherId: other, deactivate: true });
    expect(res.status).toBe(200);
    const refused = await signIn("meena@school.example", PASSWORD);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("changing a teacher who has a login", () => {
  it("keeps the login's name, phone and email the same as the teacher's", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = await meenaSignedUp(token);
    const res = await patch(token, id, { name: "Meena Rathore", mobile: "9000000001", email: "meena.r@school.example" });
    expect(res.status).toBe(200);
    expect(await User.findOne({ role: "teacher" }).lean()).toMatchObject({ name: "Meena Rathore", phone: "9000000001", email: "meena.r@school.example" });
    expect((await signIn("meena.r@school.example", PASSWORD)).status).toBe(200);
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(401);
  });

  it("will not empty the email of a login that is the email, nor give it an email another login has", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = await meenaSignedUp(token);
    const empty = await patch(token, id, { email: "" });
    expect(empty.status).toBe(400);
    expect(details(empty)).toEqual([{ path: "email", message: "Their login is this email: it cannot be left empty" }]);
    const taken = await patch(token, id, { email: "school_admin@sunrisepublicschool.example" });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("LOGIN_EMAIL_TAKEN");
    expect((await teacherById(id))?.email).toBe("meena@school.example");
  });

  it("sends a Pending login's invitation again to a corrected email: the link sent to the wrong one stops working", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { ...MEENA, email: "meena@schol.example" });
    expect((await patch(token, res.body.data.id, { email: "meena@school.example" })).status).toBe(200);
    expect((await acceptLoginInvite(res.body.data.invite.devInviteLink, PASSWORD)).body.code).toBe("INVITE_INVALID");
    expect((await acceptLoginInvite(linkMailedTo("meena@school.example"), PASSWORD)).status).toBe(200);
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(200);
  });

  it("can change a teacher who has no login without touching any login", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, { name: "Dev Patel" })).body.data.id as string;
    expect((await patch(token, id, { name: "Dev Kumar Patel", email: "dev@school.example" })).status).toBe(200);
    expect((await patch(token, id, { email: "" })).status).toBe(200);
    expect(await User.countDocuments({ role: "teacher" })).toBe(0);
  });
});

describe("the list shows who can sign in", () => {
  it("says for each teacher whether they have a login, whether it is Pending and whether it is on; and filters by it", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await meenaSignedUp(token);
    await post(token, { name: "Asha Rao", mobile: "9876500002", email: "asha@school.example", giveLogin: true });
    await post(token, { name: "Dev Patel" });
    const items = (await request(app).get(`${api}?status=all`).set(auth(token))).body.data.items as { name: string; login: unknown }[];
    expect(items.find((t) => t.name === "Meena Singh")?.login).toEqual({ username: null, email: "meena@school.example", isActive: true, pending: false });
    expect(items.find((t) => t.name === "Asha Rao")?.login).toEqual({ username: null, email: "asha@school.example", isActive: true, pending: true });
    expect(items.find((t) => t.name === "Dev Patel")?.login).toBeNull();
    const names = async (login: string) => ((await request(app).get(`${api}?login=${login}`).set(auth(token))).body.data.items as { name: string }[]).map((t) => t.name);
    expect(await names("with")).toEqual(["Meena Singh"]);
    expect(await names("pending")).toEqual(["Asha Rao"]);
    expect(await names("without")).toEqual(["Dev Patel"]);
  });
});

describe("a teacher's own record", () => {
  it("gives the signed-in teacher their own details, and each teacher their own", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await meenaSignedUp(token, { designation: "TGT", subjectIds: [] });
    const dev = await post(token, { name: "Dev Patel", mobile: "9876500000", email: "dev@school.example", giveLogin: true });
    await acceptLoginInvite(dev.body.data.invite.devInviteLink, PASSWORD);
    const meena = (await signIn("meena@school.example", PASSWORD)).body.data.accessToken as string;
    const devToken = (await signIn("dev@school.example", PASSWORD)).body.data.accessToken as string;

    const mine = await request(app).get(`${api}/me`).set(auth(meena));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toMatchObject({ name: "Meena Singh", designation: "TGT", login: { email: "meena@school.example", isActive: true }, load: { sections: 0, periodsAllotted: 0 } });
    expect((await request(app).get(`${api}/me`).set(auth(devToken))).body.data.name).toBe("Dev Patel");
  });

  it("is a 404 for a login that is not tied to a teacher of the school, and 403 for everyone who is not a teacher", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const orphan = await addColleague(tenantId, "teacher");
    const principal = await addColleague(tenantId, "principal");
    expect((await request(app).get(`${api}/me`).set(auth(orphan))).status).toBe(404);
    expect((await request(app).get(`${api}/me`).set(auth(token))).status).toBe(403);
    expect((await request(app).get(`${api}/me`).set(auth(principal))).status).toBe(403);
    expect((await request(app).get(`${api}/me`)).status).toBe(401);
  });
});
