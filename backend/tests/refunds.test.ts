import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { FeeHead, FeeStructure } from "../src/models/Fee";
import { buildBaseFixture, BaseFixture } from "./helpers/fixtures";

describe("Fee Refunds", () => {
  let fixture: BaseFixture;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
    const tuition = await FeeHead.create({ tenantId: fixture.tenant._id, branchId: fixture.branch._id, name: "Tuition" });
    await FeeStructure.create({
      tenantId: fixture.tenant._id,
      branchId: fixture.branch._id,
      classId: fixture.classMaster._id,
      academicYearId: fixture.academicYear._id,
      name: "Standard",
      installments: [{ name: "Term 1", dueDate: new Date("2026-06-01"), items: [{ feeHeadId: tuition._id, amount: 20000 }] }],
    });
    await request(app)
      .post("/api/fees/collect")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, installmentName: "Term 1", amount: 20000, mode: "cash" });
  });

  it("rejects a refund request larger than what was ever paid", async () => {
    const res = await request(app)
      .post("/api/fees/refunds")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, amount: 25000, reason: "Withdrawal" });
    expect(res.status).toBe(400);
  });

  it("runs the full request -> approve -> process chain, and blocks processing before approval", async () => {
    const request1 = await request(app)
      .post("/api/fees/refunds")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, amount: 15000, reason: "Withdrawal mid-year" });
    expect(request1.status).toBe(201);
    expect(request1.body.data.status).toBe("pending");

    const earlyProcess = await request(app)
      .patch(`/api/fees/refunds/${request1.body.data._id}/process`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ refundMode: "cash" });
    expect(earlyProcess.status).toBe(400);

    const approve = await request(app)
      .patch(`/api/fees/refunds/${request1.body.data._id}/decide`)
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ status: "approved" });
    expect(approve.status).toBe(200);

    const process = await request(app)
      .patch(`/api/fees/refunds/${request1.body.data._id}/process`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ refundMode: "bank_transfer", referenceNote: "UTR123" });
    expect(process.status).toBe(200);
    expect(process.body.data.status).toBe("processed");
  });

  it("counts a pending refund request against the available-to-refund cap for a second request", async () => {
    await request(app)
      .post("/api/fees/refunds")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, amount: 15000, reason: "First request" });

    const second = await request(app)
      .post("/api/fees/refunds")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, amount: 10000, reason: "Second request" });
    expect(second.status).toBe(400);
  });
});
