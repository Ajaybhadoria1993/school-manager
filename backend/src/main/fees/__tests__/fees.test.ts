import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { FeeLine } from "../models/FeeLine";

const api = "/api/v1/fees";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const put = (token: string, path: string, body: object) => request(app).put(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);
const del = (token: string, path: string) => request(app).delete(`${api}${path}`).set(auth(token));
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };
const NEXT = { name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" };

/** A school with its running year (from April) and three classes. */
async function school(name = "Sunrise Public School") {
  const s = await createSchool(name);
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  const klass = async (className: string) => (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: className, capacity: 2000, sectionCount: 0 })).body.data.id as string;
  return { ...s, c1: await klass("Class 1"), c2: await klass("Class 2"), c3: await klass("Class 3") };
}

const head = async (token: string, over: Record<string, unknown> = {}) => (await post(token, "/heads", { name: "Tuition fee", kind: "tuition", ...over })).body.data as { id: string };
const chart = async (token: string, year?: string) => (await get(token, `/structure${year ? `?yearId=${year}` : ""}`)).body.data;
const classChart = async (token: string, classId: string, year?: string) => (await chart(token, year)).classes.find((c: { id: string }) => c.id === classId);

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the school's fee heads", () => {
  it("fills in what a head usually is (tuition every month, admission once for new students, a deposit is refundable) and keeps each name once", async () => {
    const s = await school();
    const tuition = await post(s.token, "/heads", { name: "  Tuition   fee ", kind: "tuition" });
    expect(tuition.status).toBe(201);
    expect(tuition.body.data).toMatchObject({ name: "Tuition fee", kind: "tuition", defaultFrequency: "monthly", defaultAppliesTo: "all", defaultOptional: false, refundable: false, isActive: true });
    expect((await post(s.token, "/heads", { name: "Admission fee", kind: "admission" })).body.data).toMatchObject({ defaultFrequency: "one_time", defaultAppliesTo: "new" });
    expect((await post(s.token, "/heads", { name: "Caution money", kind: "deposit" })).body.data).toMatchObject({ refundable: true, defaultFrequency: "one_time", defaultAppliesTo: "new" });
    expect((await post(s.token, "/heads", { name: "Uniform", kind: "supplies" })).body.data).toMatchObject({ defaultOptional: true });

    const again = await post(s.token, "/heads", { name: "tuition FEE", kind: "tuition" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("FEE_HEAD_NAME_TAKEN");
    expect((await get(s.token, "/heads")).body.data.items.map((h: { name: string }) => h.name)).toEqual(["Admission fee", "Caution money", "Tuition fee", "Uniform"]);
  });

  it("says what is wrong with a head, and refuses a one-time fee for existing students", async () => {
    const s = await school();
    const bad = await post(s.token, "/heads", { name: "", kind: "lunch", defaultFrequency: "one_time", defaultAppliesTo: "all" });
    expect(bad.status).toBe(400);
    expect(details(bad)).toEqual(expect.arrayContaining([{ path: "name", message: "Enter the name of the fee" }, { path: "kind", message: "Choose what the fee is about" }]));
    const once = await post(s.token, "/heads", { name: "Admission", kind: "admission", defaultFrequency: "one_time", defaultAppliesTo: "all" });
    expect(details(once)).toEqual([{ path: "defaultAppliesTo", message: "A one-time fee is for new students only" }]);
  });

  it("adds the usual fees in one go, leaving a name the school already has", async () => {
    const s = await school();
    await head(s.token);
    const res = await post(s.token, "/heads/many", { heads: [{ name: "Tuition fee", kind: "tuition" }, { name: "Exam fee", kind: "exam" }, { name: "Library fee", kind: "facility" }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: 2, skipped: 1 });
    expect((await get(s.token, "/heads")).body.data.items).toHaveLength(3);
  });

  it("changes a head, switches it off, and does not delete one that is on a fee chart or in a concession", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const exam = await head(s.token, { name: "Exam fee", kind: "exam" });
    expect((await patch(s.token, `/heads/${tuition.id}`, { name: "Tuition", defaultFrequency: "one_time" })).body.data).toMatchObject({ name: "Tuition", defaultFrequency: "one_time", defaultAppliesTo: "new" });
    expect((await patch(s.token, `/heads/${tuition.id}`, { defaultFrequency: "monthly" })).body.data).toMatchObject({ defaultFrequency: "monthly", defaultAppliesTo: "all" });
    expect((await patch(s.token, `/heads/${exam.id}`, { name: "Tuition" })).body.code).toBe("FEE_HEAD_NAME_TAKEN");

    await post(s.token, "/structure/lines", { classIds: [s.c1], headId: tuition.id, amount: 1200, frequency: "monthly" });
    const used = await del(s.token, `/heads/${tuition.id}`);
    expect(used.status).toBe(409);
    expect(used.body.code).toBe("FEE_HEAD_IN_USE");
    expect((await get(s.token, "/heads")).body.data.items.find((h: { id: string }) => h.id === tuition.id).inUse).toBe(true);
    expect((await patch(s.token, `/heads/${tuition.id}`, { isActive: false })).body.data.isActive).toBe(false);
    expect((await get(s.token, "/heads")).body.data.items.map((h: { name: string }) => h.name)).toEqual(["Exam fee"]);

    await post(s.token, "/concessions", { name: "Exam waiver", basis: "need", mode: "percent", value: 100, appliesTo: "selected", headIds: [exam.id] });
    expect((await del(s.token, `/heads/${exam.id}`)).status).toBe(409);
  });
});

