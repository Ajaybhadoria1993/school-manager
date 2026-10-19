import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

const { sent } = vi.hoisted(() => ({
  sent: [] as Array<{ to: string; subject: string; html: string; text?: string; devPreview?: string }>,
}));

// No real email in tests: capture what would have been sent.
vi.mock("../../../utils/email", () => ({
  sendEmail: vi.fn(async (message: (typeof sent)[number]) => {
    sent.push(message);
    return { delivered: true };
  }),
  verifySmtp: vi.fn(),
}));

import app from "../../../app";
import { env } from "../../../config/env";
import { hashPassword, hashToken } from "../../../utils/authUtils";
import { requireAuth, requireSuperAdmin } from "../../../middleware/auth";
import { errorHandler } from "../../../middleware/errorHandler";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { Tenant } from "../../tenants/models/Tenant";
import { User } from "../../users/models/User";
import { AuthToken } from "../models/AuthToken";
import { RefreshToken } from "../models/RefreshToken";
import { PasswordService } from "../services/password.service";

const SUPER = { email: "superadmin@example.com", password: "Admin@123" };
const TEACHER_PASSWORD = "Teach3r@Pass";

async function createTeacher(overrides: Record<string, unknown> = {}) {
  return User.create({
    name: "Test Teacher",
    email: "teacher@example.com",
    passwordHash: await hashPassword(TEACHER_PASSWORD),
    role: "teacher",
    tenantId: null,
    ...overrides,
  });
}

async function login(email = SUPER.email, password = SUPER.password, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/auth/login").send({ email, password, ...extra });
}

function resetTokenFromMail(index = sent.length - 1): string {
  const match = /reset-password\?token=([a-f0-9]+)/.exec(sent[index]?.text ?? "");
  if (!match) throw new Error("No reset link in the captured email");
  return match[1];
}

beforeEach(async () => {
  sent.length = 0;
  await seedSuperAdmin();
});

describe("super admin seed", () => {
  it("creates one super admin and is safe to run again", async () => {
    // beforeEach already ran it once.
    const again = await seedSuperAdmin();
    expect(again.status).toBe("exists");

    const users = await User.find({ email: SUPER.email });
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("super_admin");
    expect(users[0].tenantId).toBeNull();
    expect(users[0].isActive).toBe(true);
    expect(users[0].emailVerifiedAt).toBeTruthy();
    expect(users[0].passwordHash).not.toContain(SUPER.password);
  });

  it("only replaces the password when asked, and then signs every session out", async () => {
    await User.updateOne({ email: SUPER.email }, { passwordHash: await hashPassword("Other@1234") });
    expect((await seedSuperAdmin()).status).toBe("exists");
    expect((await login(SUPER.email, "Other@1234")).status).toBe(200);
    expect(await RefreshToken.countDocuments()).toBe(1);

    expect((await seedSuperAdmin({ resetPassword: true })).status).toBe("password_reset");
    expect((await login()).status).toBe(200);
    expect((await login(SUPER.email, "Other@1234")).status).toBe(401);
  });

  it("refuses to take over an email that belongs to a school user", async () => {
    await User.deleteMany({});
    await createTeacher({ email: SUPER.email });
    await expect(seedSuperAdmin()).rejects.toThrow(/already belongs to a teacher/);
  });
});

describe("login", () => {
  it("signs the super admin in and returns a session", async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { user, tenant, accessToken, refreshToken, token } = res.body.data;
    expect(user).toMatchObject({ email: SUPER.email, role: "super_admin", tenantId: null });
    expect(tenant).toBeNull();
    expect(token).toBe(accessToken);
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect((await User.findOne({ email: SUPER.email }))?.lastLoginAt).toBeTruthy();
  });

  it("treats the email case-insensitively", async () => {
    expect((await login("SUPERADMIN@Example.COM")).status).toBe(200);
  });

  it("answers a wrong password and an unknown email identically", async () => {
    const wrongPassword = await login(SUPER.email, "Wrong@1234");
    const unknownEmail = await login("nobody@example.com", "Wrong@1234");
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(wrongPassword.body.message).toBe("Invalid email or password");
  });

  it("blocks a disabled account, but only after the password is right", async () => {
    await createTeacher({ isActive: false });
    const ok = await login("teacher@example.com", TEACHER_PASSWORD);
    expect(ok.status).toBe(403);
    expect(ok.body.code).toBe("ACCOUNT_DISABLED");
    // A wrong password must not reveal that the account exists or is disabled.
    expect((await login("teacher@example.com", "Wrong@1234")).status).toBe(401);
  });

  it("rejects malformed input with 400 and a field list", async () => {
    const res = await login("not-an-email", "x");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.details[0].path).toBe("email");
  });

  it("is not fooled by a MongoDB operator in place of the email", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: { $ne: null }, password: "x" });
    expect(res.status).toBe(400);
  });
});

