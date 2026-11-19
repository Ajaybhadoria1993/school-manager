import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { io as connect, type Socket } from "socket.io-client";
import app from "../../../app";
import { startRealtime, stopRealtime } from "../../../realtime/socket";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { LIVE_WITHIN_SECONDS } from "../constants";
import { VehiclePosition } from "../models/VehiclePosition";
import { positionDto } from "../services/tracking.service";

/**
 * Live tracking: a driver's phone (no sign-in, only its private link) sends positions; the school's office reads the last one of every vehicle
 * and hears each new one on the socket; one school never sees another's vehicles.
 */
const api = "/api/v1/transport";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const asLink = (link: string) => ({ "X-Tracking-Link": link });
const BUS = { number: "Bus 1", registrationNumber: "MP09 AB 1234", seats: 40 };

let server: Server;
let url = "";
const opened: Socket[] = [];

beforeAll(async () => {
  server = createServer(app);
  startRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await stopRealtime();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => {
  for (const s of opened.splice(0)) s.disconnect();
});

const vehicleOf = async (token: string, body: object = BUS) => (await request(app).post(`${api}/vehicles`).set(auth(token)).send(body)).body.data.id as string;
const linkOf = async (token: string, vehicleId: string) => (await request(app).post(`${api}/vehicles/${vehicleId}/tracking-key`).set(auth(token))).body.data.key as string;
const ping = (link: string, body: object = { lat: 23.2599, lng: 77.4126 }) => request(app).post(`${api}/tracking/ping`).set(asLink(link)).send(body);
const live = (token: string) => request(app).get(`${api}/tracking/live`).set(auth(token));

function open(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
    opened.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

describe("how a position reads", () => {
  it("is live while it is recent and the trip has not ended, offline otherwise", () => {
    const now = new Date("2026-11-19T08:00:00.000Z");
    const at = (secondsAgo: number, isLive = true) => positionDto({ lat: 1, lng: 2, speedKmph: null, heading: null, accuracy: null, recordedAt: new Date(now.getTime() - secondsAgo * 1000), isLive }, now);
    expect(at(5).status).toBe("live");
    expect(at(LIVE_WITHIN_SECONDS).status).toBe("live");
    expect(at(LIVE_WITHIN_SECONDS + 1).status).toBe("offline");
    expect(at(5, false).status).toBe("offline");
    expect(at(5).ageSeconds).toBe(5);
  });
});

describe("the driver's link", () => {
  it("a vehicle has no link until the school makes one, and the list says which have", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await vehicleOf(s.token);
    expect((await request(app).get(`${api}/vehicles`).set(auth(s.token))).body.data.items[0].trackingOn).toBe(false);
    expect((await ping(`${id}.guess`)).status).toBe(401);

    const link = await linkOf(s.token, id);
    expect(link.startsWith(`${id}.`)).toBe(true);
    expect((await request(app).get(`${api}/vehicles`).set(auth(s.token))).body.data.items[0].trackingOn).toBe(true);
    expect(JSON.stringify((await request(app).get(`${api}/vehicles`).set(auth(s.token))).body)).not.toContain(link.split(".")[1]);
  });

  it("a made-up, half or someone else's link is refused with the same answer; a new link replaces the old; switching off ends it", async () => {
    const s = await createSchool("Sunrise Public School");
    const one = await vehicleOf(s.token);
    const two = await vehicleOf(s.token, { number: "Bus 2", registrationNumber: "MP09 AB 5678", seats: 30 });
    const link1 = await linkOf(s.token, one);
    const link2 = await linkOf(s.token, two);

    for (const bad of ["", "nonsense", `${one}.`, `${one}.wrong`, `${one}.${link2.split(".")[1]}`, "a.b.c"]) {
      const res = await ping(bad);
      expect(res.status, bad).toBe(401);
      expect(res.body.code).toBe("TRACKING_KEY_INVALID");
    }
    expect((await request(app).post(`${api}/tracking/ping`).send({ lat: 1, lng: 2 })).status).toBe(401);
    expect((await ping(link1)).status).toBe(200);

    const fresh = await linkOf(s.token, one);
    expect(fresh).not.toBe(link1);
    expect((await ping(link1)).status).toBe(401);
    expect((await ping(fresh)).status).toBe(200);

    expect((await request(app).delete(`${api}/vehicles/${one}/tracking-key`).set(auth(s.token))).status).toBe(200);
    expect((await ping(fresh)).status).toBe(401);
  });

  it("a vehicle made inactive stops being heard", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await vehicleOf(s.token);
    const link = await linkOf(s.token, id);
    await request(app).patch(`${api}/vehicles/${id}`).set(auth(s.token)).send({ isActive: false });
    expect((await ping(link)).status).toBe(401);
  });

  it("the page of the driver's phone learns which vehicle it is, and refuses a bad link", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await vehicleOf(s.token);
    await request(app).post(`${api}/routes`).set(auth(s.token)).send({ name: "Route 1", vehicleId: id, stops: [{ name: "Arera" }] });
    const link = await linkOf(s.token, id);
    const ok = await request(app).post(`${api}/tracking/session`).set(asLink(link));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ vehicle: { id, number: "Bus 1" }, routes: ["Route 1"] });
    expect((await request(app).post(`${api}/tracking/session`).set(asLink(`${id}.nope`))).status).toBe(401);
  });
});