describe("a class's fee chart", () => {
  it("gives several classes the same fee at once, with the usual months for how often it is charged (counted from the month the session starts)", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const res = await post(s.token, "/structure/lines", { classIds: [s.c1, s.c2], headId: tuition.id, amount: 1200, frequency: "quarterly" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toEqual({ created: 2 });
    const one = await classChart(s.token, s.c1);
    expect(one.lines).toHaveLength(1);
    expect(one.lines[0]).toMatchObject({ headName: "Tuition fee", amount: 1200, frequency: "quarterly", dueMonths: [4, 7, 10, 1], appliesTo: "all", optional: false, yearly: 4800 });
    expect((await classChart(s.token, s.c3)).lines).toEqual([]);
    expect((await chart(s.token)).year).toMatchObject({ name: "2026-2027", status: "active" });
  });

  it("adds up what a new student, an existing student and the optional fees come to, with the refundable part and the one-time part", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const admission = await head(s.token, { name: "Admission fee", kind: "admission" });
    const deposit = await head(s.token, { name: "Caution money", kind: "deposit" });
    const readmission = await head(s.token, { name: "Re-admission fee", kind: "admission", defaultFrequency: "yearly" });
    const uniform = await head(s.token, { name: "Uniform", kind: "supplies" });
    const add = (headId: string, amount: number, frequency: string, extra: object = {}) => post(s.token, "/structure/lines", { classIds: [s.c1], headId, amount, frequency, ...extra });
    expect((await add(tuition.id, 1000, "monthly")).status).toBe(201);
    expect((await add(admission.id, 5000, "one_time")).status).toBe(201);
    expect((await add(deposit.id, 2000, "one_time")).status).toBe(201);
    expect((await add(readmission.id, 1500, "yearly", { appliesTo: "existing" })).status).toBe(201);
    expect((await add(uniform.id, 3000, "yearly", { optional: true })).status).toBe(201);

    const c = await classChart(s.token, s.c1);
    // New: 12,000 tuition + 5,000 + 2,000. Existing: 12,000 tuition + 1,500. Optional: 3,000.
    expect(c.totals).toEqual({ newStudent: 19000, atJoining: 7000, existingStudent: 13500, refundable: 2000, optional: 3000 });
    // In the order a fee chart is read: joining fees, the deposit, tuition, then the rest.
    expect(c.lines.map((l: { headName: string }) => l.headName)).toEqual(["Admission fee", "Re-admission fee", "Caution money", "Tuition fee", "Uniform"]);
  });

  it("charges a school that does not take May and June only for the months it chose", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const ten = [4, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    await post(s.token, "/structure/lines", { classIds: [s.c1], headId: tuition.id, amount: 1000, frequency: "monthly", dueMonths: ten });
    const c = await classChart(s.token, s.c1);
    expect(c.lines[0]).toMatchObject({ dueMonths: ten, yearly: 10000 });
    expect(c.totals.newStudent).toBe(10000);
  });

  it("says what is wrong: months that do not fit how often, an amount that is not money, a class or fee that is not the school's", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const base = { classIds: [s.c1], headId: tuition.id, amount: 1000 };
    const one = (over: object) => post(s.token, "/structure/lines", { ...base, ...over });
    expect(details(await one({ frequency: "quarterly", dueMonths: [4, 10] }))).toEqual([{ path: "dueMonths", message: "Choose 4 months: the fee is charged four times a year" }]);
    expect(details(await one({ frequency: "yearly", dueMonths: [4, 5] }))).toEqual([{ path: "dueMonths", message: "Choose 1 month: the fee is charged once a year" }]);
    expect(details(await one({ frequency: "monthly", dueMonths: [] }))).toEqual([{ path: "dueMonths", message: "Choose the months the fee is charged in (1 to 12)" }]);
    expect(details(await one({ frequency: "yearly", dueMonths: [4, 4] }))[0].message).toBe("A month is chosen once");
    expect(details(await one({ frequency: "one_time", dueMonths: [4] }))[0].message).toBe("A one-time fee has no months: it is paid when the child joins");
    expect(details(await one({ frequency: "one_time", appliesTo: "all" }))).toEqual([{ path: "appliesTo", message: "A one-time fee is for new students only" }]);
    expect(details(await one({ frequency: "yearly", amount: 0 }))[0]).toEqual({ path: "amount", message: "Enter an amount above 0" });
    expect(details(await one({ frequency: "yearly", amount: 12000000 }))[0].path).toBe("amount");
    expect(details(await one({ frequency: "yearly", amount: 10.555 }))[0]).toEqual({ path: "amount", message: "Use at most two decimals (paise)" });
    expect(details(await one({ frequency: "yearly", classIds: [] }))[0]).toEqual({ path: "classIds", message: "Choose at least one class" });

    const other = await school("Moonrise Public School");
    expect((await one({ frequency: "yearly", classIds: [other.c1] })).body.code).toBe("CLASS_NOT_FOUND");
    expect((await one({ frequency: "yearly", headId: (await head(other.token)).id })).body.code).toBe("FEE_HEAD_NOT_FOUND");
    expect(await FeeLine.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("refuses the transport fee (it comes from the stop a child boards at) and a fee that is switched off", async () => {
    const s = await school();
    const bus = await head(s.token, { name: "Bus fee", kind: "transport" });
    const refused = await post(s.token, "/structure/lines", { classIds: [s.c1], headId: bus.id, amount: 500, frequency: "monthly" });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("TRANSPORT_FEE_BY_STOP");
    const library = await head(s.token, { name: "Library", kind: "facility" });
    await patch(s.token, `/heads/${library.id}`, { isActive: false });
    expect((await post(s.token, "/structure/lines", { classIds: [s.c1], headId: library.id, amount: 100, frequency: "yearly" })).body.code).toBe("FEE_HEAD_OFF");
  });

  it("does not add a fee twice to a class and names the classes that have it, writing nothing; new and existing students may have their own line", async () => {
    const s = await school();
    const tuition = await head(s.token);
    await post(s.token, "/structure/lines", { classIds: [s.c1], headId: tuition.id, amount: 1000, frequency: "monthly" });
    const clash = await post(s.token, "/structure/lines", { classIds: [s.c1, s.c2], headId: tuition.id, amount: 1100, frequency: "monthly" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("FEE_LINE_EXISTS");
    expect(clash.body.message).toContain("Class 1");
    expect(clash.body.message).not.toContain("Class 2");
    expect((await classChart(s.token, s.c2)).lines).toEqual([]);
    // A school that charges a new student more than the rest has two lines for the same fee.
    const newer = await post(s.token, "/structure/lines", { classIds: [s.c1], headId: tuition.id, amount: 1300, frequency: "monthly", appliesTo: "new" });
    expect(newer.status).toBe(201);
    expect((await classChart(s.token, s.c1)).lines).toHaveLength(2);
  });

  it("changes a line (a new frequency brings its usual months) and takes one off", async () => {
    const s = await school();
    const exam = await head(s.token, { name: "Exam fee", kind: "exam" });
    await post(s.token, "/structure/lines", { classIds: [s.c1], headId: exam.id, amount: 500, frequency: "yearly" });
    const line = (await classChart(s.token, s.c1)).lines[0];
    const half = await patch(s.token, `/structure/lines/${line.id}`, { frequency: "half_yearly", amount: 600, notes: "Term 1 and 2" });
    expect(half.status, JSON.stringify(half.body)).toBe(200);
    expect(half.body.data).toMatchObject({ frequency: "half_yearly", dueMonths: [4, 10], amount: 600, yearly: 1200, notes: "Term 1 and 2" });
    expect((await patch(s.token, `/structure/lines/${line.id}`, { dueMonths: [9, 2] })).body.data.dueMonths).toEqual([9, 2]);
    expect(details(await patch(s.token, `/structure/lines/${line.id}`, { dueMonths: [9] }))).toEqual([{ path: "dueMonths", message: "Choose 2 months: the fee is charged twice a year" }]);
    expect((await patch(s.token, `/structure/lines/${line.id}`, { frequency: "one_time" })).body.data).toMatchObject({ frequency: "one_time", dueMonths: [], appliesTo: "new" });
    expect((await patch(s.token, `/structure/lines/${line.id}`, {})).status).toBe(400);

    expect((await del(s.token, `/structure/lines/${line.id}`)).status).toBe(200);
    expect((await classChart(s.token, s.c1)).lines).toEqual([]);
    expect((await del(s.token, `/structure/lines/${line.id}`)).body.code).toBe("FEE_LINE_NOT_FOUND");
  });

  it("warns when the development fee is more than 15% of the tuition fee, and not otherwise", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const development = await head(s.token, { name: "Development fee", kind: "development" });
    await post(s.token, "/structure/lines", { classIds: [s.c1, s.c2], headId: tuition.id, amount: 1000, frequency: "monthly" });
    await post(s.token, "/structure/lines", { classIds: [s.c1], headId: development.id, amount: 2000, frequency: "yearly" });
    await post(s.token, "/structure/lines", { classIds: [s.c2], headId: development.id, amount: 1800, frequency: "yearly" });
    expect((await classChart(s.token, s.c1)).warnings).toEqual(["The development fee is 17% of the tuition fee. The Supreme Court allows up to 15% (some states set a lower limit)."]);
    expect((await classChart(s.token, s.c2)).warnings).toEqual([]);
    expect((await classChart(s.token, s.c3)).warnings).toEqual([]);
  });

  it("gives other classes the fee chart of one class, keeping what they have unless told to replace it", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const exam = await head(s.token, { name: "Exam fee", kind: "exam" });
    await post(s.token, "/structure/lines", { classIds: [s.c1], headId: tuition.id, amount: 1000, frequency: "monthly" });
    await post(s.token, "/structure/lines", { classIds: [s.c1], headId: exam.id, amount: 400, frequency: "half_yearly" });
    await post(s.token, "/structure/lines", { classIds: [s.c2], headId: tuition.id, amount: 900, frequency: "monthly" });

    const kept = await post(s.token, "/structure/copy-class", { fromClassId: s.c1, toClassIds: [s.c2, s.c3] });
    expect(kept.body.data).toEqual({ added: 3, replaced: 0, skipped: 1 });
    expect((await classChart(s.token, s.c2)).lines.find((l: { headName: string }) => l.headName === "Tuition fee").amount).toBe(900);
    expect((await classChart(s.token, s.c3)).lines).toHaveLength(2);

    const replaced = await post(s.token, "/structure/copy-class", { fromClassId: s.c1, toClassIds: [s.c2], replace: true });
    expect(replaced.body.data).toEqual({ added: 0, replaced: 2, skipped: 0 });
    expect((await classChart(s.token, s.c2)).lines.find((l: { headName: string }) => l.headName === "Tuition fee").amount).toBe(1000);

    expect((await post(s.token, "/structure/copy-class", { fromClassId: s.c1, toClassIds: [s.c1] })).status).toBe(400);
    expect((await post(s.token, "/structure/copy-class", { fromClassId: await klassWithout(s), toClassIds: [s.c3] })).body.code).toBe("NOTHING_TO_COPY");
  });
});

/** A class of the school with no fees. */
async function klassWithout(s: { token: string }) {
  return (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: "Class 9", capacity: 100, sectionCount: 0 })).body.data.id as string;
}

