import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addColleague } from "../../../test/schools";
import { RouteRider } from "../models/RouteRider";

/**
 * Which students ride which route (docs/transport.md): the transport in-charge puts a student on a route at one of its stops, a student has
 * one bus, and one school never reaches another's routes or students.
 */
const api = "/api/v1/transport";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await seedSuperAdmin();
});

const STOPS = [
  { name: "Arera Colony", pickupTime: "07:10", dropTime: "14:40", fee: "900" },
  { name: "MP Nagar", pickupTime: "07:25", dropTime: "14:25", fee: "1100" },
];

async function office(name = "Sunrise Public School", prefix = "sun.") {
  const s = await classroomSchool(name, prefix);
  const vehicle = (await request(app).post(`${api}/vehicles`).set(auth(s.token)).send({ number: "Bus 1", registrationNumber: "MP09 AB 1234", seats: 2 })).body.data.id as string;
  const route = (await request(app).post(`${api}/routes`).set(auth(s.token)).send({ name: "Route 1", vehicleId: vehicle, stops: STOPS })).body.data.id as string;
  const other = (await request(app).post(`${api}/routes`).set(auth(s.token)).send({ name: "Route 2", stops: [{ name: "Kolar" }] })).body.data.id as string;
  return { ...s, vehicle, route, other };
}
const riders = (token: string, route: string) => request(app).get(`${api}/routes/${route}/riders`).set(auth(token));
const add = (token: string, route: string, studentId: string, stopName = "Arera Colony") => request(app).post(`${api}/routes/${route}/riders`).set(auth(token)).send({ studentId, stopName });

