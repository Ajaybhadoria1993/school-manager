import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";

/**
 * A parent reads their own child's school bus and fee chart (2026-11-19). Ravi is Asha's father (Class 5 - A); Sita is Kabir's mother (the
 * same class); Anil is Mira's father (Class 1). Only a child's own parent reads either, and only while the school allows it (Permissions).
 */
const parent = "/api/v1/parent";
const transport = "/api/v1/transport";
const fees = "/api/v1/fees";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await seedSuperAdmin();
});

const bus = (token: string, childId: string) => request(app).get(`${parent}/children/${childId}/bus`).set(auth(token));
const feeChart = (token: string, childId: string) => request(app).get(`${parent}/children/${childId}/fees`).set(auth(token));

/** The school, with Route 1 (Bus 1, driver Ramesh, stops with times and a fee) and Asha on it at Arera Colony; the driver's link and phone. */
async function withBus() {
  const s = await classroomSchool();
  const vehicle = (await request(app).post(`${transport}/vehicles`).set(auth(s.token)).send({ number: "Bus 1", registrationNumber: "MP09 AB 1234", seats: 40 })).body.data.id as string;
  const driver = (await request(app).post(`${transport}/drivers`).set(auth(s.token)).send({ name: "Ramesh Yadav", mobile: "9876543210" })).body.data.id as string;
  const route = (
    await request(app)
      .post(`${transport}/routes`)
      .set(auth(s.token))
      .send({ name: "Route 1", vehicleId: vehicle, driverId: driver, morningStart: "07:00", afternoonStart: "14:15", stops: [{ name: "Arera Colony", pickupTime: "07:10", dropTime: "14:40", fee: "900" }] })
  ).body.data.id as string;
  const link = (await request(app).post(`${transport}/vehicles/${vehicle}/tracking-key`).set(auth(s.token))).body.data.key as string;
  const ping = (body: object) => request(app).post(`${transport}/tracking/ping`).set({ "X-Tracking-Link": link }).send(body);
  return { ...s, vehicle, route, link, ping };
}
const board = (s: { token: string; route: string }, studentId: string) => request(app).post(`${transport}/routes/${s.route}/riders`).set(auth(s.token)).send({ studentId, stopName: "Arera Colony" });

describe("the child's school bus", () => {
  it("says there is none until the school puts the child on a route", async () => {
    const s = await withBus();
    expect((await bus(s.tokens.ravi, s.asha.id)).body.data).toEqual({ assigned: false });
  });

  it("gives the route, the stop and its times, the vehicle, and who drives; and where it is only while it is live", async () => {
    const s = await withBus();
    await board(s, s.asha.id);

    // The driver link is made but the bus has not reported yet: it can be followed, it is not out.
    const quiet = (await bus(s.tokens.ravi, s.asha.id)).body.data;
    expect(quiet).toMatchObject({
      assigned: true,
      route: { name: "Route 1", morningStart: "07:00", afternoonStart: "14:15" },
      stop: { name: "Arera Colony", pickupTime: "07:10", dropTime: "14:40", fee: 900 },
      vehicle: { number: "Bus 1", registrationNumber: "MP09 AB 1234" },
      driver: { name: "Ramesh Yadav", mobile: "9876543210" },
      attendant: null,
      tracking: { enabled: true, live: null, lastSeenSeconds: null },
    });

    await s.ping({ lat: 23.2599, lng: 77.4126, speedKmph: 28, heading: 90, accuracy: 10 });
    const out = (await bus(s.tokens.ravi, s.asha.id)).body.data;
    expect(out.tracking.live).toMatchObject({ lat: 23.2599, lng: 77.4126, speedKmph: 28, heading: 90 });
    expect(out.tracking.lastSeenSeconds).toBeGreaterThanOrEqual(0);

    // The trip ends: no position is given at all (where the bus is parked at night is not the parents' business), only "last seen".
    await request(app).post(`${transport}/tracking/stop`).set({ "X-Tracking-Link": s.link });
    const after = await bus(s.tokens.ravi, s.asha.id);
    expect(after.body.data.tracking.live).toBeNull();
    expect(after.body.data.tracking.lastSeenSeconds).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(after.body)).not.toContain("23.2599");
    expect(JSON.stringify(after.body)).not.toContain("77.4126");
  });

  it("a route with no driver link has no tracking, and a closed route is no bus at all", async () => {
    const s = await withBus();
    await board(s, s.asha.id);
    await request(app).delete(`${transport}/vehicles/${s.vehicle}/tracking-key`).set(auth(s.token));
    expect((await bus(s.tokens.ravi, s.asha.id)).body.data.tracking).toEqual({ enabled: false, live: null, lastSeenSeconds: null });
    await request(app).patch(`${transport}/routes/${s.route}`).set(auth(s.token)).send({ isActive: false });
    expect((await bus(s.tokens.ravi, s.asha.id)).body.data).toEqual({ assigned: false });
  });

  it("is only the parent's own child's: another family's child, in the same class or not, is not found", async () => {
    const s = await withBus();
    await board(s, s.asha.id);
    await board(s, s.kabir.id);
    for (const other of [s.kabir.id, s.mira.id]) {
      const res = await bus(s.tokens.ravi, other);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("STUDENT_NOT_FOUND");
    }
    expect((await bus(s.tokens.sita, s.kabir.id)).body.data.assigned).toBe(true);
    expect((await bus(s.tokens.anil, s.mira.id)).body.data.assigned).toBe(false);
  });

  it("is refused to staff and teachers (parents only), and to a parent the school has not allowed it", async () => {
    const s = await withBus();
    await board(s, s.asha.id);
    expect((await bus(s.tokens.meena, s.asha.id)).status).toBe(403);
    expect((await bus(s.token, s.asha.id)).status).toBe(403);
    expect((await request(app).get(`${parent}/children/${s.asha.id}/bus`)).status).toBe(401);
    await request(app).put("/api/v1/permissions/parent").set(auth(s.token)).send({ permissions: ["calendar.view", "child.attendance"] });
    const refused = await bus(s.tokens.ravi, s.asha.id);
    expect(refused.status).toBe(403);
    // Allowed again: it works.
    await request(app).put("/api/v1/permissions/parent").set(auth(s.token)).send({ permissions: ["child.transport"] });
    expect((await bus(s.tokens.ravi, s.asha.id)).status).toBe(200);
  });

  it("another school's parent cannot read it either", async () => {
    const a = await withBus();
    await board(a, a.asha.id);
    const b = await classroomSchool("Moonrise Public School", "moon.");
    expect((await bus(b.tokens.ravi, a.asha.id)).status).toBe(404);
  });
});