describe("the next session's fee chart", () => {
  async function withUpcoming() {
    const s = await school();
    const tuition = await head(s.token);
    const exam = await head(s.token, { name: "Exam fee", kind: "exam" });
    await post(s.token, "/structure/lines", { classIds: [s.c1, s.c2], headId: tuition.id, amount: 1000, frequency: "monthly" });
    await post(s.token, "/structure/lines", { classIds: [s.c1], headId: exam.id, amount: 333, frequency: "yearly" });
    const next = await request(app).post(`${academics}/academic-years`).set(auth(s.token)).send(NEXT);
    expect(next.status, JSON.stringify(next.body)).toBe(201);
    return { ...s, next: next.body.data.id as string };
  }

  it("lists the running and the upcoming session, and sets the upcoming one up on its own", async () => {
    const s = await withUpcoming();
    const now = await chart(s.token);
    expect(now.years).toEqual([
      expect.objectContaining({ name: "2026-2027", status: "active" }),
      expect.objectContaining({ id: s.next, name: "2027-2028", status: "pending" }),
    ]);
    expect((await classChart(s.token, s.c1, s.next)).lines).toEqual([]);
    const tuition = (await get(s.token, "/heads")).body.data.items.find((h: { name: string }) => h.name === "Tuition fee");
    const made = await post(s.token, "/structure/lines", { yearId: s.next, classIds: [s.c1], headId: tuition.id, amount: 1100, frequency: "quarterly" });
    expect(made.status).toBe(201);
    expect((await classChart(s.token, s.c1, s.next)).lines[0]).toMatchObject({ amount: 1100, dueMonths: [4, 7, 10, 1] });
    // The running session is as it was.
    expect((await classChart(s.token, s.c1)).lines.find((l: { headName: string }) => l.headName === "Tuition fee").amount).toBe(1000);
  });

  it("starts from last session's fees with every amount raised by a percentage (a whole rupee), keeping what is already there", async () => {
    const s = await withUpcoming();
    const res = await post(s.token, "/structure/copy-year", { yearId: s.next, raisePercent: 10 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ added: 3, skipped: 0, from: "2026-2027", raisePercent: 10 });
    const c1 = await classChart(s.token, s.c1, s.next);
    expect(c1.lines.map((l: { headName: string; amount: number }) => [l.headName, l.amount]).sort()).toEqual([["Exam fee", 366], ["Tuition fee", 1100]]);

    const again = await post(s.token, "/structure/copy-year", { yearId: s.next });
    expect(again.body.data).toMatchObject({ added: 0, skipped: 3 });
    expect((await post(s.token, "/structure/copy-year", { yearId: s.next, raisePercent: 150 })).status).toBe(400);
  });

  it("has nothing to copy when there is no earlier session, or it has no fees", async () => {
    const s = await school();
    expect((await post(s.token, "/structure/copy-year", {})).body.code).toBe("NO_PREVIOUS_YEAR");
    const next = (await request(app).post(`${academics}/academic-years`).set(auth(s.token)).send(NEXT)).body.data.id as string;
    expect((await post(s.token, "/structure/copy-year", { yearId: next })).body.code).toBe("NOTHING_TO_COPY");
  });

  it("does not change a session that is over: it can only be looked at", async () => {
    const s = await withUpcoming();
    const tuition = (await get(s.token, "/heads")).body.data.items.find((h: { name: string }) => h.name === "Tuition fee");
    const made = await post(s.token, "/structure/lines", { yearId: s.next, classIds: [s.c1], headId: tuition.id, amount: 1100, frequency: "yearly" });
    expect(made.status).toBe(201);
    const line = (await classChart(s.token, s.c1, s.next)).lines[0];
    await AcademicYear.updateOne({ _id: s.next, tenantId: s.tenantId }, { $set: { status: "closed" } });
    expect((await patch(s.token, `/structure/lines/${line.id}`, { amount: 5 })).body.code).toBe("YEAR_READ_ONLY");
    expect((await del(s.token, `/structure/lines/${line.id}`)).body.code).toBe("YEAR_READ_ONLY");
    expect((await post(s.token, "/structure/lines", { yearId: s.next, classIds: [s.c2], headId: tuition.id, amount: 1, frequency: "yearly" })).body.code).toBe("YEAR_READ_ONLY");
    expect((await classChart(s.token, s.c1, s.next)).lines).toHaveLength(1);
  });
});