describe("putting a student on a route", () => {
  it("adds a student at a stop of the route; the list says who, which class and where, and the route says how many ride it", async () => {
    const s = await office();
    const res = await add(s.token, s.route, s.asha.id, "arera  colony");
    expect(res.status).toBe(201);
    expect(res.body.data.seats).toBe(2);
    expect(res.body.data.items).toEqual([{ studentId: s.asha.id, name: "Asha Verma", admissionNumber: s.asha.admissionNumber, classLabel: "Class 5 - A", stopName: "Arera Colony", stopKnown: true }]);
    const routes = (await request(app).get(`${api}/routes`).set(auth(s.token))).body.data.items as { name: string; riders: number }[];
    expect(routes.map((r) => [r.name, r.riders])).toEqual([["Route 1", 1], ["Route 2", 0]]);
  });

  it("a student has one bus: adding them to another route moves them", async () => {
    const s = await office();
    await add(s.token, s.route, s.asha.id);
    await add(s.token, s.other, s.asha.id, "Kolar");
    expect((await riders(s.token, s.route)).body.data.items).toHaveLength(0);
    expect((await riders(s.token, s.other)).body.data.items).toMatchObject([{ name: "Asha Verma", stopName: "Kolar" }]);
    expect(await RouteRider.countDocuments({ tenantId: s.tenantId })).toBe(1);
    // The same route again changes the stop.
    await add(s.token, s.other, s.asha.id, "Kolar");
    expect(await RouteRider.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it("says what is wrong: a stop that is not on the route, a student who is not the school's, a closed route", async () => {
    const s = await office();
    const stop = await add(s.token, s.route, s.asha.id, "Nowhere");
    expect(stop.status).toBe(400);
    expect(stop.body.code).toBe("STOP_NOT_FOUND");
    const nobody = await add(s.token, s.route, "a".repeat(24));
    expect(nobody.status).toBe(400);
    expect(nobody.body.code).toBe("STUDENT_NOT_FOUND");
    expect((await request(app).post(`${api}/routes/${s.route}/riders`).set(auth(s.token)).send({ stopName: "Arera Colony" })).status).toBe(400);
    await request(app).patch(`${api}/routes/${s.route}`).set(auth(s.token)).send({ isActive: false });
    const closed = await add(s.token, s.route, s.asha.id);
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe("ROUTE_CLOSED");
    expect((await add(s.token, "a".repeat(24), s.asha.id)).status).toBe(404);
  });

  it("takes a student off the route; one who is not on it is not found", async () => {
    const s = await office();
    await add(s.token, s.route, s.asha.id);
    const gone = await request(app).delete(`${api}/routes/${s.route}/riders/${s.asha.id}`).set(auth(s.token));
    expect(gone.status).toBe(200);
    expect(gone.body.data.items).toHaveLength(0);
    const again = await request(app).delete(`${api}/routes/${s.route}/riders/${s.asha.id}`).set(auth(s.token));
    expect(again.status).toBe(404);
    expect(again.body.code).toBe("RIDER_NOT_FOUND");
  });

  it("a stop that was renamed leaves the student on the route with no stop until the school chooses one again", async () => {
    const s = await office();
    await add(s.token, s.route, s.asha.id);
    await request(app).patch(`${api}/routes/${s.route}`).set(auth(s.token)).send({ stops: [{ name: "Arera Chowk", pickupTime: "", dropTime: "", fee: "" }] });
    expect((await riders(s.token, s.route)).body.data.items).toMatchObject([{ stopName: "Arera Colony", stopKnown: false }]);
  });

  it("deleting a route takes its students off it", async () => {
    const s = await office();
    await add(s.token, s.route, s.asha.id);
    await request(app).delete(`${api}/routes/${s.route}`).set(auth(s.token));
    expect(await RouteRider.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("a student who left the school no longer rides (not listed, not counted)", async () => {
    const s = await office();
    await add(s.token, s.route, s.asha.id);
    await add(s.token, s.route, s.kabir.id, "MP Nagar");
    expect((await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [s.kabir.id], reason: "Moved away" })).status).toBe(200);
    const items = (await riders(s.token, s.route)).body.data.items as { name: string }[];
    expect(items.map((i) => i.name)).toEqual(["Asha Verma"]);
  });
});

describe("finding the student to add", () => {
  it("searches by any words of the name or by admission number, and says which route they already ride", async () => {
    const s = await office();
    await add(s.token, s.route, s.asha.id);
    const find = async (q: string) => (await request(app).get(`${api}/students/search`).set(auth(s.token)).query({ q })).body.data.items as { name: string; classLabel: string | null; route: string | null }[];
    expect(await find("asha ver")).toEqual([{ id: s.asha.id, name: "Asha Verma", admissionNumber: s.asha.admissionNumber, classLabel: "Class 5 - A", route: "Route 1" }]);
    expect((await find("kabir"))[0]).toMatchObject({ name: "Kabir Rao", route: null });
    expect((await find(s.mira.admissionNumber))[0]).toMatchObject({ name: "Mira Shah", classLabel: "Class 1" });
    expect(await find("")).toEqual([]);
    expect(await find("zzzz")).toEqual([]);
    // Typed letters are letters, not a pattern.
    expect(await find(".*")).toEqual([]);
  });
});

describe("who may do it", () => {
  it("needs transport.manage: one who may only see Transport, a teacher and a parent are refused", async () => {
    const s = await office();
    const reception = await addColleague(s.tenantId, "receptionist");
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["transport.view"] });
    expect((await riders(reception, s.route)).status).toBe(403);
    expect((await add(reception, s.route, s.asha.id)).status).toBe(403);
    expect((await request(app).get(`${api}/students/search`).set(auth(reception)).query({ q: "asha" })).status).toBe(403);
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["transport.manage"] });
    expect((await add(reception, s.route, s.asha.id)).status).toBe(201);
    for (const token of [s.tokens.meena, s.tokens.ravi]) {
      expect((await riders(token, s.route)).status).toBe(403);
      expect((await add(token, s.route, s.asha.id)).status).toBe(403);
    }
    expect((await request(app).get(`${api}/routes/${s.route}/riders`)).status).toBe(401);
  });
});

describe("one school never reaches another's", () => {
  it("another school cannot read, add to, change or search the riders of this school's route, nor put this school's student on its own route", async () => {
    const a = await office("Sunrise Public School", "sun.");
    const b = await office("Moonrise Public School", "moon.");
    await add(a.token, a.route, a.asha.id);

    expect((await riders(b.token, a.route)).status).toBe(404);
    expect((await add(b.token, a.route, b.asha.id)).status).toBe(404);
    expect((await request(app).delete(`${api}/routes/${a.route}/riders/${a.asha.id}`).set(auth(b.token))).status).toBe(404);
    // B's route with A's student: not a student of B.
    const stolen = await add(b.token, b.route, a.asha.id);
    expect(stolen.status).toBe(400);
    expect(stolen.body.code).toBe("STUDENT_NOT_FOUND");
    expect((await request(app).get(`${api}/students/search`).set(auth(b.token)).query({ q: "asha" })).body.data.items.map((i: { id: string }) => i.id)).not.toContain(a.asha.id);
    // And A's student still rides A's route, untouched.
    expect((await riders(a.token, a.route)).body.data.items).toHaveLength(1);
  });
});
