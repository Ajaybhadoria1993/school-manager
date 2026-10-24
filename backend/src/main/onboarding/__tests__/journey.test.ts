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
import { requireAuth } from "../../../middleware/auth";
import { errorHandler } from "../../../middleware/errorHandler";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { AuthToken } from "../../auth/models/AuthToken";
import { RefreshToken } from "../../auth/models/RefreshToken";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Section } from "../../academics/models/Section";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { Tenant } from "../../tenants/models/Tenant";
import { User } from "../../users/models/User";

const SUPER = { email: "superadmin@example.com", password: "Admin@123" };
const PASSWORD = "Sch00l@Admin";

const step1 = {
  schoolName: "Sunrise Public School",
  schoolType: "Private",
  boards: [{ board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "2130456", mediums: ["English"] }],
  lowestClass: "Nursery",
  highestClass: "12",
  approxStudents: 850,
  sessionStartMonth: 4,
  academicYear: { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" },
  udiseCode: "27210100101",
  establishedYear: 1998,
};
const step2 = {
  addressLine1: "12 MG Road",
  addressLine2: "Near City Mall",
  city: "Pune",
  state: "Maharashtra",
  division: "Pune",
  district: "Pune",
  pincode: "411001",
  schoolPhone: "2012345678",
  schoolEmail: "office@sunrise.example",
  website: "https://sunrise.example",
};
const step3 = {
  adminName: "Asha Verma",
  designation: "Principal",
  mobile: "9876543210",
  alternateMobile: "",
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function superToken(): Promise<string> {
  return (await request(app).post("/api/v1/auth/login").send(SUPER)).body.data.accessToken;
}

function linkTokenFrom(index = sent.length - 1): string {
  const match = /accept-invite\?token=([a-f0-9]+)/.exec(sent[index]?.text ?? "");
  if (!match) throw new Error("No link in the captured email");
  return match[1];
}

/** Registers a school the way a visitor does: sign-up form, then the link in the email. */
async function selfRegister(schoolName = "Sunrise Public School", email = "principal@sunrise.example") {
  await request(app).post("/api/v1/auth/signup").send({ schoolName, email });
  const raw = linkTokenFrom();
  const res = await request(app).post("/api/v1/auth/accept-invite").send({ token: raw, name: "Asha Verma", password: PASSWORD });
  return { raw, session: res.body.data, status: res.status };
}

const put = (token: string, step: number, body: unknown) =>
  request(app).put(`/api/v1/onboarding/steps/${step}`).set(auth(token)).send(body as object);

async function fillAll(token: string, overrides: { step1?: object; step2?: object; step3?: object } = {}) {
  await put(token, 1, { ...step1, ...overrides.step1 });
  await put(token, 2, { ...step2, ...overrides.step2 });
  await put(token, 3, { ...step3, ...overrides.step3 });
  return put(token, 4, { confirmed: true });
}

/** A school that finished the form and is waiting for the super admin. */
async function submittedSchool(schoolName = "Sunrise Public School", email = "principal@sunrise.example") {
  const { session } = await selfRegister(schoolName, email);
  const token = session.accessToken as string;
  await fillAll(token, { step1: { schoolName } });
  const res = await request(app).post("/api/v1/onboarding/submit").set(auth(token));
  expect(res.status).toBe(200);
  return { token, tenantId: session.tenant.id as string, session };
}

beforeEach(async () => {
  sent.length = 0;
  await seedSuperAdmin();
});

describe("registering a school from the login page", () => {
  it("emails a link and creates nothing until the link is opened", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({ schoolName: "Sunrise Public School", email: "Principal@Sunrise.example " });
    expect(res.status).toBe(200);
    expect(res.body.data.ttlHours).toBe(env.signupTokenTtlHours);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("principal@sunrise.example");
    expect(sent[0].subject).toContain("Sunrise Public School");
    const raw = linkTokenFrom();

    expect(await Tenant.countDocuments()).toBe(0);
    expect(await User.countDocuments({ role: "school_admin" })).toBe(0);
    const row = await AuthToken.findOne({ type: "school_signup" });
    expect(row?.tokenHash).toBe(hashToken(raw));
    expect(row?.schoolName).toBe("Sunrise Public School");
  });

  it("answers the same for an email that already has an account, and sends no link to it", async () => {
    await selfRegister();
    sent.length = 0;
    const known = await request(app).post("/api/v1/auth/signup").send({ schoolName: "Another School", email: "principal@sunrise.example" });
    const fresh = await request(app).post("/api/v1/auth/signup").send({ schoolName: "Another School", email: "someone.new@example.com" });
    expect(known.status).toBe(200);
    expect(known.body).toEqual(fresh.body);

    expect(sent).toHaveLength(2);
    const toKnown = sent.find((m) => m.to === "principal@sunrise.example")!;
    expect(toKnown.subject).toContain("already have an account");
    expect(toKnown.text).not.toContain("accept-invite");
    // No new link was created for the known email (only its original, already used one exists).
    expect(await AuthToken.countDocuments({ type: "school_signup", email: "principal@sunrise.example" })).toBe(1);
    expect(await AuthToken.countDocuments({ type: "school_signup", email: "someone.new@example.com" })).toBe(1);
  });

  it("refuses a school name that is taken, whatever the case or spacing", async () => {
    await selfRegister();
    const res = await request(app).post("/api/v1/auth/signup").send({ schoolName: "SUNRISE  public school", email: "other@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHOOL_EXISTS");
  });

  it("validates the form", async () => {
    expect((await request(app).post("/api/v1/auth/signup").send({ schoolName: "A", email: "a@b.co" })).status).toBe(400);
    expect((await request(app).post("/api/v1/auth/signup").send({ schoolName: "Good School", email: "nope" })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("does not let the form flood one inbox, and a fresh request replaces the old link", async () => {
    const body = { schoolName: "Sunrise Public School", email: "principal@sunrise.example" };
    await request(app).post("/api/v1/auth/signup").send(body);
    const first = linkTokenFrom();
    const again = await request(app).post("/api/v1/auth/signup").send(body);
    expect(again.status).toBe(200);
    expect(sent).toHaveLength(1); // second request inside the cooldown sends nothing

    // Mongoose treats createdAt as immutable, so move it back with the raw driver to simulate time passing.
    await AuthToken.collection.updateOne({ type: "school_signup" }, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });
    await request(app).post("/api/v1/auth/signup").send(body);
    expect(sent).toHaveLength(2);
    expect(linkTokenFrom()).not.toBe(first);
    expect(await AuthToken.countDocuments({ type: "school_signup" })).toBe(1);
    expect((await request(app).post("/api/v1/auth/invite/check").send({ token: first })).body.code).toBe("INVITE_INVALID");
  });

  it("tells the page it is a sign-up link, then creates the school and the admin when completed", async () => {
    await request(app).post("/api/v1/auth/signup").send({ schoolName: "Sunrise Public School", email: "principal@sunrise.example" });
    const raw = linkTokenFrom();

    const info = await request(app).post("/api/v1/auth/invite/check").send({ token: raw });
    expect(info.body.data).toMatchObject({ kind: "signup", schoolName: "Sunrise Public School", email: "principal@sunrise.example" });

    const res = await request(app).post("/api/v1/auth/accept-invite").send({ token: raw, name: "Asha Verma", password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: "school_admin", email: "principal@sunrise.example" });
    expect(res.body.data.tenant).toMatchObject({ name: "Sunrise Public School", approvalStatus: "onboarding" });
    expect((await Tenant.findOne())?.source).toBe("signup");

    // single use
    const again = await request(app).post("/api/v1/auth/accept-invite").send({ token: raw, name: "X Y", password: PASSWORD });
    expect(again.status).toBe(409);
    expect(await Tenant.countDocuments()).toBe(1);
  });

  it("leaves nothing behind if the school name was taken in the meantime", async () => {
    await request(app).post("/api/v1/auth/signup").send({ schoolName: "Sunrise Public School", email: "principal@sunrise.example" });
    const raw = linkTokenFrom();
    await Tenant.create({
      name: "Sunrise Public School",
      nameKey: "sunrise public school",
      slug: "sunrise-public-school",
      contactEmail: "rival@example.com",
      approvalStatus: "approved",
    });

    const res = await request(app).post("/api/v1/auth/accept-invite").send({ token: raw, name: "Asha Verma", password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHOOL_EXISTS");
    expect(await User.countDocuments({ role: "school_admin" })).toBe(0);
    expect(await Tenant.countDocuments()).toBe(1);
    expect((await AuthToken.findOne({ type: "school_signup" }))?.usedAt).toBeUndefined();
  });
});

describe("onboarding form", () => {
  it("starts empty, with the school name and login email filled in as suggestions", async () => {
    const { session } = await selfRegister();
    const res = await request(app).get("/api/v1/onboarding").set(auth(session.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.approvalStatus).toBe("onboarding");
    expect(res.body.data.onboarding).toMatchObject({ status: "NOT_STARTED", currentStep: 1, completedSteps: [] });
    expect(res.body.data.steps[1].schoolName).toBe("Sunrise Public School");
    expect(res.body.data.steps[2].schoolEmail).toBe("principal@sunrise.example");
    expect(res.body.data.steps[1]).toMatchObject({ boards: [], sessionStartMonth: 4 });
    expect(res.body.data.steps[1].academicYear).toEqual({ name: "", startDate: "", endDate: "", status: null });
    expect(res.body.data.steps[3]).toMatchObject({ adminName: "Asha Verma" });
  });

  it("validates each step with a message per field", async () => {
    const { session } = await selfRegister();
    const token = session.accessToken;
    const fieldsOf = (res: request.Response) => res.body.details.map((d: { path: string }) => d.path);

    const s1 = await put(token, 1, { ...step1, boards: [{ board: "Nope", mediums: ["English"] }], udiseCode: "123" });
    expect(s1.status).toBe(400);
    expect(s1.body.code).toBe("VALIDATION_ERROR");
    expect(fieldsOf(s1)).toEqual(expect.arrayContaining(["boards.0.board", "udiseCode"]));
    expect(s1.body.details.find((d: { path: string }) => d.path === "udiseCode").message).toBe("UDISE+ code is 11 digits");

    const s2 = await put(token, 2, { ...step2, pincode: "12", website: "not a url" });
    expect(fieldsOf(s2)).toEqual(expect.arrayContaining(["pincode", "website"]));

    const s3 = await put(token, 3, { ...step3, mobile: "12345" });
    expect(fieldsOf(s3)).toEqual(expect.arrayContaining(["mobile"]));

    expect((await put(token, 9, {})).status).toBe(400);
    expect((await request(app).get("/api/v1/onboarding").set(auth(token))).body.data.onboarding.completedSteps).toEqual([]);
  });

  it("accepts blank optional boxes and tracks progress step by step", async () => {
    const { session } = await selfRegister();
    const token = session.accessToken;

    const one = await put(token, 1, { ...step1, udiseCode: "", establishedYear: "" });
    expect(one.status).toBe(200);
    expect(one.body.data.onboarding).toMatchObject({ status: "IN_PROGRESS", completedSteps: [1], currentStep: 2 });

    const two = await put(token, 2, { ...step2, addressLine2: "", website: "" });
    expect(two.body.data.onboarding).toMatchObject({ completedSteps: [1, 2], currentStep: 3 });

    // Going back to edit an earlier step does not undo progress.
    const edit = await put(token, 1, { ...step1, boards: [{ board: "ICSE", mediums: ["English"] }] });
    expect(edit.body.data.onboarding.completedSteps).toEqual([1, 2]);
    expect(edit.body.data.steps[1].boards).toEqual([{ board: "ICSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: ["English"] }]);
  });

  describe("boards, classes and size (step 1)", () => {
    const mp = { board: "State Board", stateBoard: "M.P. Board", mediums: ["Hindi", "English"] };

    it("keeps each board with its own medium: CBSE in English, the M.P. Board in Hindi and English", async () => {
      const { session } = await selfRegister();
      const res = await put(session.accessToken, 1, {
        ...step1,
        boards: [{ board: "CBSE", stateBoard: "", mediums: ["English"] }, mp],
      });
      expect(res.status).toBe(200);
      // The mediums come back in the order of the form (English before Hindi), whatever order they were sent in.
      expect(res.body.data.steps[1].boards).toEqual([
        { board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: ["English"] },
        { board: "State Board", stateBoard: "M.P. Board", otherBoard: "", affiliationNumber: "", mediums: ["English", "Hindi"] },
      ]);
      const stored = (await Tenant.findOne())?.profile?.boardEntries ?? [];
      expect(
        stored.map((e) => ({
          board: e.board,
          stateBoard: e.stateBoard ?? "",
          otherBoard: e.otherBoard ?? "",
          affiliationNumber: e.affiliationNumber ?? "",
          mediums: [...e.mediums],
        }))
      ).toEqual(res.body.data.steps[1].boards);
    });

    it("asks for the state board of a State Board entry, and for a medium on every entry", async () => {
      const { session } = await selfRegister();
      const messages = (res: request.Response) =>
        Object.fromEntries(res.body.details.map((d: { path: string; message: string }) => [d.path, d.message]));

      // (The state-board check runs once the entry's own fields are valid, so each is asked on its own.)
      const noState = await put(session.accessToken, 1, {
        ...step1,
        boards: [{ board: "State Board", stateBoard: "", mediums: ["English"] }],
      });
      expect(noState.status).toBe(400);
      expect(messages(noState)).toMatchObject({ "boards.0.stateBoard": "Choose the state board" });

      const noMedium = await put(session.accessToken, 1, {
        ...step1,
        boards: [{ board: "CBSE", stateBoard: "", mediums: [] }],
      });
      expect(noMedium.status).toBe(400);
      expect(messages(noMedium)).toMatchObject({ "boards.0.mediums": "Choose at least one medium" });

      const unknown = await put(session.accessToken, 1, {
        ...step1,
        boards: [{ board: "State Board", stateBoard: "Narnia Board", mediums: ["English"] }],
      });
      expect(unknown.status).toBe(400);
    });

    it("drops a state board that no longer belongs to the entry", async () => {
      const { session } = await selfRegister();
      // A client that still sends the old state board after the board was changed to CBSE.
      const res = await put(session.accessToken, 1, {
        ...step1,
        boards: [{ board: "CBSE", stateBoard: "M.P. Board", mediums: ["English"] }],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.steps[1].boards).toEqual([
        { board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: ["English"] },
      ]);
    });

    it("needs at least one board, refuses the same board twice, and caps the list", async () => {
      const { session } = await selfRegister();
      const none = await put(session.accessToken, 1, { ...step1, boards: [] });
      expect(none.status).toBe(400);
      expect(none.body.details[0]).toMatchObject({ path: "boards", message: "Add at least one board" });

      const twice = await put(session.accessToken, 1, {
        ...step1,
        boards: [
          { board: "CBSE", mediums: ["English"] },
          { board: "CBSE", mediums: ["Hindi"] },
        ],
      });
      expect(twice.status).toBe(400);
      expect(twice.body.details[0]).toMatchObject({ path: "boards.1.board", message: "This board is already added" });

      // Two different state boards are fine; the same one twice is not.
      const mp2 = { ...mp, mediums: ["Hindi"] };
      const up = { board: "State Board", stateBoard: "U.P. Board", mediums: ["Hindi"] };
      expect((await put(session.accessToken, 1, { ...step1, boards: [mp, up] })).status).toBe(200);
      const sameState = await put(session.accessToken, 1, { ...step1, boards: [mp, mp2] });
      expect(sameState.status).toBe(400);
      expect(sameState.body.details[0]).toMatchObject({ path: "boards.1.stateBoard", message: "This state board is already added" });

      const many = Array.from({ length: 7 }, (_, i) => ({ board: "Other", otherBoard: `Board ${i}`, mediums: ["English"] }));
      const tooMany = await put(session.accessToken, 1, { ...step1, boards: many });
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.details[0]).toMatchObject({ path: "boards", message: "A school can list at most 6 boards" });

      // The early shape (a flat list of board names) is refused, not guessed at.
      expect((await put(session.accessToken, 1, { ...step1, boards: ["CBSE"] })).status).toBe(400);
    });

    it("checks the class range, the student count and the session month here too", async () => {
      const { session } = await selfRegister();
      const messages = (res: request.Response) =>
        Object.fromEntries(res.body.details.map((d: { path: string; message: string }) => [d.path, d.message]));

      const backwards = await put(session.accessToken, 1, { ...step1, lowestClass: "10", highestClass: "5" });
      expect(backwards.status).toBe(400);
      expect(messages(backwards)).toMatchObject({ highestClass: "The last class cannot be lower than the first class" });

      const size = await put(session.accessToken, 1, { ...step1, approxStudents: 0, sessionStartMonth: 13 });
      expect(size.status).toBe(400);
      expect(messages(size)).toMatchObject({ approxStudents: "Enter the number of students", sessionStartMonth: "Choose a month" });
    });

    it("saves classes, size and session with step 1, so step 3 is only about the administrator", async () => {
      const { session } = await selfRegister();
      const juneToMay = { name: "2026-27", startDate: "2026-06-01", endDate: "2027-05-31" };
      await put(session.accessToken, 1, { ...step1, lowestClass: "LKG", highestClass: "8", approxStudents: 420, academicYear: juneToMay });
      const state = (await request(app).get("/api/v1/onboarding").set(auth(session.accessToken))).body.data;
      expect(state.steps[1]).toMatchObject({ lowestClass: "LKG", highestClass: "8", approxStudents: 420, sessionStartMonth: 6 });
      expect(Object.keys(state.steps[3]).sort()).toEqual(["adminName", "alternateMobile", "designation", "designationOther", "mobile"]);
      expect((await put(session.accessToken, 3, step3)).status).toBe(200);
    });
  });

  describe("what the school writes in", () => {
    const messages = (res: request.Response) =>
      Object.fromEntries(res.body.details.map((d: { path: string; message: string }) => [d.path, d.message]));

    it("keeps an affiliation number with its own board", async () => {
      const { session } = await selfRegister();
      const res = await put(session.accessToken, 1, {
        ...step1,
        boards: [
          { board: "CBSE", affiliationNumber: "2130456", mediums: ["English"] },
          { board: "State Board", stateBoard: "M.P. Board", affiliationNumber: "MP/1234", mediums: ["Hindi"] },
          { board: "ICSE", mediums: ["English"] },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.steps[1].boards.map((b: { board: string; affiliationNumber: string }) => [b.board, b.affiliationNumber])).toEqual([
        ["CBSE", "2130456"],
        ["State Board", "MP/1234"],
        ["ICSE", ""],
      ]);
      // There is no school-wide affiliation number any more.
      expect(res.body.data.steps[1]).not.toHaveProperty("affiliationNumber");
    });

    it("asks for the name of an 'Other' board, and forgets it for any other board", async () => {
      const { session } = await selfRegister();
      const missing = await put(session.accessToken, 1, { ...step1, boards: [{ board: "Other", otherBoard: "", mediums: ["English"] }] });
      expect(missing.status).toBe(400);
      expect(messages(missing)).toMatchObject({ "boards.0.otherBoard": "Enter the name of the board" });

      const ok = await put(session.accessToken, 1, { ...step1, boards: [{ board: "Other", otherBoard: "  Cambridge IGCSE ", mediums: ["English"] }] });
      expect(ok.status).toBe(200);
      expect(ok.body.data.steps[1].boards[0]).toMatchObject({ board: "Other", otherBoard: "Cambridge IGCSE" });

      const changed = await put(session.accessToken, 1, { ...step1, boards: [{ board: "CBSE", otherBoard: "Cambridge IGCSE", mediums: ["English"] }] });
      expect(changed.body.data.steps[1].boards[0]).toMatchObject({ board: "CBSE", otherBoard: "" });

      // The same named board twice is a slip, whatever the capital letters.
      const twice = await put(session.accessToken, 1, {
        ...step1,
        boards: [
          { board: "Other", otherBoard: "Cambridge", mediums: ["English"] },
          { board: "Other", otherBoard: "CAMBRIDGE", mediums: ["Hindi"] },
        ],
      });
      expect(twice.status).toBe(400);
      expect(twice.body.details[0]).toMatchObject({ path: "boards.1.otherBoard", message: "This board is already added" });
    });

    it("takes the state from the list, with its district and an optional division", async () => {
      const { session } = await selfRegister();
      const token = session.accessToken;
      const free = await put(token, 2, { ...step2, state: "Narnia" });
      expect(free.status).toBe(400);
      expect(messages(free)).toMatchObject({ state: "Choose the state" });

      const noDistrict = await put(token, 2, { ...step2, district: "" });
      expect(messages(noDistrict)).toMatchObject({ district: "Enter the district" });

      const noDivision = await put(token, 2, { ...step2, state: "Kerala", division: "", district: "Thrissur" });
      expect(noDivision.status).toBe(200);
      expect(noDivision.body.data.steps[2]).toMatchObject({ state: "Kerala", district: "Thrissur", division: "" });

      const full = await put(token, 2, { ...step2, state: "Madhya Pradesh", division: "Bhopal", district: "Sehore" });
      expect(full.body.data.steps[2]).toMatchObject({ state: "Madhya Pradesh", division: "Bhopal", district: "Sehore" });
    });

    it("takes a phone number as the 10 digits after +91, however it is typed", async () => {
      const { session } = await selfRegister();
      const token = session.accessToken;
      for (const typed of ["9876543210", "+91 98765 43210", "919876543210", "09876543210", "98765-43210"]) {
        const res = await put(token, 2, { ...step2, schoolPhone: typed });
        expect(res.status).toBe(200);
        expect(res.body.data.steps[2].schoolPhone).toBe("9876543210");
      }
      // A landline: the STD code and the number are the 10 digits.
      const landline = await put(token, 2, { ...step2, schoolPhone: "0755-2345678" });
      expect(landline.body.data.steps[2].schoolPhone).toBe("7552345678");

      for (const bad of ["98765", "987654321", "98765432101", "abcdefghij", ""]) {
        const res = await put(token, 2, { ...step2, schoolPhone: bad });
        expect(res.status, bad).toBe(400);
        expect(messages(res)).toMatchObject({ schoolPhone: "Enter a 10-digit phone number" });
      }
      // A person's mobile must start with 6-9; the same +91 handling applies.
      const mobile = await put(token, 3, { ...step3, mobile: "+91 98765 43210", alternateMobile: "09876543211" });
      expect(mobile.status).toBe(200);
      const landlineAsMobile = await put(token, 3, { ...step3, mobile: "2552345678" });
      expect(landlineAsMobile.status).toBe(400);
      expect(messages(landlineAsMobile)).toMatchObject({ mobile: "Enter a 10-digit mobile number" });
    });

    it("asks what the role is when it is 'Other', and keeps the answer with the administrator", async () => {
      const { session } = await selfRegister();
      const token = session.accessToken;
      const missing = await put(token, 3, { ...step3, designation: "Other", designationOther: "" });
      expect(missing.status).toBe(400);
      expect(messages(missing)).toMatchObject({ designationOther: "Tell us your role" });

      const ok = await put(token, 3, { ...step3, designation: "Other", designationOther: " Vice Chairman " });
      expect(ok.status).toBe(200);
      expect(ok.body.data.steps[3]).toMatchObject({ designation: "Other", designationOther: "Vice Chairman" });
      expect(await User.findOne({ role: "school_admin" })).toMatchObject({ designation: "Other", designationOther: "Vice Chairman" });

      // Picking a listed role again drops what was written in, and the account stays a school administrator.
      const back = await put(token, 3, { ...step3, designation: "Director", designationOther: "Vice Chairman" });
      expect(back.body.data.steps[3]).toMatchObject({ designation: "Director", designationOther: "" });
      expect((await User.findOne({ role: "school_admin" }))?.role).toBe("school_admin");
    });
  });

  it("will not take the final confirmation before steps 1-3 are done", async () => {
    const { session } = await selfRegister();
    await put(session.accessToken, 1, step1);
    const res = await put(session.accessToken, 4, { confirmed: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ONBOARDING_INCOMPLETE");
    expect(res.body.details.missingSteps).toEqual([2, 3]);
    expect((await put(session.accessToken, 4, { confirmed: false })).status).toBe(400);
  });

  it("makes the school confirm again after any answer is changed", async () => {
    const { session } = await selfRegister();
    const token = session.accessToken;
    const done = await fillAll(token);
    expect(done.body.data.onboarding).toMatchObject({ status: "COMPLETED", completedSteps: [1, 2, 3, 4] });

    const edit = await put(token, 2, { ...step2, city: "Mumbai" });
    expect(edit.status).toBe(200);
    expect(edit.body.data.onboarding).toMatchObject({ status: "IN_PROGRESS", currentStep: 4, completedSteps: [1, 2, 3] });
    expect(edit.body.data.steps[4]).toEqual({ confirmed: false });
    expect((await Tenant.findOne())?.onboarding.declarationAcceptedAt).toBeUndefined();

    const refused = await request(app).post("/api/v1/onboarding/submit").set(auth(token));
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("ONBOARDING_INCOMPLETE");
    expect(refused.body.details.missingSteps).toEqual([4]);

    expect((await put(token, 4, { confirmed: true })).body.data.onboarding.status).toBe("COMPLETED");
    expect((await request(app).post("/api/v1/onboarding/submit").set(auth(token))).status).toBe(200);
  });

  it("stores the answers where they belong and reads them back", async () => {
    const { session } = await selfRegister();
    const done = await fillAll(session.accessToken, { step1: { schoolName: "Sunrise Public School, Pune" } });
    expect(done.body.data.onboarding).toMatchObject({ status: "COMPLETED", currentStep: 4, completedSteps: [1, 2, 3, 4] });

    const tenant = await Tenant.findOne();
    expect(tenant?.name).toBe("Sunrise Public School, Pune");
    expect(tenant?.nameKey).toBe("sunrise public school, pune");
    expect(tenant?.slug).toBe("sunrise-public-school"); // the slug does not change when the name does
    expect(tenant?.address?.city).toBe("Pune");
    expect(tenant?.profile?.boardEntries?.[0]).toMatchObject({ board: "CBSE" });
    expect(tenant?.profile?.highestClass).toBe("12");
    expect(tenant?.profile?.approxStudents).toBe(850);
    expect(tenant?.schoolEmail).toBe("office@sunrise.example");

    const admin = await User.findOne({ role: "school_admin" });
    expect(admin).toMatchObject({ name: "Asha Verma", designation: "Principal", phone: "9876543210" });

    const state = (await request(app).get("/api/v1/onboarding").set(auth(session.accessToken))).body.data;
    expect(state.steps[1]).toMatchObject({
      schoolName: "Sunrise Public School, Pune",
      establishedYear: 1998,
      udiseCode: "27210100101",
      boards: [{ board: "CBSE", stateBoard: "", mediums: ["English"] }],
      lowestClass: "Nursery",
      highestClass: "12",
      approxStudents: 850,
      sessionStartMonth: 4,
    });
    expect(state.steps[3]).toMatchObject({ adminName: "Asha Verma", alternateMobile: "" });
    expect(state.steps[4]).toEqual({ confirmed: true });
  });

  it("refuses a school name another school already uses, pointing at the field", async () => {
    await selfRegister("Greenfield School", "green@example.com");
    const { session } = await selfRegister("Sunrise Public School", "principal@sunrise.example");
    const res = await put(session.accessToken, 1, { ...step1, schoolName: "greenfield  SCHOOL" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHOOL_EXISTS");
    expect(res.body.details[0].path).toBe("schoolName");
    expect((await Tenant.findOne({ contactEmail: "principal@sunrise.example" }))?.name).toBe("Sunrise Public School");
  });

  it("keeps one school's form away from another's", async () => {
    const a = await selfRegister("School Alpha", "alpha@example.com");
    const b = await selfRegister("School Beta", "beta@example.com");
    await put(a.session.accessToken, 2, step2);
    const stateB = (await request(app).get("/api/v1/onboarding").set(auth(b.session.accessToken))).body.data;
    expect(stateB.steps[2].city).toBe("");
    expect(stateB.onboarding.completedSteps).toEqual([]);
  });

  it("is only for school admins who are signed in", async () => {
    expect((await request(app).get("/api/v1/onboarding")).status).toBe(401);
    const asSuper = await request(app).get("/api/v1/onboarding").set(auth(await superToken()));
    expect(asSuper.status).toBe(403);
    expect(asSuper.body.code).toBe("FORBIDDEN");
  });
});

describe("submitting for approval", () => {
  it("refuses an unfinished form and says which steps are missing", async () => {
    const { session } = await selfRegister();
    await put(session.accessToken, 1, step1);
    const res = await request(app).post("/api/v1/onboarding/submit").set(auth(session.accessToken));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ONBOARDING_INCOMPLETE");
    expect(res.body.details.missingSteps).toEqual([2, 3, 4]);
    expect((await Tenant.findOne())?.approvalStatus).toBe("onboarding");
  });

  it("moves the school to pending, tells the super admin and locks the form", async () => {
    const { token, tenantId } = await submittedSchool();

    const tenant = await Tenant.findById(tenantId);
    expect(tenant?.approvalStatus).toBe("pending");
    expect(tenant?.onboarding.submittedAt).toBeTruthy();

    await vi.waitFor(() => expect(sent.some((m) => m.to === SUPER.email && m.subject.includes("awaits approval"))).toBe(true));
    const note = sent.find((m) => m.to === SUPER.email && m.subject.includes("awaits approval"))!;
    expect(note.text).toContain(`/super-admin/schools/${tenantId}`);

    const again = await request(app).post("/api/v1/onboarding/submit").set(auth(token));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVALID_STATE");

    const edit = await put(token, 1, step1);
    expect(edit.status).toBe(403);
    expect(edit.body.code).toBe("ONBOARDING_LOCKED");

    // The admin can still see where things stand.
    const me = await request(app).get("/api/v1/auth/me").set(auth(token));
    expect(me.body.data.tenant.approvalStatus).toBe("pending");
  });
});

describe("the super admin's review", () => {
  it("shows every detail the school submitted", async () => {
    const { tenantId } = await submittedSchool();
    const res = await request(app).get(`/api/v1/tenants/${tenantId}/review`).set(auth(await superToken()));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.tenant).toMatchObject({ name: "Sunrise Public School", approvalStatus: "pending", source: "signup" });
    expect(d.admin).toMatchObject({ name: "Asha Verma", email: "principal@sunrise.example" });
    expect(d.steps[1]).toMatchObject({
      boards: [{ board: "CBSE", stateBoard: "", mediums: ["English"] }],
      schoolType: "Private",
      lowestClass: "Nursery",
      approxStudents: 850,
    });
    expect(d.steps[2]).toMatchObject({ city: "Pune", district: "Pune", division: "Pune", pincode: "411001", schoolPhone: "2012345678" });
    expect(d.steps[3]).toMatchObject({ designation: "Principal", mobile: "9876543210" });
    expect(d.onboarding.status).toBe("COMPLETED");
    expect(d.review.rejectionReason).toBeNull();
    expect(JSON.stringify(d)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("gives the dashboard its counts and the schools waiting longest first", async () => {
    await submittedSchool("First School", "first@example.com");
    await submittedSchool("Second School", "second@example.com");
    await selfRegister("Third School", "third@example.com");
    await request(app).post("/api/v1/auth/signup").send({ schoolName: "Fourth School", email: "fourth@example.com" });

    const token = await superToken();
    const counts = await request(app).get("/api/v1/tenants/counts").set(auth(token));
    expect(counts.body.data).toEqual({ invited: 0, onboarding: 1, pending: 2, approved: 0, rejected: 0, total: 3, suspended: 0 });

    const overview = await request(app).get("/api/v1/tenants/overview").set(auth(token));
    expect(overview.body.data.counts.pending).toBe(2);
    expect(overview.body.data.awaiting.map((t: { name: string }) => t.name)).toEqual(["First School", "Second School"]);
    expect(overview.body.data.recent).toHaveLength(3);

    const pending = await request(app).get("/api/v1/tenants?approvalStatus=pending").set(auth(token));
    expect(pending.body.data).toHaveLength(2);
    expect(pending.body.data[0].submittedAt).toBeTruthy();
  });

  const mini = express();
  mini.get("/business", requireAuth, (_req, res) => res.json({ ok: true }));
  mini.use(errorHandler);

  it("approving opens the school up and emails the admin, exactly once", async () => {
    const { token, tenantId } = await submittedSchool();
    expect((await request(mini).get("/business").set(auth(token))).body.code).toBe("TENANT_NOT_APPROVED");

    const su = await superToken();
    sent.length = 0;
    const res = await request(app).post(`/api/v1/tenants/${tenantId}/approve`).set(auth(su)).send({ note: "Documents verified" });
    expect(res.status).toBe(200);
    expect(res.body.data.tenant.approvalStatus).toBe("approved");

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("principal@sunrise.example");
    expect(sent[0].subject).toContain("approved");

    const me = await request(app).get("/api/v1/auth/me").set(auth(token));
    expect(me.body.data.tenant.approvalStatus).toBe("approved");
    expect((await request(mini).get("/business").set(auth(token))).status).toBe(200);

    const tenant = await Tenant.findById(tenantId);
    expect(tenant?.review.approvedAt).toBeTruthy();
    expect(tenant?.review.note).toBe("Documents verified");

    // A second click must neither re-approve nor re-send the email.
    sent.length = 0;
    const second = await request(app).post(`/api/v1/tenants/${tenantId}/approve`).set(auth(su)).send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("INVALID_STATE");
    expect(sent).toHaveLength(0);
    expect((await request(app).post(`/api/v1/tenants/${tenantId}/reject`).set(auth(su)).send({ reason: "Changed my mind about this" })).status).toBe(409);
  });

  it("rejecting needs a real reason, shows it to the admin, and lets them fix and resubmit", async () => {
    const { token, tenantId } = await submittedSchool();
    const su = await superToken();

    const short = await request(app).post(`/api/v1/tenants/${tenantId}/reject`).set(auth(su)).send({ reason: "no" });
    expect(short.status).toBe(400);

    sent.length = 0;
    const reason = "The UDISE+ code does not match the school registration. Please correct it.";
    const rejected = await request(app).post(`/api/v1/tenants/${tenantId}/reject`).set(auth(su)).send({ reason });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.tenant.approvalStatus).toBe("rejected");
    expect(sent[0].to).toBe("principal@sunrise.example");
    expect(sent[0].text).toContain(reason);

    // The admin can sign in, sees why, and can edit again.
    const me = await request(app).get("/api/v1/auth/me").set(auth(token));
    expect(me.body.data.tenant).toMatchObject({ approvalStatus: "rejected", rejectionReason: reason });
    const state = await request(app).get("/api/v1/onboarding").set(auth(token));
    expect(state.body.data.rejectionReason).toBe(reason);
    expect((await put(token, 1, { ...step1, udiseCode: "27210100999" })).status).toBe(200);

    // Editing voided the earlier confirmation: it has to be given again before resubmitting.
    const early = await request(app).post("/api/v1/onboarding/submit").set(auth(token));
    expect(early.status).toBe(400);
    expect(early.body.details.missingSteps).toEqual([4]);
    expect((await put(token, 4, { confirmed: true })).status).toBe(200);

    sent.length = 0;
    const resubmit = await request(app).post("/api/v1/onboarding/submit").set(auth(token));
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.data.approvalStatus).toBe("pending");
    expect(resubmit.body.data.onboarding.resubmittedCount).toBe(1);
    expect(resubmit.body.data.rejectionReason).toBeNull(); // hidden again while it is being reviewed
    await vi.waitFor(() => expect(sent.some((m) => m.to === SUPER.email && m.subject.startsWith("Resubmitted"))).toBe(true));

    const list = await request(app).get("/api/v1/tenants?approvalStatus=pending").set(auth(su));
    expect(list.body.data[0].resubmittedCount).toBe(1);

    const approved = await request(app).post(`/api/v1/tenants/${tenantId}/approve`).set(auth(su)).send({});
    expect(approved.status).toBe(200);
    const detail = (await request(app).get(`/api/v1/tenants/${tenantId}/review`).set(auth(su))).body.data;
    expect(detail.review.approvedAt).toBeTruthy();
    expect(detail.review.reviewedByName).toBe("Super Admin");
  });

  it("only works on schools that are waiting, and only for the super admin", async () => {
    const su = await superToken();
    const { token, tenantId } = await submittedSchool();

    const unknown = await request(app).post("/api/v1/tenants/000000000000000000000000/approve").set(auth(su)).send({});
    expect(unknown.status).toBe(404);
    expect((await request(app).post("/api/v1/tenants/not-an-id/approve").set(auth(su)).send({})).status).toBe(400);

    const asSchool = await request(app).post(`/api/v1/tenants/${tenantId}/approve`).set(auth(token)).send({});
    expect(asSchool.status).toBe(403);
    expect((await Tenant.findById(tenantId))?.approvalStatus).toBe("pending");

    const invited = await request(app)
      .post("/api/v1/tenants/invite")
      .set(auth(su))
      .send({ schoolName: "Invited Only School", contactEmail: "invited@example.com" });
    const early = await request(app).post(`/api/v1/tenants/${invited.body.data.tenant.id}/approve`).set(auth(su)).send({});
    expect(early.status).toBe(409);

    expect((await request(app).get(`/api/v1/tenants/${tenantId}/review`)).status).toBe(401);
    await User.create({
      name: "T",
      email: "teacher@example.com",
      passwordHash: await hashPassword("Teach3r@Pass"),
      role: "teacher",
      tenantId: null,
    });
    const teacher = (await request(app).post("/api/v1/auth/login").send({ email: "teacher@example.com", password: "Teach3r@Pass" })).body.data
      .accessToken;
    expect((await request(app).get(`/api/v1/tenants/${tenantId}/review`).set(auth(teacher))).status).toBe(403);
  });
});

describe("suspending and reactivating a school", () => {
  const SCHOOL_ADMIN = "principal@sunrise.example";
  const REASON = "The yearly subscription fee is overdue. Please contact the platform team.";

  /** An approved school with its admin signed in, and a teacher who also has a saved sign-in. */
  async function liveSchool() {
    const { token, tenantId, session } = await submittedSchool();
    const su = await superToken();
    expect((await request(app).post(`/api/v1/tenants/${tenantId}/approve`).set(auth(su)).send({})).status).toBe(200);
    await User.create({ name: "Teacher", email: "teacher@sunrise.example", passwordHash: await hashPassword("Teach3r@Pass"), role: "teacher", tenantId });
    const teacher = (await request(app).post("/api/v1/auth/login").send({ email: "teacher@sunrise.example", password: "Teach3r@Pass" })).body.data;
    return { token, tenantId, session, su, teacher };
  }

  const suspend = (su: string, tenantId: string, body: object = { reason: REASON }) =>
    request(app).post(`/api/v1/tenants/${tenantId}/suspend`).set(auth(su)).send(body);
  const reactivate = (su: string, tenantId: string, body: object = {}) =>
    request(app).post(`/api/v1/tenants/${tenantId}/reactivate`).set(auth(su)).send(body);

  it("locks everyone out at once, tells the administrator why, and reactivating lets them back in", async () => {
    const { token, tenantId, session, su, teacher } = await liveSchool();
    expect((await request(app).get("/api/v1/auth/me").set(auth(token))).status).toBe(200);
    expect(await RefreshToken.countDocuments({ userId: { $in: [session.user.id, teacher.user.id] } })).toBe(2);

    sent.length = 0;
    const res = await suspend(su, tenantId);
    expect(res.status).toBe(200);
    expect(res.body.data.tenant).toMatchObject({ approvalStatus: "approved", isActive: false });

    // Exactly one email, to the administrator, with the reason.
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(SCHOOL_ADMIN);
    expect(sent[0].subject).toContain("suspended");
    expect(sent[0].text).toContain(REASON);

    // Sessions they already hold stop working, for the admin and for the teacher, and cannot be renewed.
    for (const accessToken of [token, teacher.accessToken]) {
      const me = await request(app).get("/api/v1/auth/me").set(auth(accessToken));
      expect(me.status).toBe(403);
      expect(me.body.code).toBe("TENANT_INACTIVE");
    }
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: session.refreshToken })).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: teacher.refreshToken })).status).toBe(401);
    expect(await RefreshToken.countDocuments({ userId: { $in: [session.user.id, teacher.user.id] } })).toBe(0);
    const login = await request(app).post("/api/v1/auth/login").send({ email: SCHOOL_ADMIN, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe("TENANT_INACTIVE");

    // The super admin sees who did it and why, and that it is still an approved school.
    const detail = (await request(app).get(`/api/v1/tenants/${tenantId}/review`).set(auth(su))).body.data;
    expect(detail.tenant).toMatchObject({ approvalStatus: "approved", isActive: false });
    expect(detail.suspension).toMatchObject({ reason: REASON, suspendedByName: "Super Admin", reactivatedAt: null });
    const counts = (await request(app).get("/api/v1/tenants/counts").set(auth(su))).body.data;
    expect(counts).toMatchObject({ approved: 1, suspended: 1 });

    // A second click finds it already done: no second email.
    sent.length = 0;
    const again = await suspend(su, tenantId);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVALID_STATE");
    expect(sent).toHaveLength(0);

    // Switching it back on: nobody is signed in any more, so everyone signs in afresh.
    const back = await reactivate(su, tenantId, { note: "Fee received on the phone." });
    expect(back.status).toBe(200);
    expect(back.body.data.tenant.isActive).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(SCHOOL_ADMIN);
    expect(sent[0].subject).toContain("active again");
    expect(sent[0].text).not.toContain("Fee received"); // the note is for the platform team only
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: session.refreshToken })).status).toBe(401);
    const signedIn = await request(app).post("/api/v1/auth/login").send({ email: SCHOOL_ADMIN, password: PASSWORD });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data.tenant).toMatchObject({ approvalStatus: "approved", isActive: true });

    const after = (await request(app).get(`/api/v1/tenants/${tenantId}/review`).set(auth(su))).body.data;
    expect(after.suspension).toMatchObject({ reason: REASON, reactivatedByName: "Super Admin", note: "Fee received on the phone." });
    expect(after.suspension.reactivatedAt).toBeTruthy();
    expect((await request(app).get("/api/v1/tenants/counts").set(auth(su))).body.data.suspended).toBe(0);
    expect((await reactivate(su, tenantId)).status).toBe(409);

    // Suspending again starts a new round: the earlier reactivation is no longer shown.
    const second = await suspend(su, tenantId, { reason: "Suspended again while we check a complaint." });
    expect(second.status).toBe(200);
    const detail2 = (await request(app).get(`/api/v1/tenants/${tenantId}/review`).set(auth(su))).body.data;
    expect(detail2.suspension).toMatchObject({ reason: "Suspended again while we check a complaint.", reactivatedAt: null, reactivatedByName: null, note: null });
  });

  it("needs a real reason, and only works on an approved school, for the super admin only", async () => {
    const { token, tenantId, su } = await liveSchool();

    expect((await suspend(su, tenantId, { reason: "no" })).status).toBe(400);
    expect((await suspend(su, tenantId, {})).status).toBe(400);
    expect((await suspend(su, "not-an-id")).status).toBe(400);
    expect((await suspend(su, "000000000000000000000000")).status).toBe(404);
    expect((await reactivate(su, "000000000000000000000000")).status).toBe(404);
    expect((await suspend(token, tenantId)).status).toBe(403);
    expect((await request(app).post(`/api/v1/tenants/${tenantId}/suspend`).send({ reason: REASON })).status).toBe(401);
    expect((await Tenant.findById(tenantId))?.isActive).toBe(true);

    // Switching on a school that is already on is refused, and nothing changes.
    const active = await reactivate(su, tenantId);
    expect(active.status).toBe(409);
    expect(active.body.code).toBe("INVALID_STATE");

    // A school that is not approved yet has nothing to switch off.
    const waiting = await submittedSchool("Waiting School", "head@waiting.example");
    const early = await suspend(su, waiting.tenantId);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("INVALID_STATE");
    expect((await Tenant.findById(waiting.tenantId))?.isActive).toBe(true);
  });
});

describe("the academic year (named in step 1, switched on by the approval)", () => {
  const messages = (res: request.Response) =>
    Object.fromEntries((res.body.details ?? []).map((d: { path: string; message: string }) => [d.path, d.message]));
  const yearsOf = (tenantId: string) => AcademicYear.find({ tenantId }).lean();

  it("is required, with a message per field, and its end must come after its start", async () => {
    const { session } = await selfRegister();
    const token = session.accessToken as string;
    const { academicYear: _left, ...withoutYear } = step1;

    const missing = await put(token, 1, withoutYear);
    expect(missing.status).toBe(400);
    expect(messages(missing)).toMatchObject({ academicYear: "Enter the academic year" });

    const blank = await put(token, 1, { ...step1, academicYear: { name: "", startDate: "", endDate: "" } });
    expect(messages(blank)).toMatchObject({
      "academicYear.name": "Enter the academic year name, for example 2026-2027",
      "academicYear.startDate": "Choose the start date",
      "academicYear.endDate": "Choose the end date",
    });

    const backwards = await put(token, 1, { ...step1, academicYear: { name: "2026-2027", startDate: "2027-03-31", endDate: "2026-04-01" } });
    expect(messages(backwards)).toMatchObject({ "academicYear.endDate": "The end date must be after the start date" });
    const sameDay = await put(token, 1, { ...step1, academicYear: { name: "2026-2027", startDate: "2026-04-01", endDate: "2026-04-01" } });
    expect(messages(sameDay)).toMatchObject({ "academicYear.endDate": "The end date must be after the start date" });

    const impossible = await put(token, 1, { ...step1, academicYear: { name: "2026-2027", startDate: "2026-02-30", endDate: "2027-03-31" } });
    expect(messages(impossible)).toMatchObject({ "academicYear.startDate": "Choose a valid start date" });
    const typo = await put(token, 1, { ...step1, academicYear: { name: "2026-2027", startDate: "2026-04-01", endDate: "2062-03-31" } });
    expect(messages(typo)).toMatchObject({ "academicYear.endDate": "An academic year can be at most two years long" });

    // Nothing half-saved: no year, and step 1 is not counted as done.
    expect(await yearsOf(session.tenant.id)).toHaveLength(0);
    const state = (await request(app).get("/api/v1/onboarding").set(auth(token))).body.data;
    expect(state.onboarding.completedSteps).not.toContain(1);
  });

  it("takes the school's own dates (not April to March), keeps one pending year however often it is saved, and reads it back", async () => {
    const { session } = await selfRegister();
    const token = session.accessToken as string;
    const tenantId = session.tenant.id as string;

    expect((await put(token, 1, { ...step1, academicYear: { name: "2026", startDate: "2026-01-05", endDate: "2026-12-20" } })).status).toBe(200);
    // A retry, and three saves at the same moment: still one record.
    expect((await put(token, 1, step1)).status).toBe(200);
    const together = await Promise.all(
      ["2026-27 A", "2026-27 B", "2026-27 C"].map((name) =>
        put(token, 1, { ...step1, academicYear: { name, startDate: "2026-06-15", endDate: "2027-04-30" } })
      )
    );
    expect(together.map((r) => r.status)).toEqual([200, 200, 200]);

    const years = await yearsOf(tenantId);
    expect(years).toHaveLength(1);
    expect(years[0]).toMatchObject({ status: "pending", source: "onboarding", activatedAt: null });
    expect(years[0].startDate.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(years[0].endDate.toISOString()).toBe("2027-04-30T00:00:00.000Z");

    // Signing in again (a fresh read) shows what is stored, and the session month follows the start date.
    const again = await request(app).post("/api/v1/auth/login").send({ email: "principal@sunrise.example", password: PASSWORD });
    const state = (await request(app).get("/api/v1/onboarding").set(auth(again.body.data.accessToken))).body.data;
    expect(state.steps[1].academicYear).toEqual({ name: years[0].name, startDate: "2026-06-15", endDate: "2027-04-30", status: "pending" });
    expect(state.steps[1].sessionStartMonth).toBe(6);
    expect((await Tenant.findById(tenantId))?.profile?.sessionStartMonth).toBe(6);
  });

  it("must be named before a form saved without one can be submitted", async () => {
    const { session } = await selfRegister();
    const token = session.accessToken as string;
    await fillAll(token);
    // As if step 1 had been saved before academic years existed.
    await AcademicYear.deleteMany({ tenantId: session.tenant.id });
    const res = await request(app).post("/api/v1/onboarding/submit").set(auth(token));
    expect(res.status).toBe(400);
    expect(res.body.details.missingSteps).toEqual([1]);
  });

  it("stays pending while the school waits and after a rejection; approval makes it the one active year, exactly once", async () => {
    const { token, tenantId } = await submittedSchool();
    const su = await superToken();

    // The super admin sees it on the review page.
    const review = (await request(app).get(`/api/v1/tenants/${tenantId}/review`).set(auth(su))).body.data;
    expect(review.steps[1].academicYear).toEqual({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: "pending" });

    // A pending school cannot reach the school's screens, so it cannot read or set up a year either.
    expect((await request(app).get("/api/v1/academics/academic-years/current").set(auth(token))).body.code).toBe("TENANT_NOT_APPROVED");

    await request(app).post(`/api/v1/tenants/${tenantId}/reject`).set(auth(su)).send({ reason: "The UDISE+ code does not match. Please correct it." });
    expect((await yearsOf(tenantId)).map((y) => y.status)).toEqual(["pending"]);

    // The school fixes its dates and resubmits: the same record is updated.
    expect((await put(token, 1, { ...step1, academicYear: { name: "2026-2027", startDate: "2026-04-10", endDate: "2027-03-31" } })).status).toBe(200);
    await put(token, 4, { confirmed: true });
    expect((await request(app).post("/api/v1/onboarding/submit").set(auth(token))).status).toBe(200);
    expect(await yearsOf(tenantId)).toHaveLength(1);

    // Two approvals at the same moment: one wins, the other is told it is already decided.
    const both = await Promise.all([1, 2].map(() => request(app).post(`/api/v1/tenants/${tenantId}/approve`).set(auth(su)).send({})));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);

    const years = await yearsOf(tenantId);
    expect(years).toHaveLength(1);
    expect(years[0]).toMatchObject({ status: "active", name: "2026-2027" });
    expect(years[0].activatedAt).toBeTruthy();
    expect(years[0].startDate.toISOString().slice(0, 10)).toBe("2026-04-10");

    const current = await request(app).get("/api/v1/academics/academic-years/current").set(auth(token));
    expect(current.status).toBe(200);
    expect(current.body.data).toEqual({
      year: { id: years[0]._id.toString(), name: "2026-2027", startDate: "2026-04-10", endDate: "2027-03-31", status: "active", activatedAt: years[0].activatedAt!.toISOString() },
      needsSetUp: false,
    });
    // It is not set up a second time.
    const setUp = await request(app).post("/api/v1/academics/academic-years/initial").set(auth(token)).send({ name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" });
    expect(setUp.status).toBe(409);
  });

  it("is switched on by the first read if the approval could not do it, and never for a school that is not approved", async () => {
    const { token, tenantId } = await submittedSchool();
    await request(app).post(`/api/v1/tenants/${tenantId}/approve`).set(auth(await superToken())).send({});
    // As if switching it on had failed during the approval.
    await AcademicYear.updateMany({ tenantId }, { $set: { status: "pending", activatedAt: null } });

    const current = await request(app).get("/api/v1/academics/academic-years/current").set(auth(token));
    expect(current.body.data.year).toMatchObject({ name: "2026-2027", status: "active" });
    expect((await yearsOf(tenantId)).map((y) => y.status)).toEqual(["active"]);

    // The repair checks the approval first: a pending school's year is left pending.
    const waiting = await submittedSchool("Moonrise Public School", "principal@moonrise.example");
    expect(await AcademicYearService.current(waiting.tenantId)).toEqual({ year: null, needsSetUp: false });
    expect((await yearsOf(waiting.tenantId)).map((y) => y.status)).toEqual(["pending"]);
  });

  it("is the year of every section the school makes once it is approved", async () => {
    const { token, tenantId } = await submittedSchool();
    await request(app).post(`/api/v1/tenants/${tenantId}/approve`).set(auth(await superToken())).send({});
    const [year] = await yearsOf(tenantId);

    const made = await request(app).post("/api/v1/academics/classes").set(auth(token)).send({ name: "Hobby Club", sectionCount: 2 });
    expect(made.status).toBe(201);
    const sections = await Section.find({ tenantId, classId: made.body.data.id }).lean();
    expect(sections.map((s) => String(s.academicYearId))).toEqual([String(year._id), String(year._id)]);
    const structure = (await request(app).get("/api/v1/academics/structure").set(auth(token))).body.data;
    expect(structure.academicYear).toEqual({ id: String(year._id), name: "2026-2027" });
  });
});