describe("the concessions", () => {
  it("keeps the concessions the school gives, by percentage or amount, on every fee or on some", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const sibling = await post(s.token, "/concessions", { name: "Sibling", basis: "sibling", mode: "percent", value: 10, appliesTo: "selected", headIds: [tuition.id], notes: "From the second child" });
    expect(sibling.status, JSON.stringify(sibling.body)).toBe(201);
    expect(sibling.body.data).toMatchObject({ name: "Sibling", mode: "percent", value: 10, appliesTo: "selected", headNames: ["Tuition fee"], needsApproval: true, isActive: true });
    const rte = await post(s.token, "/concessions", { name: "RTE seat", basis: "rte", mode: "percent", value: 100, needsApproval: false });
    expect(rte.body.data).toMatchObject({ appliesTo: "all", headIds: [], headNames: [], needsApproval: false });
    expect((await post(s.token, "/concessions", { name: "sibling", basis: "sibling", mode: "flat", value: 500 })).body.code).toBe("CONCESSION_NAME_TAKEN");

    const changed = await patch(s.token, `/concessions/${sibling.body.data.id}`, { value: 15, needsApproval: false });
    expect(changed.body.data).toMatchObject({ value: 15, needsApproval: false });
    expect((await patch(s.token, `/concessions/${sibling.body.data.id}`, { isActive: false })).body.data.isActive).toBe(false);
    expect((await get(s.token, "/concessions")).body.data.items.map((c: { name: string }) => c.name)).toEqual(["RTE seat"]);
    expect((await get(s.token, "/concessions?status=all")).body.data.items).toHaveLength(2);
    expect((await del(s.token, `/concessions/${rte.body.data.id}`)).status).toBe(200);
    expect((await del(s.token, `/concessions/${rte.body.data.id}`)).body.code).toBe("CONCESSION_NOT_FOUND");
  });

  it("says what is wrong: a percentage above 100, no fees chosen, a fee of another school", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const make = (over: object) => post(s.token, "/concessions", { name: "Merit", basis: "merit", mode: "percent", value: 25, ...over });
    expect(details(await make({ value: 120 }))).toEqual([{ path: "value", message: "A percentage cannot be more than 100" }]);
    expect(details(await make({ appliesTo: "selected", headIds: [] }))).toEqual([{ path: "headIds", message: "Choose the fees it takes off" }]);
    expect(details(await make({ basis: "birthday", name: "" }))).toEqual(expect.arrayContaining([{ path: "basis", message: "Choose why it is given" }, { path: "name", message: "Enter the name of the concession" }]));
    const theirs = await head((await school("Moonrise Public School")).token);
    expect((await make({ appliesTo: "selected", headIds: [theirs.id] })).body.code).toBe("FEE_HEAD_NOT_FOUND");
    expect((await make({ mode: "flat", value: 500, appliesTo: "selected", headIds: [tuition.id] })).status).toBe(201);
    const flat = (await get(s.token, "/concessions")).body.data.items[0];
    expect(details(await patch(s.token, `/concessions/${flat.id}`, { mode: "percent", value: 500 }))).toEqual([{ path: "value", message: "A percentage cannot be more than 100" }]);
  });
});

