import { describe, expect, it } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { hashPassword } from "../../../utils/authUtils";
import { SchoolLogo } from "../../tenants/models/SchoolLogo";
import { Tenant } from "../../tenants/models/Tenant";
import { createTenant } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";

/** A school's logo, added at sign-up: on its report cards, certificates and receipts, and on the page the platform team reviews. */

const PASSWORD = "Sch00l@Admin";
const passwordHash = hashPassword(PASSWORD);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4, 1), Buffer.from("WEBP"), Buffer.alloc(32, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

let serial = 0;

async function school(approvalStatus: "onboarding" | "approved" = "onboarding") {
  serial += 1;
  const email = `logo${serial}@school.example`;
  const tenant = await createTenant({ name: `Logo School ${serial}`, contactEmail: email, approvalStatus, source: "signup" });
  await User.create({ name: "Asha", email, passwordHash: await passwordHash, role: "school_admin", tenantId: tenant._id });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return { tenantId: tenant._id.toString(), token: login.body.data.accessToken as string };
}

const upload = (token: string, file: Buffer, name = "logo.png") => request(app).put("/api/v1/onboarding/logo").set(auth(token)).attach("logo", file, name);
const logoUrlOf = (res: request.Response): string => res.body.data.steps[1].logoUrl;

describe("the school's logo", () => {
  it("has none to begin with", async () => {
    const s = await school();
    const res = await request(app).get("/api/v1/onboarding").set(auth(s.token));
    expect(res.body.data.steps[1].logoUrl).toBe("");
  });

  it("takes a PNG, and the form says where it is", async () => {
    const s = await school();
    const res = await upload(s.token, PNG);
    expect(res.status).toBe(200);
    expect(logoUrlOf(res)).toMatch(new RegExp(`^/public/schools/${s.tenantId}/logo\\?v=\\d+$`));
    expect(await SchoolLogo.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["WebP", WEBP, "image/webp"],
    ["PNG", PNG, "image/png"],
  ])("is served as what the file really is: %s", async (_name, file, type) => {
    const s = await school();
    await upload(s.token, file, "whatever.bin");
    const res = await request(app).get(`/api/v1/public/schools/${s.tenantId}/logo`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(type);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("anyone can see a logo: an image tag cannot send a sign-in", async () => {
    const s = await school();
    await upload(s.token, PNG);
    expect((await request(app).get(`/api/v1/public/schools/${s.tenantId}/logo`)).status).toBe(200);
  });

  it("refuses what is not a picture, whatever it is named", async () => {
    const s = await school();
    const res = await upload(s.token, Buffer.from("MZ this is a program"), "logo.png");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LOGO_NOT_IMAGE");
  });

  it("refuses an SVG, which can carry a script", async () => {
    const s = await school();
    const res = await upload(s.token, SVG, "logo.svg");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LOGO_NOT_IMAGE");
  });

  it("refuses a file that is too big, in words a person understands", async () => {
    const s = await school();
    const res = await upload(s.token, Buffer.concat([PNG, Buffer.alloc(600 * 1024, 1)]));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LOGO_TOO_BIG");
    expect(res.body.message).toBe("The logo is bigger than 500 KB. Choose a smaller picture.");
  });

  it("asks for a file when none was sent", async () => {
    const s = await school();
    const res = await request(app).put("/api/v1/onboarding/logo").set(auth(s.token));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LOGO_MISSING");
  });

  it("a new logo replaces the old one", async () => {
    const s = await school();
    await upload(s.token, PNG);
    await upload(s.token, JPEG);
    expect(await SchoolLogo.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect((await request(app).get(`/api/v1/public/schools/${s.tenantId}/logo`)).headers["content-type"]).toBe("image/jpeg");
  });

  it("can be taken away", async () => {
    const s = await school();
    await upload(s.token, PNG);
    const res = await request(app).delete("/api/v1/onboarding/logo").set(auth(s.token));
    expect(res.status).toBe(200);
    expect(logoUrlOf(res)).toBe("");
    expect((await request(app).get(`/api/v1/public/schools/${s.tenantId}/logo`)).status).toBe(404);
  });

  it("is not found for a school without one, or an address that is not a school", async () => {
    const s = await school();
    expect((await request(app).get(`/api/v1/public/schools/${s.tenantId}/logo`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/public/schools/${new Types.ObjectId()}/logo`)).status).toBe(404);
    expect((await request(app).get("/api/v1/public/schools/nonsense/logo")).status).toBe(404);
  });

  it("cannot be changed once the form is with the platform team", async () => {
    const s = await school();
    await Tenant.updateOne({ _id: s.tenantId }, { $set: { approvalStatus: "pending" } });
    const res = await upload(s.token, PNG);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ONBOARDING_LOCKED");
  });

  it("does not make a step of the form count as done", async () => {
    const s = await school();
    const res = await upload(s.token, PNG);
    expect(res.body.data.onboarding.completedSteps).toEqual([]);
  });

  it("changes one school's logo only", async () => {
    const a = await school();
    const b = await school();
    await upload(a.token, PNG);
    await upload(b.token, JPEG);
    expect((await request(app).get(`/api/v1/public/schools/${a.tenantId}/logo`)).headers["content-type"]).toBe("image/png");
    expect((await request(app).get(`/api/v1/public/schools/${b.tenantId}/logo`)).headers["content-type"]).toBe("image/jpeg");
  });

  it("a teacher cannot change it", async () => {
    const s = await school();
    const email = `teacher${serial}@school.example`;
    await User.create({ name: "Teacher", email, passwordHash: await passwordHash, role: "teacher", tenantId: s.tenantId });
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    expect((await upload(login.body.data.accessToken, PNG)).status).toBe(403);
  });
});
