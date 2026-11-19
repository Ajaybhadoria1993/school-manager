import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { FeeCharge } from "../models/FeeCharge";
import { lateFineFor, outstandingOf, statusOf } from "../services/feeAccount.service";

/**
 * Collecting fees (2026-11-19, docs/fees.md): a student's fee account is made from the class's chart (instalment by instalment), concessions take
 * amounts off it, a receipt settles charges (in full or in part) with the late fine the rules ask for, a mistake is cancelled, and one school never
 * reaches another's accounts. The session in these tests is 2026-2027 (from 1 April 2026): "Tuition fee · Apr" fell due on 10 April 2026, so it is
 * late whenever the tests run in the session, and "Tuition fee · Mar" is not due until 10 March 2027.
 */
const api = "/api/v1/fees";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const put = (token: string, path: string, body: object) => request(app).put(`${api}${path}`).set(auth(token)).send(body);
const del = (token: string, path: string) => request(app).delete(`${api}${path}`).set(auth(token));
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

beforeEach(async () => {
  await seedSuperAdmin();
});

type Account = { charges: { id: string; label: string; dueDate: string; amount: number; concession: number; net: number; paid: number; outstanding: number; status: string; source: string }[]; totals: Record<string, number>; lateFineToday: number; concessions: { id: string; name: string; status: string }[]; receipts: { number: string; total: number; status: string }[]; optional: { lineId: string; headName: string }[] };

const head = async (token: string, body: object) => (await post(token, "/heads", body)).body.data.id as string;
const line = (token: string, classIds: string[], headId: string, body: object) => post(token, "/structure/lines", { classIds, headId, ...body });
const account = async (token: string, studentId: string) => (await get(token, `/students/${studentId}/account`)).body.data as Account;
const charge = (a: Account, label: string) => a.charges.find((c) => c.label === label)!;

/** A school with Class 5 - A (Asha, Kabir) and Class 1 (Mira): tuition 1,000 a month and admission 5,000 once for Class 5, an optional uniform, and the rules: due on the 10th, no grace, a flat fine of 100 for each late instalment. */
async function school(name = "Sunrise Public School", prefix = "sun.") {
  const s = await classroomSchool(name, prefix);
  const tuition = await head(s.token, { name: "Tuition fee", kind: "tuition" });
  const admission = await head(s.token, { name: "Admission fee", kind: "admission" });
  const uniform = await head(s.token, { name: "Uniform", kind: "supplies" });
  await line(s.token, [s.class5.id], tuition, { amount: 1000, frequency: "monthly" });
  await line(s.token, [s.class5.id], admission, { amount: 5000, frequency: "one_time" });
  const uniformLine = await line(s.token, [s.class5.id], uniform, { amount: 1500, frequency: "yearly", optional: true });
  expect(uniformLine.status).toBe(201);
  await put(s.token, "/rules", { dueDay: 10, graceDays: 0, lateFine: { mode: "flat", amount: 100, maxAmount: null }, allowPartial: true, holdReportCard: false, holdCertificate: false });
  return { ...s, tuition, admission, uniform };
}
const pay = (token: string, studentId: string, items: { chargeId: string; amount: number }[], over: object = {}) => post(token, "/collect", { studentId, mode: "cash", items, ...over });