describe("protected routes", () => {
  it("needs a valid access token", async () => {
    const none = await request(app).get("/api/v1/auth/me");
    expect(none.status).toBe(401);
    expect(none.body.code).toBe("TOKEN_MISSING");

    const garbage = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer not-a-token");
    expect(garbage.status).toBe(401);

    const expired = jwt.sign({ userId: "x", role: "super_admin", tenantId: null }, env.jwtSecret, { expiresIn: -10 });
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${expired}`)).status).toBe(401);
  });

  it("does not accept a refresh token as an access token", async () => {
    const { refreshToken } = (await login()).body.data;
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${refreshToken}`)).status).toBe(401);
  });

  it("returns the current user without any secret", async () => {
    const { accessToken } = (await login()).body.data;
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(SUPER.email);
    expect(res.body.data.tenant).toBeNull();
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("applies a disabled account on the very next request, not when the token expires", async () => {
    await createTeacher();
    const { accessToken } = (await login("teacher@example.com", TEACHER_PASSWORD)).body.data;
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`)).status).toBe(200);

    await User.updateOne({ email: "teacher@example.com" }, { isActive: false });
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_DISABLED");
  });

  it("requireSuperAdmin lets the super admin in and keeps other roles out", async () => {
    const mini = express();
    mini.get("/only-super", requireAuth, requireSuperAdmin, (_req, res) => res.json({ ok: true }));
    mini.use(errorHandler);

    await createTeacher();
    const teacher = (await login("teacher@example.com", TEACHER_PASSWORD)).body.data.accessToken;
    const superAdmin = (await login()).body.data.accessToken;

    const denied = await request(mini).get("/only-super").set("Authorization", `Bearer ${teacher}`);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("FORBIDDEN");
    expect((await request(mini).get("/only-super").set("Authorization", `Bearer ${superAdmin}`)).status).toBe(200);
  });
});

describe("refresh and logout", () => {
  const refresh = (refreshToken: string) => request(app).post("/api/v1/auth/refresh").send({ refreshToken });

  // Pretend the last rotation happened `seconds` ago (the server sets this timestamp itself).
  const rotatedAgo = (seconds: number) =>
    RefreshToken.collection.updateOne({}, { $set: { rotatedAt: new Date(Date.now() - seconds * 1000) } });

  it("rotates the refresh token and ends the session when an old one is replayed", async () => {
    const first = (await login()).body.data;
    const rotated = await refresh(first.refreshToken);
    expect(rotated.status).toBe(200);
    const second = rotated.body.data;
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${second.accessToken}`)).status).toBe(200);

    // Replaying the already-used token once the grace window is over is treated as theft: even the newest token dies.
    await rotatedAgo(env.refreshReuseGraceSeconds + 5);
    const replay = await refresh(first.refreshToken);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("SESSION_EXPIRED");
    expect((await refresh(second.refreshToken)).status).toBe(401);
  });

  it("gives two simultaneous refreshes with the same token the same new token, so neither holder is logged out", async () => {
    const { refreshToken } = (await login()).body.data;
    const [a, b] = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.data.refreshToken).toBe(b.body.data.refreshToken);

    // The shared new token is the one on record (stored hashed, like any other) and carries on.
    expect((await RefreshToken.findOne())?.tokenHash).toBe(hashToken(a.body.data.refreshToken));
    expect((await refresh(a.body.data.refreshToken)).status).toBe(200);
  });

  it("answers a retry after a lost response with the token it never received, but only for the previous token", async () => {
    const first = (await login()).body.data;
    const second = (await refresh(first.refreshToken)).body.data; // this response "got lost"
    const retry = await refresh(first.refreshToken);
    expect(retry.status).toBe(200);
    expect(retry.body.data.refreshToken).toBe(second.refreshToken);

    // Two generations back is a replay even inside the window, and it ends the session.
    const third = (await refresh(second.refreshToken)).body.data;
    expect((await refresh(first.refreshToken)).status).toBe(401);
    expect((await refresh(third.refreshToken)).status).toBe(401);
  });

  it("does not let a new sign-in inherit the grace of an earlier session", async () => {
    const old = (await login()).body.data;
    await refresh(old.refreshToken);
    const current = (await login()).body.data; // same platform: replaces the session
    expect((await refresh(old.refreshToken)).status).toBe(401);
    expect((await refresh(current.refreshToken)).status).toBe(200); // and left the new one alone
  });

  it("logout ends the session, and logging out with junk is harmless", async () => {
    const { refreshToken } = (await login()).body.data;
    expect((await request(app).post("/api/v1/auth/logout").send({ refreshToken })).status).toBe(200);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/logout").send({ refreshToken: "junk" })).status).toBe(200);
  });

  it("keeps one session per platform: web replaces web, app sits beside web", async () => {
    const web1 = (await login()).body.data;
    const ios = (await login(SUPER.email, SUPER.password, { device: "ios" })).body.data;
    const web2 = (await login()).body.data;

    // The first web login was replaced by the second. Its leftover token fails, but must not
    // end the newer session (otherwise signing in on a second browser would log you out there).
    expect((await refresh(web1.refreshToken)).status).toBe(401);
    expect((await refresh(ios.refreshToken)).status).toBe(200); // app session untouched
    expect((await refresh(web2.refreshToken)).status).toBe(200);
    expect(await RefreshToken.countDocuments()).toBe(2);
  });

  it("refuses to refresh for a disabled account and clears its sessions", async () => {
    await createTeacher();
    const { refreshToken } = (await login("teacher@example.com", TEACHER_PASSWORD)).body.data;
    await User.updateOne({ email: "teacher@example.com" }, { isActive: false });
    expect((await refresh(refreshToken)).status).toBe(401);
    expect(await RefreshToken.countDocuments({ userId: (await User.findOne({ email: "teacher@example.com" }))!._id })).toBe(0);
  });

  it("stores only a hash of the refresh token", async () => {
    const { refreshToken } = (await login()).body.data;
    const row = await RefreshToken.findOne();
    expect(row?.tokenHash).toBe(hashToken(refreshToken));
    expect(JSON.stringify(row)).not.toContain(refreshToken);
  });
});