describe("positions", () => {
  it("keeps only the latest of each vehicle, shows it live, and a trip that ends shows offline at once", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await vehicleOf(s.token);
    const driver = (await request(app).post(`${api}/drivers`).set(auth(s.token)).send({ name: "Ramesh Yadav", mobile: "9876543210" })).body.data.id as string;
    await request(app).post(`${api}/routes`).set(auth(s.token)).send({ name: "Route 1", vehicleId: id, driverId: driver, stops: [{ name: "Arera" }] });
    const link = await linkOf(s.token, id);

    // Linked but never reported: on the list, with no position.
    expect((await live(s.token)).body.data.items).toMatchObject([{ vehicleId: id, number: "Bus 1", position: null, routes: ["Route 1"], driver: { name: "Ramesh Yadav" } }]);

    expect((await ping(link, { lat: 23.2599, lng: 77.4126, speedKmph: 31.5, heading: 90, accuracy: 12 })).status).toBe(200);
    expect((await ping(link, { lat: 23.27, lng: 77.42 })).status).toBe(200);
    const items = (await live(s.token)).body.data.items;
    expect(items).toHaveLength(1);
    expect(items[0].position).toMatchObject({ lat: 23.27, lng: 77.42, speedKmph: null, status: "live" });
    expect(await VehiclePosition.countDocuments({ tenantId: s.tenantId })).toBe(1);

    expect((await request(app).post(`${api}/tracking/stop`).set(asLink(link))).status).toBe(200);
    expect((await live(s.token)).body.data.items[0].position.status).toBe("offline");
    // The next trip's first ping makes it live again.
    await ping(link);
    expect((await live(s.token)).body.data.items[0].position.status).toBe("live");
  });

  it("refuses a position that cannot be on Earth, or not a number", async () => {
    const s = await createSchool("Sunrise Public School");
    const link = await linkOf(s.token, await vehicleOf(s.token));
    for (const body of [{}, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: "x", lng: 0 }, { lat: 1, lng: 2, speedKmph: -1 }, { lat: 1, lng: 2, heading: 400 }]) {
      expect((await ping(link, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await live(s.token)).body.data.items[0].position).toBeNull();
  });

  it("a vehicle whose link was switched off leaves the live list", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await vehicleOf(s.token);
    await ping(await linkOf(s.token, id));
    await request(app).delete(`${api}/vehicles/${id}/tracking-key`).set(auth(s.token));
    expect((await live(s.token)).body.data.items).toHaveLength(0);
  });
});

describe("who may watch (Permissions)", () => {
  it("whoever may see Transport reads the live list; a teacher, a parent, or one who may not, does not; making a link needs transport.manage", async () => {
    const s = await createSchool("Sunrise Public School");
    const id = await vehicleOf(s.token);
    const reception = await addColleague(s.tenantId, "receptionist");
    expect((await live(reception)).status).toBe(403);
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["transport.view"] });
    expect((await live(reception)).status).toBe(200);
    expect((await request(app).post(`${api}/vehicles/${id}/tracking-key`).set(auth(reception))).status).toBe(403);
    for (const role of ["teacher", "parent"] as const) expect((await live(await addColleague(s.tenantId, role))).status, role).toBe(403);
    expect((await request(app).get(`${api}/tracking/live`)).status).toBe(401);
  });
});

describe("on the socket", () => {
  it("each new position reaches the open tabs of the SAME school's people who may watch, and nobody else", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const id = await vehicleOf(a.token);
    const link = await linkOf(a.token, id);
    const reception = await addColleague(a.tenantId, "receptionist");
    const teacher = await addColleague(a.tenantId, "teacher");
    await request(app).put("/api/v1/permissions/receptionist").set(auth(a.token)).send({ permissions: ["transport.view"] });

    const hear = async (token: string) => {
      const socket = await open(token);
      const got: { vehicleId: string; position: { lat: number; status: string } }[] = [];
      socket.on("vehicle:position", (p) => got.push(p));
      return got;
    };
    const admin = await hear(a.token);
    const allowed = await hear(reception);
    const teachers = await hear(teacher);
    const rival = await hear(b.token);
    await settle(); // the right to watch is read just after the socket connects

    await ping(link, { lat: 23.3, lng: 77.5 });
    await settle();
    expect(admin).toHaveLength(1);
    expect(admin[0]).toMatchObject({ vehicleId: id, position: { lat: 23.3, status: "live" } });
    expect(allowed).toHaveLength(1);
    expect(teachers).toHaveLength(0);
    expect(rival).toHaveLength(0);

    await request(app).post(`${api}/tracking/stop`).set(asLink(link));
    await settle();
    expect(admin).toHaveLength(2);
    expect(admin[1].position.status).toBe("offline");
  });
});
