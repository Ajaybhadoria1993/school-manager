import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { AuthToken } from "../../auth/models/AuthToken";
import { PasswordService } from "../../auth/services/password.service";
import { User } from "../../users/models/User";
import { StaffMember } from "../models/StaffMember";

/**
 * Staff (2026-11-08, the user): the school makes the person's **username and password** when it adds them, as it does for a teacher or a
 * parent. There is no invitation email for staff (that stays for the school admin only): the person signs in with the username (or the email,
 * when one was given) and the password the school gave.
 */

const api = "/api/v1/staff/members";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const add = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);
const list = (token: string, query = "") => request(app).get(`${api}${query}`).set(auth(token));
const patch = (token: string, id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const login = (identifier: string, password = PASSWORD) => request(app).post("/api/v1/auth/login").send({ identifier, password });

const PASSWORD = "Recep@Desk1";
const ASHA = { name: "Asha Rao", role: "receptionist", mobile: "9876543210", login: { username: "asha.rao_41", password: PASSWORD } };

/** A school and its admin, who adds Asha. */
async function school(extra: Record<string, unknown> = {}) {
  const s = await createSchool("Sunrise Public School");
  const res = await add(s.token, { ...ASHA, ...extra });
  return { s, res, id: res.body.data?.id as string };
}

/** A person added before the school made logins itself (an invitation that was never accepted): no login yet. */
async function withoutLogin(tenantId: string, over: Record<string, unknown> = {}) {
  const made = await StaffMember.create({ tenantId, name: "Ravi Menon", nameKey: nameKeyOf("Ravi Menon"), email: "ravi@school.example", role: "librarian", status: "invited", ...over });
  return made._id.toString();
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("adding a staff member", () => {
  it("makes the login at once: the person is active and signs in with the username and the password the school gave", async () => {
    const { s, res } = await school({ gender: "Female", dateOfBirth: "1992-03-09", designation: "Front desk", employeeCode: "st-01", joiningDate: "2026-04-01", address: { line1: "5 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" } });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Asha Rao",
      role: "receptionist",
      roleLabel: "Receptionist",
      email: null,
      mobile: "9876543210",
      status: "active",
      login: { username: "asha.rao_41", isActive: true },
      gender: "Female",
      dateOfBirth: "1992-03-09",
      designation: "Front desk",
      employeeCode: "ST-01",
      joiningDate: "2026-04-01",
      address: { line1: "5 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
    });
    // No invitation and no email: nothing of that sort in the answer.
    expect(res.body.data).not.toHaveProperty("devInviteLink");
    expect(res.body.data).not.toHaveProperty("emailSent");
    // The password is never given back.
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    expect(await AuthToken.countDocuments({})).toBe(0);

    const user = await User.findOne({ username: "asha.rao_41" }).lean();
    expect(user).toMatchObject({ role: "receptionist", roleLabel: "Receptionist", isActive: true, phone: "9876543210" });
    expect(String(user?.tenantId)).toBe(s.tenantId);
    const signed = await login("asha.rao_41");
    expect(signed.status).toBe(200);
    expect(signed.body.data.user).toMatchObject({ role: "receptionist", name: "Asha Rao" });
    expect((await login("asha.rao_41", "Wrong@Pass1")).status).toBe(401);
  });

  it("an email is optional; when it is given it is a way in too (in any case), and kept in lower case", async () => {
    const s = await createSchool("Sunrise Public School");
    const bare = await add(s.token, ASHA);
    expect(bare.body.data.email).toBeNull();
    expect((await User.findOne({ username: "asha.rao_41" }).lean())?.email).toBeUndefined();

    const mailed = await add(s.token, { ...ASHA, name: "Ravi Menon", email: "Ravi.Menon@School.Example", login: { username: "ravi.menon_52", password: PASSWORD } });
    expect(mailed.status).toBe(201);
    expect(mailed.body.data.email).toBe("ravi.menon@school.example");
    expect((await login("ravi.menon@school.example")).status).toBe(200);
    expect((await login("ravi.menon_52")).status).toBe(200);
  });

  it("needs a name, a role the school has, and a username and a password", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["teacher", "parent", "school_admin", "super_admin", "student", "nonsense"]) {
      const res = await add(s.token, { ...ASHA, role });
      expect(res.status, role).toBe(400);
      expect(details(res)[0].path, role).toBe("role");
    }
    const bare = await add(s.token, { role: "management" });
    expect(bare.status).toBe(400);
    expect(details(bare).map((d) => d.path).sort()).toEqual(["login", "name"]);
    expect(details(await add(s.token, { ...ASHA, login: { username: "a b", password: PASSWORD } }))[0].path).toBe("login.username");
    expect(details(await add(s.token, { ...ASHA, login: { username: "asha.rao_41", password: "weak" } }))[0].path).toBe("login.password");
    expect(details(await add(s.token, { ...ASHA, email: "not-an-email" }))[0].path).toBe("email");
    expect(details(await add(s.token, { ...ASHA, mobile: "12345" }))[0].path).toBe("mobile");
    expect(await StaffMember.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect(await User.countDocuments({ username: "asha.rao_41" })).toBe(0);
  });

  it("refuses a username somebody has in any school (with free ones like it) and an email that is a login; nothing is made", async () => {
    const a = await school();
    const other = await createSchool("Moonrise Public School");
    const taken = await add(other.token, { ...ASHA, name: "Another" });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("USERNAME_TAKEN");
    expect(details(taken)[0].path).toBe("login.username");
    expect(details(taken)[0].message).toContain("for example");
    expect(await StaffMember.countDocuments({ tenantId: other.tenantId })).toBe(0);

    await add(a.s.token, { ...ASHA, name: "Ravi", email: "ravi@school.example", login: { username: "ravi_20", password: PASSWORD } });
    const mailTaken = await add(a.s.token, { ...ASHA, name: "Kabir", email: "RAVI@school.example", login: { username: "kabir_20", password: PASSWORD } });
    expect(mailTaken.status).toBe(409);
    expect(details(mailTaken)[0].path).toBe("email");
    // Asha and Ravi: Kabir was refused and nothing of him was made.
    expect(await StaffMember.countDocuments({ tenantId: a.s.tenantId })).toBe(2);
    expect(await User.countDocuments({ username: "kabir_20" })).toBe(0);
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
    const again = await add(s.token, { ...ASHA, name: "Ravi", login: { username: "ravi_20", password: PASSWORD }, employeeCode: "st-01" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("STAFF_CODE_EXISTS");
    expect(details(again)[0].path).toBe("employeeCode");
    expect(await User.countDocuments({ username: "ravi_20" })).toBe(0);
  });
});

describe("the list of staff", () => {
  it("shows everyone with their status, filtered by status, role and search (name, email, username, code), with the counts of each status", async () => {
    const s = await createSchool("Sunrise Public School");
    const asha = await add(s.token, ASHA);
    await add(s.token, { name: "Ravi Menon", role: "management", email: "ravi@school.example", login: { username: "ravi.menon_52", password: PASSWORD } });
    await add(s.token, { name: "Sunita Bose", role: "accountant", employeeCode: "AC-9", login: { username: "sunita.bose_17", password: PASSWORD } });
    await patch(s.token, asha.body.data.id, { isActive: false });
    await withoutLogin(s.tenantId, { name: "Zoya Khan", nameKey: nameKeyOf("Zoya Khan"), email: null });
    const all = await list(s.token);
    expect(all.body.data.items.map((m: { name: string }) => m.name)).toEqual(["Asha Rao", "Ravi Menon", "Sunita Bose", "Zoya Khan"]);
    expect(all.body.data.counts).toEqual({ active: 2, invited: 1, inactive: 1 });
    const names = async (q: string) => (await list(s.token, q)).body.data.items.map((m: { name: string }) => m.name);
    expect(await names("?status=inactive")).toEqual(["Asha Rao"]);
    expect(await names("?status=invited")).toEqual(["Zoya Khan"]);
    expect(await names("?role=management")).toEqual(["Ravi Menon"]);
    expect(await names("?search=sunita")).toEqual(["Sunita Bose"]);
    expect(await names("?search=ravi%40school")).toEqual(["Ravi Menon"]);
    expect(await names("?search=bose_17")).toEqual(["Sunita Bose"]);
    expect(await names("?search=ac-9")).toEqual(["Sunita Bose"]);
    expect((await list(s.token, "?status=everyone")).status).toBe(400);
    const zoya = all.body.data.items.find((m: { name: string }) => m.name === "Zoya Khan");
    expect(zoya.login).toBeNull();
    expect(all.body.data.items[0].login).toEqual({ username: "asha.rao_41", isActive: false });
  });

  it("holds the caller's school only", async () => {
    const a = await school();
    const b = await createSchool("Moonrise Public School");
    await add(b.token, { name: "Kabir Khan", role: "management", login: { username: "kabir.khan_30", password: PASSWORD } });
    expect((await list(a.s.token)).body.data.items.map((m: { name: string }) => m.name)).toEqual(["Asha Rao"]);
    expect((await list(b.token)).body.data.items.map((m: { name: string }) => m.name)).toEqual(["Kabir Khan"]);
    expect((await request(app).get(`${api}/${a.id}`).set(auth(b.token))).status).toBe(404);
    expect((await patch(b.token, a.id, { name: "Hacked" })).status).toBe(404);
    expect((await request(app).delete(`${api}/${a.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).post(`${api}/${a.id}/login`).set(auth(b.token)).send({ username: "hacker_10", password: PASSWORD })).status).toBe(404);
    expect((await request(app).post(`${api}/${a.id}/reset-password`).set(auth(b.token)).send({ password: PASSWORD })).status).toBe(404);
    expect((await StaffMember.findOne({ _id: a.id, tenantId: a.s.tenantId }).lean())?.name).toBe("Asha Rao");
  });
});

describe("a staff member who works here", () => {
  it("can be made inactive (their login closes at once) and active again", async () => {
    const { s, id } = await school();
    const off = await patch(s.token, id, { isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.status).toBe("inactive");
    expect(off.body.data.login.isActive).toBe(false);
    expect((await login("asha.rao_41")).status).toBe(403);
    const on = await patch(s.token, id, { isActive: true });
    expect(on.body.data.status).toBe("active");
    expect((await login("asha.rao_41")).status).toBe(200);
  });

  it("has details, a role and an email that can be changed (the login follows); an email somebody else has is refused", async () => {
    const { s, id } = await school({ email: "asha.rao@school.example" });
    await add(s.token, { name: "Ravi", role: "management", email: "ravi@school.example", login: { username: "ravi_20", password: PASSWORD } });
    const res = await patch(s.token, id, { name: "Asha Rao Verma", role: "management", designation: "Front office", email: "asha.verma@school.example" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Asha Rao Verma", role: "management", roleLabel: "Management", designation: "Front office", email: "asha.verma@school.example" });
    const user = await User.findOne({ username: "asha.rao_41" }).lean();
    expect(user).toMatchObject({ role: "management", name: "Asha Rao Verma", email: "asha.verma@school.example" });
    expect((await login("asha.verma@school.example")).status).toBe(200);
    expect((await login("asha.rao@school.example")).status).toBe(401);
    const taken = await patch(s.token, id, { email: "RAVI@school.example" });
    expect(taken.status).toBe(409);
    expect(details(taken)[0].path).toBe("email");
    // An empty email takes it away: the username still opens the login.
    const none = await patch(s.token, id, { email: "" });
    expect(none.body.data.email).toBeNull();
    expect((await login("asha.rao_41")).status).toBe(200);
    expect((await patch(s.token, id, { role: "teacher" })).status).toBe(400);
    expect((await patch(s.token, id, {})).status).toBe(400);
  });

  it("with their role they reach what the role is for and nothing of the people who run the school", async () => {
    const { s } = await school();
    const asha = (await login("asha.rao_41")).body.data.accessToken as string;
    expect((await request(app).get("/api/v1/classroom/calendar?year=2026").set(auth(asha))).status).not.toBe(403);
    expect((await list(asha)).status).toBe(403);
    expect((await request(app).get("/api/v1/staff/teachers").set(auth(asha))).status).toBe(403);
    expect((await request(app).post("/api/v1/staff/teachers").set(auth(asha)).send({ name: "Sneaky" })).status).toBe(403);
    expect((await request(app).get("/api/v1/academics/structure").set(auth(asha))).status).toBe(403);
    expect(s.tenantId).toBeTruthy();
  });

  it("the school gives a new password: the old one stops, the new one works, and the sessions they had end", async () => {
    const { s, id } = await school();
    const before = (await login("asha.rao_41")).body.data.accessToken as string;
    // Tokens are compared with the change in whole seconds: let one pass between the token and the new password.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await request(app).post(`${api}/${id}/reset-password`).set(auth(s.token)).send({ password: "weak" })).status).toBe(400);
    const res = await request(app).post(`${api}/${id}/reset-password`).set(auth(s.token)).send({ password: "New@Desk123" });
    expect(res.status).toBe(200);
    expect((await login("asha.rao_41", PASSWORD)).status).toBe(401);
    expect((await login("asha.rao_41", "New@Desk123")).status).toBe(200);
    expect((await request(app).get("/api/v1/classroom/calendar?year=2026").set(auth(before))).status).toBe(401);
  });

  it("the school can change the username: the new one opens the login, the old one does not, and a taken one is refused with free ones", async () => {
    const { s, id } = await school();
    await add(s.token, { name: "Ravi", role: "management", login: { username: "ravi_20", password: PASSWORD } });
    const taken = await request(app).patch(`${api}/${id}/login`).set(auth(s.token)).send({ username: "ravi_20" });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("USERNAME_TAKEN");
    const ok = await request(app).patch(`${api}/${id}/login`).set(auth(s.token)).send({ username: "asha.verma_77" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.login.username).toBe("asha.verma_77");
    expect((await login("asha.verma_77")).status).toBe(200);
    expect((await login("asha.rao_41")).status).toBe(401);
    expect((await request(app).patch(`${api}/${id}/login`).set(auth(s.token)).send({ username: "A B" })).status).toBe(400);
  });

  it("only the school sets their password: the forgot-password email sends them nothing, whether or not they have an email", async () => {
    await school({ email: "asha.rao@school.example" });
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "asha.rao@school.example" });
    expect(res.status).toBe(200);
    await PasswordService.idle();
    expect(await AuthToken.countDocuments({ type: "password_reset" })).toBe(0);
  });

  it("cannot be removed (they have a login): they are made inactive instead", async () => {
    const { s, id } = await school();
    const res = await request(app).delete(`${api}/${id}`).set(auth(s.token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });
});

describe("a person with no login yet (added before the school made logins itself)", () => {
  it("shows no login, and is given one: the same checks, the role they had, active from then on", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await withoutLogin(s.tenantId);
    const shown = (await request(app).get(`${api}/${id}`).set(auth(s.token))).body.data;
    expect(shown).toMatchObject({ status: "invited", login: null, roleLabel: "Librarian" });
    expect((await request(app).post(`${api}/${id}/login`).set(auth(s.token)).send({ username: "ravi.menon_52", password: "weak" })).status).toBe(400);
    expect((await patch(s.token, id, { isActive: false })).status).toBe(409);

    const made = await request(app).post(`${api}/${id}/login`).set(auth(s.token)).send({ username: "ravi.menon_52", password: PASSWORD });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ status: "active", login: { username: "ravi.menon_52", isActive: true } });
    const signed = await login("ravi.menon_52");
    expect(signed.body.data.user).toMatchObject({ role: "staff", roleLabel: "Librarian" });
    expect((await login("ravi@school.example")).status).toBe(200);

    const again = await request(app).post(`${api}/${id}/login`).set(auth(s.token)).send({ username: "ravi.other_10", password: PASSWORD });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("STAFF_HAS_LOGIN");
  });

  it("is refused a username somebody has", async () => {
    const { s } = await school();
    const id = await withoutLogin(s.tenantId);
    const taken = await request(app).post(`${api}/${id}/login`).set(auth(s.token)).send({ username: "asha.rao_41", password: PASSWORD });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("USERNAME_TAKEN");
    expect(await User.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("can be removed (nobody has a login to close); one with a login cannot", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await withoutLogin(s.tenantId);
    expect((await request(app).delete(`${api}/${id}`).set(auth(s.token))).status).toBe(200);
    expect((await list(s.token)).body.data.items).toEqual([]);
    // Its email is free again.
    expect((await add(s.token, { ...ASHA, email: "ravi@school.example" })).status).toBe(201);
  });

  it("an email already on a person with no login is refused for a new one", async () => {
    const s = await createSchool("Sunrise Public School");
    await withoutLogin(s.tenantId);
    const res = await add(s.token, { ...ASHA, email: "RAVI@school.example" });
    expect(res.status).toBe(409);
    expect(details(res)[0].path).toBe("email");
  });
});
