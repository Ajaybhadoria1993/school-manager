import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { env } from "../../../config/env";
import { hashPassword } from "../../../utils/authUtils";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { Tenant } from "../../tenants/models/Tenant";
import { createTenant } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";

/**
 * A person who signs in with a username instead of an email (a teacher: many have no email, and the mobile app will take the same two
 * boxes). The email, when there is one, still works exactly as before.
 */

const PASSWORD = "Teach3r@Pass";
const login = (identifier: string, password = PASSWORD, extra: Record<string, unknown> = {}) =>
  request(app).post("/api/v1/auth/login").send({ identifier, password, ...extra });

async function teacherWithUsername(username = "meena.singh", extra: Record<string, unknown> = {}) {
  const tenant = await createTenant({ name: `Sunrise Public School ${username}`, contactEmail: `admin.${username}@sunrise.example`, approvalStatus: "approved", source: "invite" });
  return User.create({ name: "Meena Singh", username, passwordHash: await hashPassword(PASSWORD), role: "teacher", tenantId: tenant._id, ...extra });
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("signing in with a username", () => {
  it("opens a session for a user who has a username and no email, and the app can ask for its own kind of session", async () => {
    await teacherWithUsername();
    const res = await login("meena.singh", PASSWORD, { device: "android" });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ name: "Meena Singh", username: "meena.singh", email: null, role: "teacher" });
    expect(res.body.data.tenant).toMatchObject({ approvalStatus: "approved" });
    expect(res.body.data.accessToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect((await User.findOne({ username: "meena.singh" }))?.lastLoginAt).toBeTruthy();
  });

  it("does not mind capital letters or spaces round the username", async () => {
    await teacherWithUsername();
    expect((await login("  Meena.Singh ")).status).toBe(200);
  });

  it("still signs in with an email, under the new name of the box and under the old one", async () => {
    await teacherWithUsername("meena.singh", { email: "meena@school.example" });
    expect((await login("meena@school.example")).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/login").send({ email: "meena@school.example", password: PASSWORD })).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/login").send({ email: "meena.singh", password: PASSWORD })).status).toBe(200);
    expect((await login("superadmin@example.com", "Admin@123")).status).toBe(200);
  });

  it("answers a wrong password and an unknown username in the same words", async () => {
    await teacherWithUsername();
    const wrong = await login("meena.singh", "Wrong@1234");
    const unknown = await login("nobody.here", "Wrong@1234");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("blocks a disabled account, but only after the password is right", async () => {
    await teacherWithUsername("meena.singh", { isActive: false });
    const ok = await login("meena.singh");
    expect(ok.status).toBe(403);
    expect(ok.body.code).toBe("ACCOUNT_DISABLED");
    expect((await login("meena.singh", "Wrong@1234")).status).toBe(401);
  });

  it("is refused for a suspended school, like an email", async () => {
    const user = await teacherWithUsername();
    await Tenant.updateOne({ _id: user.tenantId }, { $set: { isActive: false } });
    const res = await login("meena.singh");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TENANT_INACTIVE");
  });

  it("says which box is wrong when it is neither an email nor a username", async () => {
    for (const bad of ["ab", "has space inside", "9starts.with.digit", "x".repeat(300)]) {
      const res = await login(bad);
      expect(res.status, bad).toBe(400);
      expect(res.body.details[0].path).toBe("identifier");
    }
    const old = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email!", password: "x" });
    expect(old.status).toBe(400);
    expect(old.body.details[0].path).toBe("email");
    const none = await request(app).post("/api/v1/auth/login").send({ password: "x" });
    expect(none.status).toBe(400);
    expect(none.body.details[0].path).toBe("identifier");
  });

  it("is not fooled by a MongoDB operator in place of the username", async () => {
    expect((await request(app).post("/api/v1/auth/login").send({ identifier: { $ne: null }, password: "x" })).status).toBe(400);
  });

  it("tells who is signed in by /auth/me, with the username and no email", async () => {
    await teacherWithUsername();
    const token = (await login("meena.singh")).body.data.accessToken as string;
    const me = await request(app).get("/api/v1/auth/me").set({ Authorization: `Bearer ${token}` });
    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({ username: "meena.singh", email: null, role: "teacher" });
  });
});

describe("usernames in the database", () => {
  it("lets any number of people have no email, but not two the same email or the same username", async () => {
    const tenant = await createTenant({ name: "Sunrise Public School", contactEmail: "admin@sunrise.example", approvalStatus: "approved", source: "invite" });
    const person = (extra: Record<string, unknown>) => User.create({ name: "A person", passwordHash: "x", role: "teacher", tenantId: tenant._id, ...extra });
    await person({ username: "first.one" });
    await person({ username: "second.one" });
    await expect(person({ username: "second.one" })).rejects.toThrow(/duplicate key/i);
    await person({ email: "same@school.example" });
    await expect(person({ email: "same@school.example" })).rejects.toThrow(/duplicate key/i);
  });
});

describe("failed sign-ins with a username are counted", () => {
  it("stops repeated wrong passwords for one username, however it is spelt, but not another username", async () => {
    await teacherWithUsername();
    process.env.DISABLE_RATE_LIMIT = "0";
    try {
      const spellings = ["meena.singh", " meena.singh", "MEENA.SINGH", "meena.singh ", "Meena.Singh"];
      expect(spellings).toHaveLength(env.loginRateLimitMax);
      for (const s of spellings) expect((await login(s, "Wrong@1234")).status).toBe(401);
      const blocked = await login(" meena.SINGH ", "Wrong@1234");
      expect(blocked.status).toBe(429);
      expect((await login("someone.else", "Wrong@1234")).status).toBe(401);
    } finally {
      process.env.DISABLE_RATE_LIMIT = "1";
    }
  });
});
