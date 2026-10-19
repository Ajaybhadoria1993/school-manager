import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const { sent } = vi.hoisted(() => ({
  sent: [] as Array<{ to: string; subject: string; html: string; text?: string; devPreview?: string }>,
}));

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
import { sendEmail } from "../../../utils/email";
import { requireAuth, requireAuthLoose } from "../../../middleware/auth";
import { errorHandler } from "../../../middleware/errorHandler";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { AuthToken } from "../../auth/models/AuthToken";
import { RefreshToken } from "../../auth/models/RefreshToken";
import { User } from "../../users/models/User";
import { Tenant } from "../models/Tenant";

const SUPER = { email: "superadmin@example.com", password: "Admin@123" };
const ADMIN_PASSWORD = "Sch00l@Admin";

const school = { schoolName: "Sunrise Public School", contactEmail: "principal@sunrise.example" };

async function superToken(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send(SUPER);
  return res.body.data.accessToken;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function invite(body: Record<string, unknown> = school, token?: string) {
  return request(app)
    .post("/api/v1/tenants/invite")
    .set(auth(token ?? (await superToken())))
    .send(body);
}

function inviteTokenFromMail(index = sent.length - 1): string {
  const match = /accept-invite\?token=([a-f0-9]+)/.exec(sent[index]?.text ?? "");
  if (!match) throw new Error("No invitation link in the captured email");
  return match[1];
}

const accept = (token: string, body: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/v1/auth/accept-invite")
    .send({ token, name: "Asha Verma", password: ADMIN_PASSWORD, ...body });

/** Invites a school and accepts it: returns the school admin's session. */
async function onboardedSchoolAdmin(body: Record<string, unknown> = school) {
  const res = await invite(body);
  const raw = inviteTokenFromMail();
  const session = await accept(raw);
  return { tenantId: res.body.data.tenant.id as string, raw, session: session.body.data };
}

beforeEach(async () => {
  sent.length = 0;
  vi.mocked(sendEmail).mockClear();
  await seedSuperAdmin();
});

describe("inviting a school", () => {
  it("creates the school as invited and emails a one-time link to the admin", async () => {
    const res = await invite();
    expect(res.status).toBe(201);
    expect(res.body.data.tenant).toMatchObject({
      name: school.schoolName,
      slug: "sunrise-public-school",
      approvalStatus: "invited",
      isActive: true,
      contactEmail: school.contactEmail,
      adminEmail: null,
    });
    expect(res.body.data.emailSent).toBe(true);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(school.contactEmail);
    expect(sent[0].subject).toContain(school.schoolName);
    expect(sent[0].text).toContain(`${env.clientUrls[0]}/accept-invite?token=`);
    // With no SMTP configured (dev/test) the link is also returned, never in production.
    expect(res.body.data.devInviteLink).toBe(`${env.clientUrls[0]}/accept-invite?token=${inviteTokenFromMail()}`);
  });

  it("stores only a hash of the link token, valid for the configured number of hours", async () => {
    await invite();
    const raw = inviteTokenFromMail();
    const row = await AuthToken.findOne({ type: "school_invite" });
    expect(row?.tokenHash).toBe(hashToken(raw));
    expect(JSON.stringify(row)).not.toContain(raw);
    const hoursLeft = (row!.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(env.inviteTokenTtlHours - 0.1);
    expect(hoursLeft).toBeLessThanOrEqual(env.inviteTokenTtlHours);
  });

  it("normalises the email and gives schools with look-alike names different addresses", async () => {
    const first = await invite({ schoolName: "A-B School", contactEmail: "  First@Example.COM " });
    const second = await invite({ schoolName: "A B School", contactEmail: "second@example.com" });
    expect(first.body.data.tenant.contactEmail).toBe("first@example.com");
    expect(first.body.data.tenant.slug).toBe("a-b-school");
    expect(second.body.data.tenant.slug).toBe("a-b-school-2");
  });

  it("refuses a duplicate school name, whatever the case or spacing", async () => {
    await invite();
    const res = await invite({ schoolName: "SUNRISE   public school", contactEmail: "other@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHOOL_EXISTS");
  });

  it("refuses an email that already has an account or an open invitation", async () => {
    const own = await invite({ schoolName: "Another School", contactEmail: SUPER.email });
    expect(own.status).toBe(409);
    expect(own.body.code).toBe("EMAIL_IN_USE");

    await invite();
    const again = await invite({ schoolName: "Different School", contactEmail: school.contactEmail });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("EMAIL_IN_USE");
    expect(await Tenant.countDocuments()).toBe(1);
  });

  it("validates the input", async () => {
    expect((await invite({ schoolName: "A", contactEmail: school.contactEmail })).status).toBe(400);
    expect((await invite({ schoolName: "Good Name", contactEmail: "not-an-email" })).status).toBe(400);
    expect((await invite({ schoolName: "Good Name", contactEmail: school.contactEmail, subscriptionTier: "gold" })).status).toBe(400);
  });

  it("keeps the school and reports emailSent:false when the mail server fails, then resend works", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("smtp down"));
    const res = await invite();
    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(false);
    expect(await Tenant.countDocuments()).toBe(1);

    const resend = await request(app)
      .post(`/api/v1/tenants/${res.body.data.tenant.id}/resend-invite`)
      .set(auth(await superToken()));
    expect(resend.status).toBe(200);
    expect(resend.body.data.emailSent).toBe(true);
  });
});

describe("who may manage invitations", () => {
  it("needs a signed-in super admin", async () => {
    expect((await request(app).post("/api/v1/tenants/invite").send(school)).status).toBe(401);
    expect((await request(app).get("/api/v1/tenants")).status).toBe(401);

    await User.create({
      name: "T",
      email: "teacher@example.com",
      passwordHash: await hashPassword("Teach3r@Pass"),
      role: "teacher",
      tenantId: null,
    });
    const teacher = (await request(app).post("/api/v1/auth/login").send({ email: "teacher@example.com", password: "Teach3r@Pass" })).body.data
      .accessToken;

    for (const res of [
      await request(app).post("/api/v1/tenants/invite").set(auth(teacher)).send(school),
      await request(app).get("/api/v1/tenants").set(auth(teacher)),
      await request(app).post("/api/v1/tenants/000000000000000000000000/resend-invite").set(auth(teacher)),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect(await Tenant.countDocuments()).toBe(0);
  });

  it("a school admin cannot invite schools either", async () => {
    const { session } = await onboardedSchoolAdmin();
    // The school is still onboarding, so this is refused earlier, by the approval gate.
    const res = await request(app).post("/api/v1/tenants/invite").set(auth(session.accessToken)).send(school);
    expect(res.status).toBe(403);
  });
});

describe("opening the invitation link", () => {
  it("tells the page which school and email it is for", async () => {
    await invite();
    const res = await request(app).post("/api/v1/auth/invite/check").send({ token: inviteTokenFromMail() });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: school.contactEmail, schoolName: school.schoolName });
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("gives one answer for every unknown link", async () => {
    const res = await request(app).post("/api/v1/auth/invite/check").send({ token: "0".repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVITE_INVALID");
  });

  it("says when a link has expired, and a resend replaces it", async () => {
    const created = await invite();
    const oldToken = inviteTokenFromMail();
    await AuthToken.updateOne({ type: "school_invite" }, { expiresAt: new Date(Date.now() - 1000) });

    const expired = await request(app).post("/api/v1/auth/invite/check").send({ token: oldToken });
    expect(expired.body.code).toBe("INVITE_EXPIRED");
    expect((await accept(oldToken)).body.code).toBe("INVITE_EXPIRED");

    const resend = await request(app)
      .post(`/api/v1/tenants/${created.body.data.tenant.id}/resend-invite`)
      .set(auth(await superToken()));
    expect(resend.status).toBe(200);
    const newToken = inviteTokenFromMail();
    expect(newToken).not.toBe(oldToken);

    expect((await request(app).post("/api/v1/auth/invite/check").send({ token: oldToken })).body.code).toBe("INVITE_INVALID");
    expect((await request(app).post("/api/v1/auth/invite/check").send({ token: newToken })).status).toBe(200);
    expect(await AuthToken.countDocuments({ type: "school_invite" })).toBe(1);
  });
});

describe("accepting the invitation", () => {
  it("creates the school admin, starts onboarding and signs them in", async () => {
    const created = await invite();
    const res = await accept(inviteTokenFromMail());

    expect(res.status).toBe(201);
    const { user, tenant, accessToken, refreshToken } = res.body.data;
    expect(user).toMatchObject({ name: "Asha Verma", email: school.contactEmail, role: "school_admin", tenantId: created.body.data.tenant.id });
    expect(user.emailVerifiedAt).toBeTruthy();
    expect(tenant).toMatchObject({ name: school.schoolName, approvalStatus: "onboarding", isActive: true });
    expect(refreshToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const me = await request(app).get("/api/v1/auth/me").set(auth(accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.tenant.approvalStatus).toBe("onboarding");

    // The password they chose works for a normal login, and the tenant comes back with it.
    const login = await request(app).post("/api/v1/auth/login").send({ email: school.contactEmail, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.tenant.approvalStatus).toBe("onboarding");
  });

  it("works only once", async () => {
    await invite();
    const raw = inviteTokenFromMail();
    expect((await accept(raw)).status).toBe(201);

    const again = await accept(raw, { name: "Someone Else", password: "An0ther@Pass" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_REGISTERED");
    expect((await request(app).post("/api/v1/auth/invite/check").send({ token: raw })).body.code).toBe("ALREADY_REGISTERED");
    expect(await User.countDocuments({ email: school.contactEmail })).toBe(1);
  });

  it("lets only one of two simultaneous requests through", async () => {
    await invite();
    const raw = inviteTokenFromMail();
    const results = await Promise.all([accept(raw, { name: "First Admin" }), accept(raw, { name: "Second Admin" })]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await User.countDocuments({ role: "school_admin" })).toBe(1);
    expect((await Tenant.findOne())?.approvalStatus).toBe("onboarding");
  });

  it("rejects a weak password or missing name without burning the link", async () => {
    await invite();
    const raw = inviteTokenFromMail();
    const weak = await accept(raw, { password: "weak" });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe("VALIDATION_ERROR");
    expect((await accept(raw, { name: "A" })).status).toBe(400);

    expect((await accept(raw)).status).toBe(201);
  });

  it("refuses a link whose school is no longer waiting for an admin", async () => {
    await invite();
    const raw = inviteTokenFromMail();
    await Tenant.updateOne({}, { approvalStatus: "approved" });
    expect((await accept(raw)).body.code).toBe("INVITE_INVALID");
    expect(await User.countDocuments({ role: "school_admin" })).toBe(0);
  });

  it("refuses the invitation if someone registered that email in the meantime, leaving the school invited", async () => {
    await invite();
    const raw = inviteTokenFromMail();
    // Someone registered this email after the invitation was sent.
    await User.create({
      name: "Squatter",
      email: school.contactEmail,
      passwordHash: await hashPassword("Squ4tter@Pass"),
      role: "parent",
      tenantId: null,
    });
    const res = await accept(raw);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_REGISTERED");
    expect((await Tenant.findOne())?.approvalStatus).toBe("invited");
  });

  it("refuses to resend once the invitation was accepted", async () => {
    const { tenantId } = await onboardedSchoolAdmin();
    const res = await request(app)
      .post(`/api/v1/tenants/${tenantId}/resend-invite`)
      .set(auth(await superToken()));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATE");

    const unknown = await request(app)
      .post("/api/v1/tenants/000000000000000000000000/resend-invite")
      .set(auth(await superToken()));
    expect(unknown.status).toBe(404);
    const malformed = await request(app)
      .post("/api/v1/tenants/not-an-id/resend-invite")
      .set(auth(await superToken()));
    expect(malformed.status).toBe(400);
  });
});

describe("a school that is not approved yet", () => {
  const mini = express();
  mini.get("/business", requireAuth, (_req, res) => res.json({ ok: true }));
  mini.get("/setup", requireAuthLoose, (_req, res) => res.json({ ok: true }));
  mini.use(errorHandler);

  it("can reach setup routes but not business routes, until it is approved", async () => {
    const { tenantId, session } = await onboardedSchoolAdmin();
    const token = session.accessToken;

    expect((await request(mini).get("/setup").set(auth(token))).status).toBe(200);
    const blocked = await request(mini).get("/business").set(auth(token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("TENANT_NOT_APPROVED");
    expect(blocked.body.details).toEqual({ approvalStatus: "onboarding" });

    await Tenant.updateOne({ _id: tenantId }, { approvalStatus: "approved" });
    expect((await request(mini).get("/business").set(auth(token))).status).toBe(200);
  });

  it("a suspended school is locked out immediately, including sign-in and refresh", async () => {
    const { tenantId, session } = await onboardedSchoolAdmin();
    await Tenant.updateOne({ _id: tenantId }, { approvalStatus: "approved", isActive: false });

    for (const path of ["/business", "/setup"]) {
      const res = await request(mini).get(path).set(auth(session.accessToken));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("TENANT_INACTIVE");
    }
    expect((await request(app).get("/api/v1/auth/me").set(auth(session.accessToken))).body.code).toBe("TENANT_INACTIVE");

    const login = await request(app).post("/api/v1/auth/login").send({ email: school.contactEmail, password: ADMIN_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe("TENANT_INACTIVE");
    // A wrong password still gets the generic answer, so this cannot be used to probe schools.
    expect((await request(app).post("/api/v1/auth/login").send({ email: school.contactEmail, password: "Wrong@1234" })).status).toBe(401);

    const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: session.refreshToken });
    expect(refresh.status).toBe(401);
    expect(await RefreshToken.countDocuments({ userId: session.user.id })).toBe(0);
  });

  it("the super admin is never held back by school state", async () => {
    await invite();
    expect((await request(mini).get("/business").set(auth(await superToken()))).status).toBe(200);
  });
});

describe("listing schools", () => {
  it("shows state, admin and invite expiry, newest first, with filters", async () => {
    await invite({ schoolName: "Alpha Academy", contactEmail: "alpha@example.com" });
    await invite({ schoolName: "Beta Bharati", contactEmail: "beta@example.com" });
    const alphaRaw = inviteTokenFromMail(0);
    await accept(alphaRaw, { name: "Alpha Admin" });

    const token = await superToken();
    const all = await request(app).get("/api/v1/tenants").set(auth(token));
    expect(all.status).toBe(200);
    expect(all.body.data.map((t: { name: string }) => t.name)).toEqual(["Beta Bharati", "Alpha Academy"]);

    const [beta, alpha] = all.body.data;
    expect(beta).toMatchObject({ approvalStatus: "invited", adminName: null, adminEmail: null });
    expect(new Date(beta.inviteExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(alpha).toMatchObject({ approvalStatus: "onboarding", adminName: "Alpha Admin", adminEmail: "alpha@example.com", inviteExpiresAt: null });

    const invited = await request(app).get("/api/v1/tenants?approvalStatus=invited").set(auth(token));
    expect(invited.body.data.map((t: { name: string }) => t.name)).toEqual(["Beta Bharati"]);

    expect((await request(app).get("/api/v1/tenants?search=alpha").set(auth(token))).body.data).toHaveLength(1);
    expect((await request(app).get("/api/v1/tenants?search=beta@example").set(auth(token))).body.data).toHaveLength(1);
    // Regex characters in the search box are plain text, not a pattern.
    expect((await request(app).get("/api/v1/tenants?search=(.*").set(auth(token))).status).toBe(200);
    expect((await request(app).get("/api/v1/tenants?approvalStatus=bogus").set(auth(token))).status).toBe(400);
  });
});
