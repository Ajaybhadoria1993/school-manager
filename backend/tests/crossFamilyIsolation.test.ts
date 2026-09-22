import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { buildBaseFixture, buildSecondFamily, BaseFixture } from "./helpers/fixtures";

// Regression coverage for a real bug found and fixed mid-project: any parent
// could view any OTHER family's child's data just by knowing/guessing the
// studentId, since only tenant/branch scoping existed — not per-student
// ownership. Every one of these must return 403/404, never real data.
describe("Cross-family data isolation", () => {
  let fixture: BaseFixture;
  let other: Awaited<ReturnType<typeof buildSecondFamily>>;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
    other = await buildSecondFamily(fixture);
  });

  it("a parent can fetch their OWN child's fee summary", async () => {
    const res = await request(app)
      .get(`/api/fees/students/${fixture.student._id}/summary`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(res.status).toBe(200);
  });

  it("blocks a parent from another family's child's fee summary", async () => {
    const res = await request(app)
      .get(`/api/fees/students/${other.student._id}/summary`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(res.status).toBe(403);
  });

  it("blocks a parent from another family's child's attendance summary", async () => {
    const res = await request(app)
      .get(`/api/attendance/student/${other.student._id}/summary`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(res.status).toBe(403);
  });

  it("blocks a parent from another family's child's profile", async () => {
    const res = await request(app)
      .get(`/api/students/${other.student._id}`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(res.status).toBe(403);
  });

  it("blocks a parent from another family's child's homework feed", async () => {
    const res = await request(app)
      .get(`/api/homework/student/${other.student._id}`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(res.status).toBe(403);
  });

  it("blocks a parent from listing the full student roster (must use /my-children)", async () => {
    const res = await request(app).get("/api/students").set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(res.status).toBe(403);
  });

  it("blocks a parent from creating a Razorpay order for another family's child", async () => {
    const res = await request(app)
      .post("/api/fees/online/order")
      .set("Authorization", `Bearer ${fixture.parent.token}`)
      .send({ studentId: other.student._id, installmentName: "Term 1", amount: 1000 });
    // Razorpay isn't configured in tests either, but the ownership check
    // must run and fail BEFORE that 503 — so this must be 403, not 503.
    expect(res.status).toBe(403);
  });

  it("a parent only ever sees their own children from /my-children, never another family's", async () => {
    const res = await request(app).get("/api/students/my-children").set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: { _id: string }) => s._id);
    expect(ids).toContain(String(fixture.student._id));
    expect(ids).not.toContain(String(other.student._id));
  });
});