describe("the fee rules", () => {
  it("start as the usual rules, are saved whole, and say what is wrong with a late fine", async () => {
    const s = await school();
    const first = await get(s.token, "/rules");
    expect(first.body.data).toEqual({ dueDay: 10, graceDays: 0, lateFine: { mode: "none", amount: 0, maxAmount: null }, allowPartial: true, holdReportCard: false, holdCertificate: false, isDefault: true });

    const rules = { dueDay: 5, graceDays: 7, lateFine: { mode: "per_day", amount: 10, maxAmount: 500 }, allowPartial: false, holdReportCard: true, holdCertificate: true };
    const saved = await put(s.token, "/rules", rules);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data).toEqual({ ...rules, isDefault: false });
    expect((await get(s.token, "/rules")).body.data).toEqual({ ...rules, isDefault: false });

    expect(details(await put(s.token, "/rules", { ...rules, dueDay: 31 }))).toEqual([{ path: "dueDay", message: "The due day is 1 to 28" }]);
    expect(details(await put(s.token, "/rules", { ...rules, lateFine: { mode: "flat", amount: 0, maxAmount: null } }))).toEqual([{ path: "lateFine.amount", message: "Enter the fine" }]);
    expect(details(await put(s.token, "/rules", { ...rules, lateFine: { mode: "percent_per_month", amount: 150, maxAmount: null } }))).toEqual([{ path: "lateFine.amount", message: "A percentage cannot be more than 100" }]);
    // No fine: nothing else of it is kept.
    expect((await put(s.token, "/rules", { ...rules, lateFine: { mode: "none", amount: 50, maxAmount: 9 } })).body.data.lateFine).toEqual({ mode: "none", amount: 0, maxAmount: null });
  });
});