describe("the rules of a payment, as plain numbers", () => {
  it("a charge reads paid, upcoming, late, partly paid or due; and what is owed never goes below 0", () => {
    const today = new Date("2026-11-19T00:00:00.000Z");
    const c = (dueDate: string, paid = 0, concession = 0) => ({ amount: 1000, concession, paid, dueDate: new Date(`${dueDate}T00:00:00.000Z`) });
    expect(statusOf(c("2026-11-10", 1000), today, 0)).toBe("paid");
    expect(statusOf(c("2026-11-10", 900, 100), today, 0)).toBe("paid");
    expect(statusOf(c("2026-12-10"), today, 0)).toBe("upcoming");
    expect(statusOf(c("2026-11-10"), today, 0)).toBe("overdue");
    // Nine days late with ten days of grace: not late yet.
    expect(statusOf(c("2026-11-10"), today, 10)).toBe("due");
    expect(statusOf(c("2026-11-10", 400), today, 10)).toBe("partial");
    expect(outstandingOf({ amount: 1000, concession: 200, paid: 900 })).toBe(0);
    expect(outstandingOf({ amount: 1000, concession: 0, paid: 400 })).toBe(600);
  });

  it("the late fine: none, flat for each late instalment, an amount a day, or a percentage a month; after the grace; capped", () => {
    const on = new Date("2026-11-19T00:00:00.000Z");
    const rows = [{ base: 1000, dueDate: new Date("2026-11-10T00:00:00.000Z") }, { base: 2000, dueDate: new Date("2026-10-10T00:00:00.000Z") }, { base: 500, dueDate: new Date("2026-12-10T00:00:00.000Z") }];
    const rules = (mode: "none" | "flat" | "per_day" | "percent_per_month", amount: number, maxAmount: number | null = null, graceDays = 0) => ({ graceDays, lateFine: { mode, amount, maxAmount } });
    expect(lateFineFor(rules("none", 100), rows, on)).toBe(0);
    // Two of the three are late (the third is not due yet).
    expect(lateFineFor(rules("flat", 100), rows, on)).toBe(200);
    // 9 days and 40 days late.
    expect(lateFineFor(rules("per_day", 10), rows, on)).toBe(490);
    // 1 month late on 1,000 and 2 months on 2,000, at 2% a month: 20 + 80.
    expect(lateFineFor(rules("percent_per_month", 2), rows, on)).toBe(100);
    expect(lateFineFor(rules("per_day", 10, 300), rows, on)).toBe(300);
    // 9 days late is within 10 days of grace; 40 days late is not.
    expect(lateFineFor(rules("flat", 100, null, 10), rows, on)).toBe(100);
  });
});

