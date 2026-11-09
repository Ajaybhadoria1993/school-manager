import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { AuthToken } from "../../auth/models/AuthToken";
import { PasswordService } from "../../auth/services/password.service";
import { RefreshToken } from "../../auth/models/RefreshToken";
import { ALL_TENANTS } from "../../tenants/plugins/tenantScope";
import { User } from "../../users/models/User";
import { Teacher } from "../models/Teacher";

/**
 * A teacher's own login: the school makes it when the teacher is added (a username and a password), the teacher signs in with it on
 * the login page now and in the mobile app later, and the school can hand out a new password. A teacher who has left cannot sign in.
 */

const api = "/api/v1/staff/teachers";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const post = (token: string, body: object, path = "") => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(token)).send(body);
const signIn = (identifier: string, password: string, device = "web") => request(app).post("/api/v1/auth/login").send({ identifier, password, device });
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

// These tests look across schools on purpose: "nothing was left behind" means in no school.
const teacherCount = () => Teacher.countDocuments().setOptions(ALL_TENANTS);
const teacherById = (id: string) => Teacher.findById(id).setOptions(ALL_TENANTS).lean();

const PASSWORD = "Sch00l@Teach1";
const MEENA = { name: "Meena Singh", mobile: "9876543210", login: { username: "meena.singh", password: PASSWORD } };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("adding a teacher with a login", () => {
  it("makes the teacher and a login together, and never sends the password back", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const res = await post(token, { ...MEENA, email: "Meena@School.Example" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Meena Singh", email: "meena@school.example", login: { username: "meena.singh", isActive: true } });
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const user = await User.findOne({ username: "meena.singh" }).lean();
    expect(user).toMatchObject({ name: "Meena Singh", role: "teacher", phone: "9876543210", email: "meena@school.example", isActive: true });
    expect(String(user?.tenantId)).toBe(tenantId);
    expect(String((await teacherById(res.body.data.id))?.userId)).toBe(String(user?._id));
  });

  it("lets the teacher sign in at once, with the username (and the email), and look at the school's teachers but not change them", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, { ...MEENA, email: "meena@school.example" });

    const session = await signIn("meena.singh", PASSWORD, "android");
    expect(session.status).toBe(200);
    expect(session.body.data.user).toMatchObject({ role: "teacher", username: "meena.singh", email: "meena@school.example" });
    const own = auth(session.body.data.accessToken);
    expect((await request(app).get(api).set(own)).status).toBe(200);
    expect((await post(session.body.data.accessToken, { name: "Sneaky" })).status).toBe(403);
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(200);
  });

  it("works without an email: the username is enough", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, MEENA);
    expect(res.status).toBe(201);
    expect((await User.findOne({ username: "meena.singh" }).lean())?.email).toBeUndefined();
    expect((await signIn("meena.singh", PASSWORD)).status).toBe(200);
  });

  it("needs the teacher's mobile number when a login is made, and nothing else", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { name: "Meena Singh", login: MEENA.login });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([expect.objectContaining({ path: "mobile" })]);
    expect(await teacherCount()).toBe(0);
    expect(await User.countDocuments({ username: "meena.singh" })).toBe(0);
  });

  it("says what is wrong with the username and the password", async () => {
    const { token } = await createSchool("Sunrise Public School");
    for (const username of ["ab", "9meena", "meena singh", "Meena@Singh"]) {
      const res = await post(token, { ...MEENA, login: { username, password: PASSWORD } });
      expect(res.status, username).toBe(400);
      expect(details(res).map((d) => d.path)).toEqual(["login.username"]);
    }
    for (const password of ["short", "alllowercase1!", "NoSpecial1234"]) {
      const res = await post(token, { ...MEENA, login: { username: "meena.singh", password } });
      expect(res.status, password).toBe(400);
      expect(details(res).map((d) => d.path)).toEqual(["login.password"]);
    }
    expect(await teacherCount()).toBe(0);
  });

  it("refuses a username that anyone on the platform has, suggests a free one, and makes no teacher", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    expect((await post(a.token, MEENA)).status).toBe(201);

    const res = await post(b.token, { ...MEENA, name: "Another Meena", mobile: "9876500000" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("USERNAME_TAKEN");
    expect(details(res)).toEqual([expect.objectContaining({ path: "login.username", message: expect.stringMatching(/meena\.singh_\d{2,3}/) })]);
    expect(await Teacher.countDocuments({ tenantId: b.tenantId })).toBe(0);

    // The suggestion really is free.
    const suggestion = details(res)[0].message.match(/meena\.singh_\d{2,3}/)?.[0] ?? "";
    expect((await post(b.token, { ...MEENA, name: "Another Meena", mobile: "9876500000", login: { username: suggestion, password: PASSWORD } })).status).toBe(201);
  });

  it("refuses an email that already has a login, and makes no teacher", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { ...MEENA, email: "school_admin@sunrisepublicschool.example" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LOGIN_EMAIL_TAKEN");
    expect(details(res)).toEqual([expect.objectContaining({ path: "email" })]);
    expect(await teacherCount()).toBe(0);
  });

  it("keeps the school's other rules: a mobile number another teacher has still stops it, and no login is left behind", async () => {
    const { token } = await createSchool("Sunrise Public School");
    expect((await post(token, { name: "First", mobile: "9876543210" })).status).toBe(201);
    const res = await post(token, MEENA);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEACHER_MOBILE_EXISTS");
    expect(await User.countDocuments({ username: "meena.singh" })).toBe(0);
  });

  it("leaves exactly one teacher and one login when two people add the same username at the same moment", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const [one, two] = await Promise.all([
      post(token, MEENA),
      post(token, { ...MEENA, name: "Meena Two", mobile: "9876500001" }),
    ]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    expect(await User.countDocuments({ username: "meena.singh" })).toBe(1);
    expect(await teacherCount()).toBe(1);
  });
});