describe("forgot and reset password", () => {
  // The reset is prepared after the answer is sent (so every email takes the same time): wait for it.
  const forgot = async (email: string) => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email });
    await PasswordService.idle();
    return res;
  };
  // Pretend the last link was requested `seconds` ago (the server sets createdAt itself).
  const linkRequestedAgo = (seconds: number) =>
    AuthToken.collection.updateMany({ type: "password_reset" }, { $set: { createdAt: new Date(Date.now() - seconds * 1000) } });
  const reset = (token: string, newPassword: string) =>
    request(app).post("/api/v1/auth/reset-password").send({ token, newPassword });

  it("answers the same whether or not the email has an account, and mails only real accounts", async () => {
    const real = await forgot(SUPER.email);
    const fake = await forgot("nobody@example.com");
    expect(real.status).toBe(200);
    expect(fake.status).toBe(200);
    expect(fake.body).toEqual(real.body);
    expect(real.body.data.ttlMinutes).toBe(env.passwordResetTtlMinutes);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(SUPER.email);
    expect(sent[0].text).toContain(`${env.clientUrls[0]}/reset-password?token=`);
  });

  it("sends no link to a disabled account", async () => {
    await createTeacher({ isActive: false });
    expect((await forgot("teacher@example.com")).status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(await AuthToken.countDocuments()).toBe(0);
  });

  it("sends nothing for a second request inside the cooldown, so the form cannot flood an inbox or kill a live link", async () => {
    await forgot(SUPER.email);
    const link = resetTokenFromMail();
    expect((await forgot(SUPER.email)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect((await reset(link, "New@Pass123")).status).toBe(200); // the first link still works
  });

  it("keeps only the newest link and stores it hashed", async () => {
    await forgot(SUPER.email);
    const first = resetTokenFromMail();
    await linkRequestedAgo(120);
    await forgot(SUPER.email);
    const second = resetTokenFromMail();

    expect(await AuthToken.countDocuments()).toBe(1);
    expect((await AuthToken.findOne())?.tokenHash).toBe(hashToken(second));
    expect((await reset(first, "New@Pass123")).body.code).toBe("RESET_INVALID");
    expect((await reset(second, "New@Pass123")).status).toBe(200);
  });

  it("sets the new password, signs this device in and kills every older session", async () => {
    const before = (await login()).body.data;
    // An access token minted a minute ago, i.e. before the reset.
    const oldAccess = jwt.sign(
      { userId: before.user.id, role: "super_admin", tenantId: null, iat: Math.floor(Date.now() / 1000) - 60 },
      env.jwtSecret,
      { expiresIn: "15m" }
    );
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${oldAccess}`)).status).toBe(200);

    await forgot(SUPER.email);
    const res = await reset(resetTokenFromMail(), "New@Pass123");
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(SUPER.email);

    expect((await login()).status).toBe(401); // old password
    expect((await login(SUPER.email, "New@Pass123")).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: before.refreshToken })).status).toBe(401);
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${oldAccess}`)).status).toBe(401);
    expect(
      (await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${res.body.data.accessToken}`)).status
    ).toBe(200);
  });

  it("works exactly once, even if used twice at the same moment", async () => {
    await forgot(SUPER.email);
    const token = resetTokenFromMail();
    const results = await Promise.all([reset(token, "New@Pass123"), reset(token, "Other@Pass123")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await reset(token, "Third@Pass123")).body.code).toBe("RESET_INVALID");
  });

  it("changes the password of a suspended school's user but does not sign them in", async () => {
    const tenant = await Tenant.create({
      name: "Suspended School",
      nameKey: "suspended school",
      slug: "suspended-school",
      contactEmail: "admin@suspended.example",
      approvalStatus: "approved",
      isActive: false,
    });
    await createTeacher({ tenantId: tenant._id });
    await forgot("teacher@example.com");
    const res = await reset(resetTokenFromMail(), "New@Pass123");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TENANT_INACTIVE");
    expect(await RefreshToken.countDocuments()).toBe(0);

    await Tenant.updateOne({ _id: tenant._id }, { isActive: true });
    expect((await login("teacher@example.com", "New@Pass123")).status).toBe(200); // the new password did take
  });

  it("rejects an unknown or expired token", async () => {
    expect((await reset("0".repeat(64), "New@Pass123")).body.code).toBe("RESET_INVALID");

    const user = (await User.findOne({ email: SUPER.email }))!;
    const raw = "a".repeat(64);
    await AuthToken.create({
      type: "password_reset",
      tokenHash: hashToken(raw),
      userId: user._id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await reset(raw, "New@Pass123")).body.code).toBe("RESET_INVALID");
  });

  it("does not burn the link when the new password is too weak", async () => {
    await forgot(SUPER.email);
    const token = resetTokenFromMail();
    const weak = await reset(token, "weak");
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe("VALIDATION_ERROR");
    expect((await reset(token, "Strong@Pass1")).status).toBe(200);
  });
});

describe("rate limiting", () => {
  const withLimits = async (run: () => Promise<void>) => {
    process.env.DISABLE_RATE_LIMIT = "0";
    try {
      await run();
    } finally {
      process.env.DISABLE_RATE_LIMIT = "1";
    }
  };

  it("counts ' a@x.com', 'a@x.com ' and 'A@X.com' as the same account", async () => {
    await withLimits(async () => {
      const spellings = [" padded@example.com", "padded@example.com ", "PADDED@example.com", "\tpadded@example.com", "padded@example.com\n"];
      expect(spellings).toHaveLength(env.loginRateLimitMax);
      for (const email of spellings) expect((await login(email, "Wrong@1234")).status).toBe(401);
      const blocked = await login("  padded@example.com  ", "Wrong@1234");
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe("RATE_LIMITED");
    });
  });

  it("gives each public endpoint its own allowance", async () => {
    await withLimits(async () => {
      // Many more refreshes than "forgot password" allows must not use up the forgot-password allowance.
      for (let i = 0; i < 12; i++) {
        expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: "junk" })).status).toBe(401);
      }
      expect((await request(app).post("/api/v1/auth/forgot-password").send({ email: "nobody@example.com" })).status).toBe(200);
    });
  });

  it("stops repeated failed logins for one email, but not other emails", async () => {
    process.env.DISABLE_RATE_LIMIT = "0";
    try {
      const attempt = (email: string) => login(email, "Wrong@1234");
      for (let i = 0; i < env.loginRateLimitMax; i++) {
        expect((await attempt("victim@example.com")).status).toBe(401);
      }
      const blocked = await attempt("victim@example.com");
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe("RATE_LIMITED");
      expect((await attempt("someone-else@example.com")).status).toBe(401);
    } finally {
      process.env.DISABLE_RATE_LIMIT = "1";
    }
  });

  // Keep this one last in the block: it uses up this address's whole login allowance (the counters
  // live for the whole test file).
  it("stops one address spraying guesses over many different emails", async () => {
    await withLimits(async () => {
      const results: number[] = [];
      for (let i = 0; i < env.loginRateLimitMax * 3 + 3; i++) {
        results.push((await login(`spray${i}@example.com`, "Wrong@1234")).status);
      }
      const firstBlock = results.indexOf(429);
      expect(firstBlock).toBeGreaterThan(0);
      expect(new Set(results.slice(0, firstBlock))).toEqual(new Set([401]));
    });
  });
});

describe("app basics", () => {
  it("serves health, JSON 404s and JSON 400s for bad bodies", async () => {
    expect((await request(app).get("/health")).body.status).toBe("ok");

    const missing = await request(app).get("/api/v1/nope");
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);

    const badJson = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send("{oops");
    expect(badJson.status).toBe(400);
    expect(badJson.body.code).toBe("INVALID_JSON");
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