describe("a student's fee account", () => {
  it("is made from the class's chart, instalment by instalment, with the due days from the rules; the optional fee is offered, not charged", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    expect(a.charges).toHaveLength(13);
    expect(charge(a, "Tuition fee · Apr")).toMatchObject({ dueDate: "2026-04-10", amount: 1000, paid: 0, outstanding: 1000, source: "chart" });
    expect(charge(a, "Tuition fee · Jan").dueDate).toBe("2027-01-10");
    expect(charge(a, "Admission fee")).toMatchObject({ dueDate: "2026-04-10", amount: 5000 });
    expect(a.totals).toMatchObject({ amount: 17000, net: 17000, paid: 0, outstanding: 17000 });
    expect(a.optional).toMatchObject([{ headName: "Uniform" }]);
    expect(a.charges.some((c) => c.label.startsWith("Uniform"))).toBe(false);
    // Class 1 has no chart: nothing is owed.
    expect((await account(s.token, s.mira.id)).charges).toEqual([]);
  });

  it("opening it again changes nothing; a chart that was raised reaches what is unpaid and leaves what was paid alone", async () => {
    const s = await school();
    const first = await account(s.token, s.asha.id);
    expect((await account(s.token, s.asha.id)).charges).toHaveLength(13);
    expect(await FeeCharge.countDocuments({ tenantId: s.tenantId })).toBe(13);

    await pay(s.token, s.asha.id, [{ chargeId: charge(first, "Tuition fee · Apr").id, amount: 1000 }], { lateFine: 0 });
    const lineId = (await get(s.token, "/structure")).body.data.classes.find((c: { id: string }) => c.id === s.class5.id).lines.find((l: { headName: string }) => l.headName === "Tuition fee").id as string;
    expect((await request(app).patch(`${api}/structure/lines/${lineId}`).set(auth(s.token)).send({ amount: 1200 })).status).toBe(200);
    const raised = await account(s.token, s.asha.id);
    expect(charge(raised, "Tuition fee · Apr").amount).toBe(1000);
    expect(charge(raised, "Tuition fee · May").amount).toBe(1200);
    expect(raised.totals.amount).toBe(17000 + 11 * 200);
  });

  it("a student with the bus stop's fee also owes the bus every month", async () => {
    const s = await school();
    const vehicle = (await request(app).post("/api/v1/transport/vehicles").set(auth(s.token)).send({ number: "Bus 1", registrationNumber: "MP09 AB 1234", seats: 40 })).body.data.id as string;
    const route = (await request(app).post("/api/v1/transport/routes").set(auth(s.token)).send({ name: "Route 1", vehicleId: vehicle, stops: [{ name: "Arera", fee: "900" }] })).body.data.id as string;
    await request(app).post(`/api/v1/transport/routes/${route}/riders`).set(auth(s.token)).send({ studentId: s.asha.id, stopName: "Arera" });
    const a = await account(s.token, s.asha.id);
    expect(a.charges.filter((c) => c.source === "transport")).toHaveLength(12);
    expect(charge(a, "School bus · Apr")).toMatchObject({ amount: 900, dueDate: "2026-04-10" });
    expect(a.totals.amount).toBe(17000 + 12 * 900);
    // Taken off the route: the bus is no longer owed (nothing was paid on it).
    await request(app).delete(`/api/v1/transport/routes/${route}/riders/${s.asha.id}`).set(auth(s.token));
    expect((await account(s.token, s.asha.id)).charges.filter((c) => c.source === "transport")).toHaveLength(0);
  });

  it("the family may take an optional fee, which then is owed; it can be taken off only while nothing is paid on it", async () => {
    const s = await school();
    const before = await account(s.token, s.asha.id);
    const lineId = before.optional[0].lineId;
    const added = await post(s.token, `/students/${s.asha.id}/optional`, { lineId });
    expect(added.status).toBe(201);
    expect(charge(added.body.data, "Uniform · Apr")).toMatchObject({ amount: 1500, source: "optional" });
    expect((await post(s.token, `/students/${s.asha.id}/optional`, { lineId })).body.code).toBe("OPTIONAL_ALREADY_ADDED");
    expect((await account(s.token, s.asha.id)).optional).toEqual([]);

    await pay(s.token, s.asha.id, [{ chargeId: charge(added.body.data, "Uniform · Apr").id, amount: 500 }], { lateFine: 0 });
    const refused = await del(s.token, `/students/${s.asha.id}/optional/${lineId}`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CHARGE_HAS_PAYMENTS");
  });
});

