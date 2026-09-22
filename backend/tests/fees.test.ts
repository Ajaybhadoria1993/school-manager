import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { FeeHead, FeeStructure } from "../src/models/Fee";
import { buildBaseFixture, BaseFixture } from "./helpers/fixtures";

async function setUpStructure(fixture: BaseFixture) {
  const tuition = await FeeHead.create({ tenantId: fixture.tenant._id, branchId: fixture.branch._id, name: "Tuition" });
  await FeeStructure.create({
    tenantId: fixture.tenant._id,
    branchId: fixture.branch._id,
    classId: fixture.classMaster._id,
    academicYearId: fixture.academicYear._id,
    name: "Standard",
    installments: [
      { name: "Term 1", dueDate: new Date("2026-06-01"), items: [{ feeHeadId: tuition._id, amount: 10000 }] },
      { name: "Term 2", dueDate: new Date("2026-12-01"), items: [{ feeHeadId: tuition._id, amount: 10000 }] },
    ],
  });
  return tuition;
}

describe("Fee Engine", () => {
  let fixture: BaseFixture;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
    await setUpStructure(fixture);
  });

  it("computes gross/net/outstanding correctly with no payments", async () => {
    const res = await request(app)
      .get(`/api/fees/students/${fixture.student._id}/summary`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ gross: 20000, concession: 0, net: 20000, paid: 0, outstanding: 20000 });
  });

  it("allows a partial payment and reduces outstanding by exactly that amount", async () => {
    const res = await request(app)
      .post("/api/fees/collect")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, installmentName: "Term 1", amount: 4000, mode: "cash" });
    expect(res.status).toBe(201);
    expect(res.body.data.receiptNumber).toMatch(/^RCPT-/);

    const summary = await request(app)
      .get(`/api/fees/students/${fixture.student._id}/summary`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`);
    const term1 = summary.body.data.installments.find((i: { name: string }) => i.name === "Term 1");
    expect(term1.paidAmount).toBe(4000);
    expect(term1.outstanding).toBe(6000);
    expect(term1.status).toBe("partial");
  });

  it("rejects collecting more than an installment's outstanding balance (offline and online)", async () => {
    const offline = await request(app)
      .post("/api/fees/collect")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, installmentName: "Term 1", amount: 15000, mode: "cash" });
    expect(offline.status).toBe(400);

    // Paying the exact outstanding amount is fine; it's only "more than owed" that's rejected.
    const exact = await request(app)
      .post("/api/fees/collect")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, installmentName: "Term 1", amount: 10000, mode: "cash" });
    expect(exact.status).toBe(201);

    const overpayOnline = await request(app)
      .post("/api/fees/online/order")
      .set("Authorization", `Bearer ${fixture.parent.token}`)
      .send({ studentId: fixture.student._id, installmentName: "Term 2", amount: 50000 });
    // Razorpay isn't configured in tests, but the amount-vs-outstanding check
    // must run first and reject with 400, not fall through to the 503.
    expect(overpayOnline.status).toBe(400);
  });

  it("applies a percentage concession before computing outstanding", async () => {
    await request(app)
      .post("/api/fees/concessions")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({
        studentId: fixture.student._id,
        academicYearId: fixture.academicYear._id,
        type: "percentage",
        value: 10,
        reason: "Sibling discount",
      });

    const summary = await request(app)
      .get(`/api/fees/students/${fixture.student._id}/summary`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`);
    // 10% off each 10,000 installment => 1,000 concession per installment, 2,000 total
    expect(summary.body.data.totals.concession).toBe(2000);
    expect(summary.body.data.totals.net).toBe(18000);
  });

  it("reverses a bounced cheque so the due reopens, and rejects re-bouncing a cash payment", async () => {
    const collect = await request(app)
      .post("/api/fees/collect")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({
        studentId: fixture.student._id,
        installmentName: "Term 1",
        amount: 10000,
        mode: "cheque",
        chequeNumber: "CHQ001",
        bankName: "Test Bank",
      });
    expect(collect.status).toBe(201);

    const afterCollect = await request(app)
      .get(`/api/fees/students/${fixture.student._id}/summary`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`);
    expect(afterCollect.body.data.installments.find((i: { name: string }) => i.name === "Term 1").outstanding).toBe(0);

    const bounce = await request(app)
      .patch(`/api/fees/transactions/${collect.body.data._id}/bounce`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ reason: "Insufficient funds", bounceFine: 250 });
    expect(bounce.status).toBe(200);
    expect(bounce.body.data.status).toBe("bounced");

    const afterBounce = await request(app)
      .get(`/api/fees/students/${fixture.student._id}/summary`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`);
    expect(afterBounce.body.data.installments.find((i: { name: string }) => i.name === "Term 1").outstanding).toBe(10000);

    const cashCollect = await request(app)
      .post("/api/fees/collect")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, installmentName: "Term 2", amount: 5000, mode: "cash" });

    const reBounce = await request(app)
      .patch(`/api/fees/transactions/${cashCollect.body.data._id}/bounce`)
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ reason: "n/a" });
    expect(reBounce.status).toBe(400);
  });

  it("never lets receipt numbers repeat, even across many collections", async () => {
    const receipts = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/fees/collect")
        .set("Authorization", `Bearer ${fixture.accountant.token}`)
        .send({ studentId: fixture.student._id, installmentName: "Term 1", amount: 1000, mode: "cash" });
      receipts.add(res.body.data.receiptNumber);
    }
    expect(receipts.size).toBe(5);
  });
});