describe("who may set the fees up", () => {
  it("is the school admin and the principal, and the accountant (who starts with it); a teacher, a parent and a receptionist are not let in", async () => {
    const s = await school();
    const tuition = await head(s.token);
    const accountant = await addColleague(s.tenantId, "accountant");
    const principal = await addColleague(s.tenantId, "principal");
    const teacher = await addColleague(s.tenantId, "teacher");
    const receptionist = await addColleague(s.tenantId, "receptionist");

    for (const token of [accountant, principal]) {
      expect((await get(token, "/structure")).status).toBe(200);
      expect((await get(token, "/rules")).status).toBe(200);
    }
    expect((await post(accountant, "/structure/lines", { classIds: [s.c1], headId: tuition.id, amount: 900, frequency: "monthly" })).status).toBe(201);
    expect((await post(principal, "/heads", { name: "Sports", kind: "facility" })).status).toBe(201);

    for (const token of [teacher, receptionist]) {
      expect((await get(token, "/structure")).status).toBe(403);
      expect((await get(token, "/heads")).status).toBe(403);
      expect((await post(token, "/heads", { name: "Hack", kind: "other" })).status).toBe(403);
      expect((await put(token, "/rules", { dueDay: 1, graceDays: 0, lateFine: { mode: "none", amount: 0, maxAmount: null }, allowPartial: true, holdReportCard: false, holdCertificate: false })).status).toBe(403);
    }
  });
});