describe("concessions given to a student", () => {
  const concession = async (token: string, body: object) => (await post(token, "/concessions", { name: "Sibling", basis: "sibling", mode: "percent", value: 10, appliesTo: "all", ...body })).body.data.id as string;

  it("a percentage off the fees it names, taken off each instalment; giving it twice is refused; taking it back brings the amount back", async () => {
    const s = await school();
    const sibling = await concession(s.token, { appliesTo: "selected", headIds: [s.tuition], needsApproval: false });
    const given = await post(s.token, `/students/${s.asha.id}/concessions`, { concessionId: sibling, note: "Brother is in Class 8" });
    expect(given.status).toBe(201);
    expect(charge(given.body.data, "Tuition fee · Apr")).toMatchObject({ amount: 1000, concession: 100, net: 900, outstanding: 900 });
    expect(charge(given.body.data, "Admission fee").concession).toBe(0);
    expect(given.body.data.totals).toMatchObject({ amount: 17000, concession: 1200, net: 15800 });
    expect(given.body.data.concessions).toMatchObject([{ name: "Sibling", status: "approved" }]);
    const again = await post(s.token, `/students/${s.asha.id}/concessions`, { concessionId: sibling });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CONCESSION_ALREADY_GIVEN");

    const revoked = await del(s.token, `/student-concessions/${given.body.data.concessions[0].id}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.totals).toMatchObject({ concession: 0, net: 17000 });
  });

  it("'every fee' means the class's fees (an RTE seat pays nothing) and not the bus; a flat amount is taken off each instalment; neither takes more than the instalment", async () => {
    const s = await school();
    const rte = await concession(s.token, { name: "RTE seat", basis: "rte", value: 100, needsApproval: false });
    const given = await post(s.token, `/students/${s.asha.id}/concessions`, { concessionId: rte });
    expect(given.body.data.totals).toMatchObject({ net: 0, outstanding: 0 });
    const flat = await concession(s.token, { name: "Merit", basis: "merit", mode: "flat", value: 400, needsApproval: false });
    const kabir = await post(s.token, `/students/${s.kabir.id}/concessions`, { concessionId: flat });
    expect(charge(kabir.body.data, "Tuition fee · Apr").concession).toBe(400);
    expect(charge(kabir.body.data, "Admission fee").concession).toBe(400);
  });

  it("one that needs approval waits when a cashier gives it, takes nothing off, and the school admin approves it; a cashier cannot approve", async () => {
    const s = await school();
    const needs = await concession(s.token, { needsApproval: true });
    const accountant = await addColleague(s.tenantId, "accountant");
    const given = await post(accountant, `/students/${s.asha.id}/concessions`, { concessionId: needs });
    expect(given.status).toBe(201);
    expect(given.body.data.concessions).toMatchObject([{ status: "pending" }]);
    expect(given.body.data.totals.concession).toBe(0);
    const id = given.body.data.concessions[0].id as string;
    expect((await post(accountant, `/student-concessions/${id}/approve`)).status).toBe(403);
    const approved = await post(s.token, `/student-concessions/${id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.data.concessions[0].status).toBe("approved");
    expect(approved.body.data.totals.concession).toBeGreaterThan(0);
  });

  it("the school's concession cannot be deleted once it has been given to a student", async () => {
    const s = await school();
    const id = await concession(s.token, { needsApproval: false });
    await post(s.token, `/students/${s.asha.id}/concessions`, { concessionId: id });
    const refused = await del(s.token, `/concessions/${id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CONCESSION_IN_USE");
  });
});

describe("taking a payment", () => {
  it("settles the instalments chosen, with the late fine the rules ask for, and gives a numbered receipt", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const apr = charge(a, "Tuition fee · Apr");
    const may = charge(a, "Tuition fee · May");
    const res = await pay(s.token, s.asha.id, [{ chargeId: apr.id, amount: 1000 }, { chargeId: may.id, amount: 1000 }], { reference: null, note: "Paid by father" });
    expect(res.status).toBe(201);
    // Two late instalments, a flat 100 each.
    expect(res.body.data).toMatchObject({ number: "2026-2027/0001", seq: 1, studentName: "Asha Verma", classLabel: "Class 5 - A", mode: "cash", lateFine: 200, total: 2200, status: "valid", note: "Paid by father" });
    expect(res.body.data.items).toEqual([
      { chargeId: apr.id, label: "Tuition fee · Apr", amount: 1000 },
      { chargeId: may.id, label: "Tuition fee · May", amount: 1000 },
    ]);
    const after = await account(s.token, s.asha.id);
    expect(charge(after, "Tuition fee · Apr")).toMatchObject({ paid: 1000, outstanding: 0, status: "paid" });
    expect(after.totals).toMatchObject({ paid: 2000, outstanding: 15000 });
    expect(after.receipts).toMatchObject([{ number: "2026-2027/0001", total: 2200, status: "valid" }]);
    // The next receipt is the next number.
    const next = await pay(s.token, s.asha.id, [{ chargeId: charge(after, "Tuition fee · Jun").id, amount: 1000 }], { lateFine: 0 });
    expect(next.body.data.number).toBe("2026-2027/0002");
  });

  it("the cashier may take less late fine (waive it), never more", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const apr = charge(a, "Tuition fee · Apr").id;
    const more = await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1000 }], { lateFine: 150 });
    expect(more.status).toBe(400);
    expect(details(more)).toEqual([{ path: "lateFine", message: "The late fine is at most ₹100" }]);
    const waived = await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1000 }], { lateFine: 0 });
    expect(waived.body.data).toMatchObject({ lateFine: 0, total: 1000 });
    // An instalment that is not late takes no fine at all.
    const mar = charge(a, "Tuition fee · Mar").id;
    const none = await pay(s.token, s.asha.id, [{ chargeId: mar, amount: 1000 }], { lateFine: 50 });
    expect(details(none)).toEqual([{ path: "lateFine", message: "There is no late fine to take for this payment" }]);
    expect((await pay(s.token, s.asha.id, [{ chargeId: mar, amount: 1000 }])).body.data).toMatchObject({ lateFine: 0, total: 1000 });
  });

  it("part payment: what is left is still owed; more than is owed is refused; the school may ask for the whole instalment", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const apr = charge(a, "Tuition fee · Apr").id;
    expect((await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 400 }], { lateFine: 0 })).status).toBe(201);
    const half = await account(s.token, s.asha.id);
    expect(charge(half, "Tuition fee · Apr")).toMatchObject({ paid: 400, outstanding: 600 });

    const over = await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 700 }], { lateFine: 0 });
    expect(over.status).toBe(400);
    expect(details(over)).toEqual([{ path: "items.0.amount", message: "Tuition fee · Apr: only ₹600 is owed" }]);
    expect((await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 600 }], { lateFine: 0 })).status).toBe(201);
    const paid = await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1 }], { lateFine: 0 });
    expect(details(paid)[0].message).toBe("Tuition fee · Apr is already paid");

    await put(s.token, "/rules", { dueDay: 10, graceDays: 0, lateFine: { mode: "none", amount: 0, maxAmount: null }, allowPartial: false, holdReportCard: false, holdCertificate: false });
    const may = charge(a, "Tuition fee · May").id;
    const refused = await pay(s.token, s.asha.id, [{ chargeId: may, amount: 400 }]);
    expect(details(refused)).toEqual([{ path: "items.0.amount", message: "Tuition fee · May: the school takes the whole instalment (₹1000), not part of it" }]);
    expect((await pay(s.token, s.asha.id, [{ chargeId: may, amount: 1000 }])).status).toBe(201);
  });

  it("a cheque or a draft needs its number; a day in the future is refused; a fee of another student, a made-up one, an empty list and one fee twice are refused", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const k = await account(s.token, s.kabir.id);
    const apr = charge(a, "Tuition fee · Apr").id;
    expect(details(await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1000 }], { mode: "cheque", lateFine: 0 }))).toEqual([{ path: "reference", message: "Enter the cheque number" }]);
    expect((await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1000 }], { mode: "cheque", reference: "000123", lateFine: 0 })).body.data.reference).toBe("000123");
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(details(await pay(s.token, s.asha.id, [{ chargeId: charge(a, "Tuition fee · May").id, amount: 1000 }], { paidOn: tomorrow }))[0].message).toBe("The day paid cannot be in the future");
    expect(details(await pay(s.token, s.asha.id, [{ chargeId: charge(k, "Tuition fee · May").id, amount: 1000 }]))[0].message).toBe("That fee is not on this student's account");
    expect(details(await pay(s.token, s.asha.id, [{ chargeId: "a".repeat(24), amount: 1 }]))[0].path).toBe("items.0.chargeId");
    expect((await pay(s.token, s.asha.id, [])).status).toBe(400);
    const may = charge(a, "Tuition fee · May").id;
    expect(details(await pay(s.token, s.asha.id, [{ chargeId: may, amount: 500 }, { chargeId: may, amount: 500 }]))[0].message).toBe("A fee is chosen once");
    expect((await pay(s.token, s.asha.id, [{ chargeId: may, amount: 0 }])).status).toBe(400);
    expect((await pay(s.token, s.asha.id, [{ chargeId: may, amount: 10.005 }])).status).toBe(400);
  });

  it("two payments for the same instalment at once cannot both succeed", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const apr = charge(a, "Tuition fee · Apr").id;
    const both = await Promise.all([pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1000 }], { lateFine: 0 }), pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1000 }], { lateFine: 0 })]);
    expect(both.map((r) => r.status).sort()).toEqual([201, expect.any(Number)]);
    expect(both.filter((r) => r.status === 201)).toHaveLength(1);
    expect(charge(await account(s.token, s.asha.id), "Tuition fee · Apr").paid).toBe(1000);
  });

  it("many receipts made at once each get their own number", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const months = ["Apr", "May", "Jun", "Jul"].map((m) => charge(a, `Tuition fee · ${m}`).id);
    const res = await Promise.all(months.map((id) => pay(s.token, s.asha.id, [{ chargeId: id, amount: 1000 }], { lateFine: 0 })));
    expect(res.every((r) => r.status === 201)).toBe(true);
    expect(res.map((r) => r.body.data.seq).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("cancelling a receipt", () => {
  it("gives the money back to the charges, keeps the number on record, and cannot be done twice", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const apr = charge(a, "Tuition fee · Apr").id;
    const receipt = (await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1000 }])).body.data;
    expect(receipt.total).toBe(1100);

    const cancelled = await post(s.token, `/receipts/${receipt.id}/cancel`, { reason: "Wrong student" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toMatchObject({ status: "cancelled", cancelReason: "Wrong student" });
    const after = await account(s.token, s.asha.id);
    expect(charge(after, "Tuition fee · Apr")).toMatchObject({ paid: 0, outstanding: 1000 });
    expect(after.receipts).toMatchObject([{ number: "2026-2027/0001", status: "cancelled" }]);
    const twice = await post(s.token, `/receipts/${receipt.id}/cancel`, { reason: "Again" });
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("RECEIPT_CANCELLED");
    expect(details(await post(s.token, `/receipts/${receipt.id}/cancel`, {}))[0].path).toBe("reason");
    // The number is not used again: the next receipt is 0002.
    expect((await pay(s.token, s.asha.id, [{ chargeId: apr, amount: 1000 }], { lateFine: 0 })).body.data.number).toBe("2026-2027/0002");
  });

  it("reads one receipt, whole, with the school and the session; and the list says who took it", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const made = (await pay(s.token, s.asha.id, [{ chargeId: charge(a, "Tuition fee · Apr").id, amount: 1000 }], { lateFine: 0 })).body.data;
    const one = (await get(s.token, `/receipts/${made.id}`)).body.data;
    expect(one).toMatchObject({ number: "2026-2027/0001", school: "Sunrise Public School", year: "2026-2027", total: 1000 });
    expect(one.receivedBy).toBeTruthy();
    expect((await get(s.token, "/receipts/" + "a".repeat(24))).status).toBe(404);
    expect((await get(s.token, "/receipts")).body.data.items).toMatchObject([{ number: "2026-2027/0001" }]);
    expect((await get(s.token, `/receipts?studentId=${s.asha.id}`)).body.data.items).toHaveLength(1);
    expect((await get(s.token, `/receipts?studentId=${s.kabir.id}`)).body.data.items).toHaveLength(0);
  });
});

describe("the dues and the day's collection", () => {
  it("lists who owes what now, worst first, by class; a student who has paid what is due is not on it", async () => {
    const s = await school();
    for (const id of [s.asha.id, s.kabir.id]) await account(s.token, id);
    const dues = (await get(s.token, "/dues")).body.data;
    expect(dues.items.map((i: { name: string }) => i.name).sort()).toEqual(["Asha Verma", "Kabir Rao"]);
    expect(dues.items[0]).toMatchObject({ classLabel: "Class 5 - A", overdue: expect.any(Number) });
    expect(dues.totals.students).toBe(2);
    expect((await get(s.token, `/dues?classId=${s.class1.id}`)).body.data.items).toEqual([]);
    expect((await get(s.token, "/dues?search=kab")).body.data.items.map((i: { name: string }) => i.name)).toEqual(["Kabir Rao"]);

    const a = await account(s.token, s.asha.id);
    const owed = a.charges.filter((c) => c.status === "overdue" || c.status === "due");
    expect((await pay(s.token, s.asha.id, owed.map((c) => ({ chargeId: c.id, amount: c.outstanding })))).status).toBe(201);
    expect((await get(s.token, "/dues")).body.data.items.map((i: { name: string }) => i.name)).toEqual(["Kabir Rao"]);
  });

  it("adds up what was taken today by how it was paid, with the late fine and what was cancelled", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    const k = await account(s.token, s.kabir.id);
    await pay(s.token, s.asha.id, [{ chargeId: charge(a, "Tuition fee · Apr").id, amount: 1000 }]);
    await pay(s.token, s.kabir.id, [{ chargeId: charge(k, "Tuition fee · Apr").id, amount: 1000 }], { mode: "upi", reference: "UTR1", lateFine: 0 });
    const wrong = (await pay(s.token, s.kabir.id, [{ chargeId: charge(k, "Tuition fee · May").id, amount: 1000 }], { lateFine: 0 })).body.data;
    await post(s.token, `/receipts/${wrong.id}/cancel`, { reason: "Typed wrong" });
    const day = (await get(s.token, "/collection")).body.data;
    expect(day).toMatchObject({ receipts: 2, total: 2100, lateFine: 100, cancelled: { count: 1, total: 1000 } });
    expect(day.byMode).toMatchObject([{ mode: "cash", total: 1100, count: 1 }, { mode: "upi", total: 1000, count: 1 }]);
    expect(day.byDay).toHaveLength(1);
  });
});

describe("what a parent sees", () => {
  it("the child's account with what was paid and is due, the concession that is in force, and the receipts that stand; never another family's child", async () => {
    const s = await school();
    const sibling = (await post(s.token, "/concessions", { name: "Sibling", basis: "sibling", mode: "percent", value: 10, appliesTo: "selected", headIds: [s.tuition], needsApproval: false })).body.data.id as string;
    await post(s.token, `/students/${s.asha.id}/concessions`, { concessionId: sibling });
    const a = await account(s.token, s.asha.id);
    const apr = (await pay(s.token, s.asha.id, [{ chargeId: charge(a, "Tuition fee · Apr").id, amount: 900 }], { lateFine: 0 })).body.data;
    const may = (await pay(s.token, s.asha.id, [{ chargeId: charge(a, "Tuition fee · May").id, amount: 900 }], { lateFine: 0 })).body.data;
    await post(s.token, `/receipts/${may.id}/cancel`, { reason: "Bounced" });

    const mine = (await request(app).get(`/api/v1/parent/children/${s.asha.id}/fees`).set(auth(s.tokens.ravi))).body.data;
    expect(mine.account.totals).toMatchObject({ amount: 17000, concession: 1200, net: 15800, paid: 900 });
    expect(mine.account.concessions).toMatchObject([{ name: "Sibling", mode: "percent", value: 10 }]);
    // The cancelled receipt is not on the parent's list.
    expect(mine.account.receipts).toMatchObject([{ number: apr.number, total: 900 }]);
    expect(mine.account.charges.find((c: { label: string }) => c.label === "Tuition fee · Apr")).toMatchObject({ paid: 900, outstanding: 0, status: "paid" });
    expect((await request(app).get(`/api/v1/parent/children/${s.asha.id}/fees`).set(auth(s.tokens.sita))).status).toBe(404);
  });

  it("a child with no class chart has an empty account, not an error", async () => {
    const s = await school();
    const res = (await request(app).get(`/api/v1/parent/children/${s.mira.id}/fees`).set(auth(s.tokens.anil))).body.data;
    expect(res.account).toMatchObject({ charges: [], totals: { amount: 0, outstanding: 0 } });
  });
});

describe("what stays on record", () => {
  it("a fee that families have paid cannot be taken off the chart; one nobody has paid can, and its charges go with it", async () => {
    const s = await school();
    const a = await account(s.token, s.asha.id);
    await pay(s.token, s.asha.id, [{ chargeId: charge(a, "Admission fee").id, amount: 5000 }], { lateFine: 0 });
    const chart = (await get(s.token, "/structure")).body.data.classes.find((c: { id: string }) => c.id === s.class5.id).lines as { id: string; headName: string }[];
    const admissionLine = chart.find((l) => l.headName === "Admission fee")!.id;
    const refused = await del(s.token, `/structure/lines/${admissionLine}`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("FEE_LINE_HAS_PAYMENTS");
    const tuitionLine = chart.find((l) => l.headName === "Tuition fee")!.id;
    expect((await del(s.token, `/structure/lines/${tuitionLine}`)).status).toBe(200);
    expect((await account(s.token, s.asha.id)).charges.map((c) => c.label)).toEqual(["Admission fee"]);
  });

  it("making the accounts of the whole school (or one class) in one go", async () => {
    const s = await school();
    const all = await post(s.token, "/generate", {});
    expect(all.body.data).toEqual({ students: 3, charges: 26 });
    expect(await FeeCharge.countDocuments({ tenantId: s.tenantId })).toBe(26);
    expect((await post(s.token, "/generate", { classId: s.class5.id })).body.data).toEqual({ students: 2, charges: 0 });
  });
});

describe("who may collect, and one school never reaches another's", () => {
  it("needs fees.collect: a receptionist without it, a teacher and a parent are refused; with it a receptionist collects but cannot cancel a receipt or set up the fees", async () => {
    const s = await school();
    const reception = await addColleague(s.tenantId, "receptionist");
    expect((await get(reception, `/students/${s.asha.id}/account`)).status).toBe(403);
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["fees.collect"] });
    const a = (await get(reception, `/students/${s.asha.id}/account`)).body.data as Account;
    expect(a.charges.length).toBe(13);
    const receipt = await pay(reception, s.asha.id, [{ chargeId: charge(a, "Tuition fee · Apr").id, amount: 1000 }], { lateFine: 0 });
    expect(receipt.status).toBe(201);
    expect((await post(reception, `/receipts/${receipt.body.data.id}/cancel`, { reason: "x" })).status).toBe(403);
    expect((await post(reception, "/heads", { name: "Lab fee", kind: "facility" })).status).toBe(403);
    for (const token of [s.tokens.meena, s.tokens.ravi]) {
      expect((await get(token, `/students/${s.asha.id}/account`)).status).toBe(403);
      expect((await get(token, "/dues")).status).toBe(403);
      expect((await pay(token, s.asha.id, [{ chargeId: charge(a, "Tuition fee · May").id, amount: 1000 }])).status).toBe(403);
    }
    expect((await request(app).get(`${api}/dues`)).status).toBe(401);
  });

  it("another school cannot read, pay into, concede, cancel or list this school's accounts, receipts and dues", async () => {
    const a = await school("Sunrise Public School", "sun.");
    const b = await school("Moonrise Public School", "moon.");
    const acct = await account(a.token, a.asha.id);
    const receipt = (await pay(a.token, a.asha.id, [{ chargeId: charge(acct, "Tuition fee · Apr").id, amount: 1000 }], { lateFine: 0 })).body.data;
    const sibling = (await post(b.token, "/concessions", { name: "Sibling", basis: "sibling", mode: "percent", value: 10, needsApproval: false })).body.data.id as string;

    expect((await get(b.token, `/students/${a.asha.id}/account`)).status).toBe(404);
    expect((await pay(b.token, a.asha.id, [{ chargeId: charge(acct, "Tuition fee · May").id, amount: 1000 }])).status).toBe(404);
    expect((await post(b.token, `/students/${a.asha.id}/concessions`, { concessionId: sibling })).status).toBe(404);
    expect((await get(b.token, `/receipts/${receipt.id}`)).status).toBe(404);
    expect((await post(b.token, `/receipts/${receipt.id}/cancel`, { reason: "x" })).status).toBe(404);
    expect((await get(b.token, "/receipts")).body.data.items).toEqual([]);
    expect((await get(b.token, "/collection")).body.data).toMatchObject({ receipts: 0, total: 0 });
    expect((await get(b.token, "/students/search?q=asha")).body.data.items.map((i: { id: string }) => i.id)).not.toContain(a.asha.id);
    // B's own student paying A's charge: not found on that student's account.
    const own = await pay(b.token, b.asha.id, [{ chargeId: charge(acct, "Tuition fee · May").id, amount: 1000 }]);
    expect(own.status).toBe(400);
    expect(charge(await account(a.token, a.asha.id), "Tuition fee · May").paid).toBe(0);
    expect(charge(await account(a.token, a.asha.id), "Tuition fee · Apr").paid).toBe(1000);
  });
});