describe("a login for a teacher who has none", () => {
  it("gives the teacher one, and the teacher can sign in", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, { name: "Meena Singh", mobile: "9876543210" })).body.data.id as string;
    const res = await post(token, { username: "meena.singh", password: PASSWORD }, `/${id}/login`);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id, login: { username: "meena.singh", isActive: true } });
    expect((await signIn("meena.singh", PASSWORD)).status).toBe(200);
  });

  it("is refused for a teacher who has one already, and for one with no mobile number on record", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const has = (await post(token, MEENA)).body.data.id as string;
    const again = await post(token, { username: "meena.two", password: PASSWORD }, `/${has}/login`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("TEACHER_HAS_LOGIN");

    const bare = (await post(token, { name: "Dev Patel" })).body.data.id as string;
    const noMobile = await post(token, { username: "dev.patel", password: PASSWORD }, `/${bare}/login`);
    expect(noMobile.status).toBe(400);
    expect(details(noMobile)).toEqual([expect.objectContaining({ path: "mobile" })]);
  });

  it("answers 404 for another school's teacher before it reads the body, and keeps a teacher out of it", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const colleague = await addColleague(a.tenantId, "teacher");
    const id = (await post(a.token, { name: "Meena Singh", mobile: "9876543210" })).body.data.id as string;
    expect((await post(b.token, { username: "x" }, `/${id}/login`)).status).toBe(404);
    expect((await post(colleague, { username: "meena.singh", password: PASSWORD }, `/${id}/login`)).status).toBe(403);
  });
});

describe("a new password", () => {
  it("is set by the school: the old one stops working, the new one works, and the teacher's sessions end", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, MEENA)).body.data.id as string;
    const session = await signIn("meena.singh", PASSWORD, "android");
    const refreshToken = session.body.data.refreshToken as string;

    const res = await post(token, { password: "N3w@Passw0rd" }, `/${id}/reset-password`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("N3w@Passw0rd");
    expect((await signIn("meena.singh", PASSWORD)).status).toBe(401);
    expect((await signIn("meena.singh", "N3w@Passw0rd")).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken })).status).toBe(401);
  });

  it("must follow the password rules, and needs a teacher who has a login", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, MEENA)).body.data.id as string;
    const weak = await post(token, { password: "weak" }, `/${id}/reset-password`);
    expect(weak.status).toBe(400);
    expect(details(weak).map((d) => d.path)).toEqual(["password"]);

    const bare = (await post(token, { name: "Dev Patel" })).body.data.id as string;
    const none = await post(token, { password: "N3w@Passw0rd" }, `/${bare}/reset-password`);
    expect(none.status).toBe(409);
    expect(none.body.code).toBe("TEACHER_HAS_NO_LOGIN");
  });

  it("is for the school admin and the principal, and for their own school's teachers", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const principal = await addColleague(a.tenantId, "principal");
    const colleague = await addColleague(a.tenantId, "teacher");
    const id = (await post(a.token, MEENA)).body.data.id as string;
    expect((await post(principal, { password: "N3w@Passw0rd" }, `/${id}/reset-password`)).status).toBe(200);
    expect((await post(colleague, { password: "N3w@Passw0rd" }, `/${id}/reset-password`)).status).toBe(403);
    expect((await post(b.token, { password: "N3w@Passw0rd" }, `/${id}/reset-password`)).status).toBe(404);
  });
});