describe("the child's fee chart", () => {
  const head = async (token: string, body: object) => (await request(app).post(`${fees}/heads`).set(auth(token)).send(body)).body.data.id as string;
  const line = (token: string, classIds: string[], headId: string, body: object) => request(app).post(`${fees}/structure/lines`).set(auth(token)).send({ classIds, headId, ...body });

  it("is empty (an account with nothing owed) while the class has no fee chart", async () => {
    const s = await classroomSchool();
    const res = await feeChart(s.tokens.ravi, s.asha.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ account: { charges: [], totals: { amount: 0, outstanding: 0 } }, className: "Class 5 - A", audience: "new", year: { name: "2026-2027" }, chart: { lines: [], compulsory: 0, optional: 0, refundable: 0 }, transport: null });
  });

  it("gives the fees of the child's own class for a student like theirs, in reading order, with what they come to", async () => {
    const s = await classroomSchool();
    const tuition = await head(s.token, { name: "Tuition fee", kind: "tuition" });
    const admission = await head(s.token, { name: "Admission fee", kind: "admission" });
    const caution = await head(s.token, { name: "Caution money", kind: "deposit" });
    const uniform = await head(s.token, { name: "Uniform", kind: "supplies" });
    const reAdmission = await head(s.token, { name: "Re-admission", kind: "admission" });
    expect((await line(s.token, [s.class5.id], tuition, { amount: 1000, frequency: "monthly" })).status).toBe(201);
    await line(s.token, [s.class5.id], admission, { amount: 5000, frequency: "one_time" });
    await line(s.token, [s.class5.id], caution, { amount: 2000, frequency: "one_time" });
    await line(s.token, [s.class5.id], uniform, { amount: 1500, frequency: "yearly", optional: true });
    await line(s.token, [s.class5.id], reAdmission, { amount: 800, frequency: "yearly", appliesTo: "existing" });
    await line(s.token, [s.class1.id], tuition, { amount: 700, frequency: "monthly" });

    const asha = (await feeChart(s.tokens.ravi, s.asha.id)).body.data;
    expect(asha.audience).toBe("new");
    expect(asha.chart.lines.map((l: { headName: string }) => l.headName)).toEqual(["Admission fee", "Caution money", "Tuition fee", "Uniform"]);
    // A new student: admission 5,000 + caution 2,000 once, tuition 1,000 for 12 months; the uniform is optional, the re-admission is not theirs.
    expect(asha.chart).toMatchObject({ compulsory: 19000, optional: 1500, refundable: 2000 });
    expect(asha.chart.lines.find((l: { headName: string }) => l.headName === "Tuition fee")).toMatchObject({ amount: 1000, frequency: "monthly", yearly: 12000, optional: false });
    // Mira is in Class 1: its own chart, not Class 5's.
    const mira = (await feeChart(s.tokens.anil, s.mira.id)).body.data;
    expect(mira.className).toBe("Class 1");
    expect(mira.chart.lines.map((l: { headName: string }) => l.headName)).toEqual(["Tuition fee"]);
    expect(mira.chart.compulsory).toBe(8400);
  });

  it("brings the transport fee of the stop the child boards at, and the school's rules", async () => {
    const s = await withBus();
    await request(app).put(`${fees}/rules`).set(auth(s.token)).send({ dueDay: 5, graceDays: 3, lateFine: { mode: "flat", amount: 100, maxAmount: null }, allowPartial: true, holdReportCard: false, holdCertificate: false });
    await board(s, s.asha.id);
    const res = (await feeChart(s.tokens.ravi, s.asha.id)).body.data;
    expect(res.transport).toEqual({ route: "Route 1", stop: "Arera Colony", monthlyFee: 900 });
    expect(res.rules).toEqual({ dueDay: 5, graceDays: 3, lateFine: { mode: "flat", amount: 100, maxAmount: null }, allowPartial: true });
    // Kabir does not ride: no transport.
    expect((await feeChart(s.tokens.sita, s.kabir.id)).body.data.transport).toBeNull();
  });

  it("is only the parent's own child's, and only while the school allows it", async () => {
    const s = await classroomSchool();
    const res = await feeChart(s.tokens.ravi, s.kabir.id);
    expect(res.status).toBe(404);
    expect((await feeChart(s.tokens.meena, s.asha.id)).status).toBe(403);
    expect((await feeChart(s.token, s.asha.id)).status).toBe(403);
    await request(app).put("/api/v1/permissions/parent").set(auth(s.token)).send({ permissions: ["child.attendance"] });
    expect((await feeChart(s.tokens.ravi, s.asha.id)).status).toBe(403);
  });
});