describe("a teacher who has left", () => {
  it("cannot sign in, loses the session they had, and signs in again when brought back", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, MEENA)).body.data.id as string;
    const session = await signIn("meena.singh", PASSWORD, "android");
    const own = auth(session.body.data.accessToken);

    expect((await patch(token, id, { isActive: false })).body.data.login).toMatchObject({ username: "meena.singh", isActive: false });
    const refused = await signIn("meena.singh", PASSWORD);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("ACCOUNT_DISABLED");
    expect((await request(app).get(api).set(own)).status).toBe(403);
    expect(await RefreshToken.countDocuments({ userId: (await User.findOne({ username: "meena.singh" }))?._id })).toBe(0);

    expect((await patch(token, id, { isActive: true })).body.data.login).toMatchObject({ isActive: true });
    expect((await signIn("meena.singh", PASSWORD)).status).toBe(200);
  });

  it("is also closed when their classes are given to another teacher and they are marked as left in the same step", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, MEENA)).body.data.id as string;
    const other = (await post(token, { name: "Dev Patel" })).body.data.id as string;
    const res = await request(app).post(`/api/v1/timetable/teachers/${id}/replace`).set(auth(token)).send({ withTeacherId: other, deactivate: true });
    expect(res.status).toBe(200);
    const refused = await signIn("meena.singh", PASSWORD);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("only the school sets a teacher's password (2026-11-04, the user)", () => {
  it("a teacher with an email cannot reset their own password by the forgot-password email: no link is made", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, { ...MEENA, email: "meena@school.example" });
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "meena@school.example" });
    expect(res.status).toBe(200);
    // The reset is done after the answer (so the answer's time tells nothing): wait for it.
    await PasswordService.idle();
    expect(await AuthToken.countDocuments({ type: "password_reset" })).toBe(0);
    // The school admin still can (their own email).
    const admin = await User.findOne({ tenantId: { $ne: null }, role: "school_admin" }).lean();
    expect((await request(app).post("/api/v1/auth/forgot-password").send({ email: admin?.email })).status).toBe(200);
    await PasswordService.idle();
    expect(await AuthToken.countDocuments({ type: "password_reset" })).toBe(1);
  });
});

describe("changing a teacher who has a login", () => {
  it("keeps the login's name, phone and email the same as the teacher's", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, { ...MEENA, email: "meena@school.example" })).body.data.id as string;
    const res = await patch(token, id, { name: "Meena Rathore", mobile: "9000000001", email: "meena.r@school.example" });
    expect(res.status).toBe(200);
    expect(await User.findOne({ username: "meena.singh" }).lean()).toMatchObject({ name: "Meena Rathore", phone: "9000000001", email: "meena.r@school.example" });
    expect((await signIn("meena.r@school.example", PASSWORD)).status).toBe(200);
    expect((await signIn("meena@school.example", PASSWORD)).status).toBe(401);

    // An empty email takes the email away from the login; the username still opens it.
    await patch(token, id, { email: "" });
    expect((await User.findOne({ username: "meena.singh" }).lean())?.email).toBeUndefined();
    expect((await signIn("meena.singh", PASSWORD)).status).toBe(200);
  });

  it("will not give the login an email another login has", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, MEENA)).body.data.id as string;
    const res = await patch(token, id, { email: "school_admin@sunrisepublicschool.example" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LOGIN_EMAIL_TAKEN");
    expect((await teacherById(id))?.email).toBeNull();
  });

  it("can change a teacher who has no login without touching any login", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, { name: "Dev Patel" })).body.data.id as string;
    expect((await patch(token, id, { name: "Dev Kumar Patel", email: "dev@school.example" })).status).toBe(200);
    expect(await User.countDocuments({ role: "teacher" })).toBe(0);
  });
});

describe("the list shows who can sign in", () => {
  it("says for each teacher whether they have a login and whether it is on", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, MEENA);
    await post(token, { name: "Dev Patel" });
    const items = (await request(app).get(`${api}?status=all`).set(auth(token))).body.data.items as { name: string; login: unknown }[];
    expect(items.find((t) => t.name === "Meena Singh")?.login).toEqual({ username: "meena.singh", isActive: true });
    expect(items.find((t) => t.name === "Dev Patel")?.login).toBeNull();
  });
});

describe("a teacher's own record", () => {
  it("gives the signed-in teacher their own details, and each teacher their own", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, { ...MEENA, designation: "TGT", subjectIds: [] });
    await post(token, { name: "Dev Patel", mobile: "9876500000", login: { username: "dev.patel", password: PASSWORD } });
    const meena = (await signIn("meena.singh", PASSWORD)).body.data.accessToken as string;
    const dev = (await signIn("dev.patel", PASSWORD)).body.data.accessToken as string;

    const mine = await request(app).get(`${api}/me`).set(auth(meena));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toMatchObject({ name: "Meena Singh", designation: "TGT", login: { username: "meena.singh", isActive: true }, load: { sections: 0, periodsAllotted: 0 } });
    expect((await request(app).get(`${api}/me`).set(auth(dev))).body.data.name).toBe("Dev Patel");
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

  it("never shows another school's teacher, even with the same name", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    await post(a.token, MEENA);
    await post(b.token, { name: "Meena Singh", mobile: "9876543210", login: { username: "meena.singh2", password: PASSWORD } });
    const asB = (await signIn("meena.singh2", PASSWORD)).body.data.accessToken as string;
    const mine = await request(app).get(`${api}/me`).set(auth(asB));
    expect(mine.body.data.login.username).toBe("meena.singh2");
  });
});
