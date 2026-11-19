import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { DEFAULT_PERMISSIONS } from "../../permissions/constants";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { paperOf } from "../services/transport.service";

const api = "/api/v1/transport";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const send = (method: "post" | "patch" | "delete", token: string, path: string, body: object = {}) => request(app)[method](`${api}${path}`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

const shift = (days: number) => {
  const d = new Date(`${todayInIndia()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const BUS = { number: "Bus 1", registrationNumber: "MP09 AB 1234", type: "bus", seats: 40, model: "Tata Starbus", insuranceExpiry: shift(200), fitnessExpiry: shift(10), pollutionExpiry: shift(-3), permitExpiry: null };
const RAMESH = { name: "Ramesh Yadav", role: "driver", mobile: "9876543210", licenseNumber: "mp0920110012345", licenseExpiry: shift(400) };
const SUNITA = { name: "Sunita Bai", role: "attendant", mobile: "9876543211" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("how a paper stands", () => {
  it("not given, ended, ending within a month, and fine", () => {
    const today = "2026-11-10";
    expect(paperOf("k", "Insurance", null, today)).toMatchObject({ status: "missing", daysLeft: null });
    expect(paperOf("k", "Insurance", "2026-11-09", today)).toMatchObject({ status: "expired", daysLeft: -1 });
    expect(paperOf("k", "Insurance", "2026-11-10", today)).toMatchObject({ status: "soon", daysLeft: 0 });
    expect(paperOf("k", "Insurance", "2026-12-10", today)).toMatchObject({ status: "soon", daysLeft: 30 });
    expect(paperOf("k", "Insurance", "2026-12-11", today)).toMatchObject({ status: "ok", daysLeft: 31 });
  });
});

describe("vehicles", () => {
  it("adds a vehicle with its papers, lists it with how each stands today, and finds it by its plate or number", async () => {
    const s = await createSchool("Sunrise Public School");
    const made = await send("post", s.token, "/vehicles", BUS);
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ number: "Bus 1", registrationNumber: "MP09 AB 1234", typeLabel: "Bus", seats: 40, isActive: true, routes: [] });
    expect(made.body.data.papers.map((p: { key: string; status: string }) => [p.key, p.status])).toEqual([
      ["insuranceExpiry", "ok"],
      ["fitnessExpiry", "soon"],
      ["pollutionExpiry", "expired"],
      ["permitExpiry", "missing"],
    ]);
    expect((await get(s.token, "/vehicles")).body.data.items).toHaveLength(1);
    expect((await get(s.token, "/vehicles?search=ab%201234")).body.data.items).toHaveLength(1);
    expect((await get(s.token, "/vehicles?search=starbus")).body.data.items).toHaveLength(1);
    expect((await get(s.token, "/vehicles?search=nothing")).body.data.items).toHaveLength(0);
  });

  it("one plate and one number once in a school, however they are spaced or cased", async () => {
    const s = await createSchool("Sunrise Public School");
    await send("post", s.token, "/vehicles", BUS);
    const samePlate = await send("post", s.token, "/vehicles", { ...BUS, number: "Bus 2", registrationNumber: "mp09ab1234" });
    expect(samePlate.status).toBe(409);
    expect(samePlate.body.code).toBe("PLATE_TAKEN");
    const sameNumber = await send("post", s.token, "/vehicles", { ...BUS, number: "bus  1", registrationNumber: "MP09 CD 5678" });
    expect(sameNumber.status).toBe(409);
    expect(sameNumber.body.code).toBe("VEHICLE_NUMBER_TAKEN");
    // Another school may use them.
    const other = await createSchool("Moonrise Public School");
    expect((await send("post", other.token, "/vehicles", BUS)).status).toBe(201);
  });

  it("says what is wrong with each box", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await send("post", s.token, "/vehicles", { number: "", registrationNumber: "12", seats: 0, type: "rocket", insuranceExpiry: "2027-02-31" });
    expect(res.status).toBe(400);
    const paths = details(res).map((d) => d.path);
    for (const path of ["number", "registrationNumber", "seats", "type", "insuranceExpiry"]) expect(paths, path).toContain(path);
  });

  it("changes a vehicle, makes it inactive (it leaves the active list), and keeps one plate when it is changed to another's", async () => {
    const s = await createSchool("Sunrise Public School");
    const one = (await send("post", s.token, "/vehicles", BUS)).body.data;
    await send("post", s.token, "/vehicles", { ...BUS, number: "Bus 2", registrationNumber: "MP09 CD 5678" });
    const changed = await send("patch", s.token, `/vehicles/${one.id}`, { seats: 45, insuranceExpiry: shift(-1) });
    expect(changed.body.data).toMatchObject({ seats: 45 });
    expect(changed.body.data.papers[0].status).toBe("expired");
    expect((await send("patch", s.token, `/vehicles/${one.id}`, { registrationNumber: "MP09 CD 5678" })).status).toBe(409);
    expect((await send("patch", s.token, `/vehicles/${one.id}`, {})).status).toBe(400);
    await send("patch", s.token, `/vehicles/${one.id}`, { isActive: false });
    expect((await get(s.token, "/vehicles")).body.data.items).toHaveLength(1);
    expect((await get(s.token, "/vehicles?status=all")).body.data.items).toHaveLength(2);
    expect((await send("patch", s.token, "/vehicles/6af2b7c87fdf3025aeb6d521", { seats: 3 })).status).toBe(404);
  });
});

describe("drivers and attendants", () => {
  it("adds a driver with the licence and an attendant; a mobile is written the usual ways and kept as 10 digits", async () => {
    const s = await createSchool("Sunrise Public School");
    const driver = await send("post", s.token, "/drivers", { ...RAMESH, mobile: "+91 98765-43210" });
    expect(driver.status).toBe(201);
    expect(driver.body.data).toMatchObject({ name: "Ramesh Yadav", mobile: "9876543210", licenseNumber: "MP0920110012345", role: "driver" });
    expect(driver.body.data.license).toMatchObject({ status: "ok", label: "Licence" });
    const attendant = await send("post", s.token, "/drivers", SUNITA);
    expect(attendant.body.data.license).toBeNull();
    expect((await get(s.token, "/drivers?role=attendant")).body.data.items.map((p: { name: string }) => p.name)).toEqual(["Sunita Bai"]);
    expect((await get(s.token, "/drivers?search=mp0920")).body.data.items).toHaveLength(1);
  });

  it("one person per mobile number in a school; a wrong number says so", async () => {
    const s = await createSchool("Sunrise Public School");
    await send("post", s.token, "/drivers", RAMESH);
    const again = await send("post", s.token, "/drivers", { ...SUNITA, mobile: "98765 43210" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CREW_MOBILE_TAKEN");
    const bad = await send("post", s.token, "/drivers", { ...SUNITA, mobile: "12345", emergencyMobile: "999" });
    expect(bad.status).toBe(400);
    expect(details(bad).map((d) => d.path)).toEqual(expect.arrayContaining(["mobile", "emergencyMobile"]));
  });
});

describe("routes", () => {
  async function team(token: string) {
    const vehicle = (await send("post", token, "/vehicles", BUS)).body.data.id as string;
    const driver = (await send("post", token, "/drivers", RAMESH)).body.data.id as string;
    const attendant = (await send("post", token, "/drivers", SUNITA)).body.data.id as string;
    return { vehicle, driver, attendant };
  }
  const STOPS = [
    { name: "Arera Colony", pickupTime: "07:10", dropTime: "14:40", fee: 800 },
    { name: "Shahpura", pickupTime: "07:25", dropTime: "14:25", fee: 700 },
    { name: "School gate", pickupTime: null, dropTime: null, fee: null },
  ];

  it("makes a route with its vehicle, driver, attendant, times and stops in order, and shows them by name", async () => {
    const s = await createSchool("Sunrise Public School");
    const t = await team(s.token);
    const made = await send("post", s.token, "/routes", { name: "Route 1 - Arera Colony", vehicleId: t.vehicle, driverId: t.driver, attendantId: t.attendant, morningStart: "07:00", afternoonStart: "14:30", stops: STOPS });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({
      name: "Route 1 - Arera Colony",
      vehicle: { number: "Bus 1", registrationNumber: "MP09 AB 1234", seats: 40 },
      driver: { name: "Ramesh Yadav", mobile: "9876543210" },
      attendant: { name: "Sunita Bai" },
      morningStart: "07:00",
      afternoonStart: "14:30",
    });
    expect(made.body.data.stops.map((x: { name: string }) => x.name)).toEqual(["Arera Colony", "Shahpura", "School gate"]);
    expect(made.body.data.stops[1]).toMatchObject({ pickupTime: "07:25", dropTime: "14:25", fee: 700 });
    // A stop with no fee typed has none (null), not 0; a fee of 0 is kept as 0.
    expect(made.body.data.stops[2].fee).toBeNull();
    const blank = await send("post", s.token, "/routes", { name: "Route 9", stops: [{ name: "A", fee: "" }, { name: "B", fee: "0" }, { name: "C", fee: "650" }] });
    expect(blank.body.data.stops.map((x: { fee: number | null }) => x.fee)).toEqual([null, 0, 650]);
    // The vehicle and the people say which route they run.
    expect((await get(s.token, "/vehicles")).body.data.items[0].routes).toEqual(["Route 1 - Arera Colony"]);
    expect((await get(s.token, "/drivers")).body.data.items.every((p: { routes: string[] }) => p.routes.length === 1)).toBe(true);
    // A stop can be found.
    expect((await get(s.token, "/routes?search=shahpura")).body.data.items).toHaveLength(1);
    expect((await get(s.token, "/routes?search=nowhere")).body.data.items).toHaveLength(0);
  });

  it("only the school's own vehicle and people, and a driver must be a driver", async () => {
    const s = await createSchool("Sunrise Public School");
    const other = await createSchool("Moonrise Public School");
    const mine = await team(s.token);
    const theirs = await team(other.token);
    const stolen = await send("post", s.token, "/routes", { name: "R", vehicleId: theirs.vehicle });
    expect(stolen.status).toBe(400);
    expect(stolen.body.code).toBe("TEAM_NOT_FOUND");
    const swapped = await send("post", s.token, "/routes", { name: "R", driverId: mine.attendant, attendantId: mine.driver });
    expect(swapped.status).toBe(400);
    expect(details(swapped).map((d) => d.path)).toEqual(expect.arrayContaining(["driverId", "attendantId"]));
  });

  it("checks the times and the fee, one name per route, and changes a route's stops", async () => {
    const s = await createSchool("Sunrise Public School");
    const bad = await send("post", s.token, "/routes", { name: "R", morningStart: "25:00", stops: [{ name: "A", pickupTime: "7.30", fee: -5 }] });
    expect(bad.status).toBe(400);
    const made = (await send("post", s.token, "/routes", { name: "Route 2", stops: [{ name: "A" }] })).body.data;
    expect((await send("post", s.token, "/routes", { name: "route  2" })).status).toBe(409);
    const changed = await send("patch", s.token, `/routes/${made.id}`, { stops: [{ name: "B", pickupTime: "07:00" }, { name: "A" }], morningStart: "06:50" });
    expect(changed.body.data.stops.map((x: { name: string }) => x.name)).toEqual(["B", "A"]);
    expect(changed.body.data.morningStart).toBe("06:50");
    // Taking the vehicle off: null.
    const t = await team(s.token);
    await send("patch", s.token, `/routes/${made.id}`, { vehicleId: t.vehicle });
    expect((await send("patch", s.token, `/routes/${made.id}`, { vehicleId: null })).body.data.vehicle).toBeNull();
  });

  it("a vehicle or a person on a route cannot be removed until they are off it; a route can always be removed", async () => {
    const s = await createSchool("Sunrise Public School");
    const t = await team(s.token);
    const route = (await send("post", s.token, "/routes", { name: "Route 1", vehicleId: t.vehicle, driverId: t.driver })).body.data;
    const vehicle = await send("delete", s.token, `/vehicles/${t.vehicle}`);
    expect(vehicle.status).toBe(409);
    expect(vehicle.body.code).toBe("VEHICLE_IN_USE");
    expect((await send("delete", s.token, `/drivers/${t.driver}`)).body.code).toBe("CREW_IN_USE");
    expect((await send("delete", s.token, `/routes/${route.id}`)).status).toBe(200);
    expect((await send("delete", s.token, `/vehicles/${t.vehicle}`)).status).toBe(200);
    expect((await send("delete", s.token, `/drivers/${t.driver}`)).status).toBe(200);
    expect((await send("delete", s.token, `/routes/${route.id}`)).status).toBe(404);
  });
});

describe("the numbers on top, and what needs attention", () => {
  it("counts the active vehicles, drivers, attendants, routes and stops, and lists every paper that has ended or ends within a month, nearest first", async () => {
    const s = await createSchool("Sunrise Public School");
    await send("post", s.token, "/vehicles", BUS);
    await send("post", s.token, "/vehicles", { ...BUS, number: "Van 1", registrationNumber: "MP09 ZZ 0001", type: "van", seats: 12, insuranceExpiry: shift(300), fitnessExpiry: shift(300), pollutionExpiry: shift(300), isActive: false });
    await send("post", s.token, "/drivers", { ...RAMESH, licenseExpiry: shift(5) });
    await send("post", s.token, "/drivers", SUNITA);
    await send("post", s.token, "/routes", { name: "Route 1", stops: [{ name: "A" }, { name: "B" }] });
    const sum = (await get(s.token, "/summary")).body.data;
    expect(sum.vehicles).toMatchObject({ total: 2, seats: 52 });
    expect(sum.drivers).toEqual({ total: 1, attendants: 1 });
    expect(sum.routes).toMatchObject({ total: 1, stops: 2, withoutVehicle: 1, withoutDriver: 1 });
    expect(sum.attention.map((a: { who: string; what: string; status: string }) => [a.what, a.status])).toEqual([
      ["Pollution (PUC)", "expired"],
      ["Licence", "soon"],
      ["Fitness certificate", "soon"],
    ]);
    expect(sum.attentionCount).toBe(3);
  });
});

describe("who may use it (Permissions)", () => {
  it("a receptionist has no transport until the school allows it; seeing is not changing; teachers and parents are never let in", async () => {
    const s = await createSchool("Sunrise Public School");
    const reception = await addColleague(s.tenantId, "receptionist");
    expect((await get(reception, "/vehicles")).status).toBe(403);
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["transport.view"] });
    expect((await get(reception, "/vehicles")).status).toBe(200);
    expect((await get(reception, "/summary")).status).toBe(200);
    expect((await send("post", reception, "/vehicles", BUS)).status).toBe(403);
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["transport.manage"] });
    expect((await send("post", reception, "/vehicles", BUS)).status).toBe(201);
    expect((await send("post", reception, "/routes", { name: "R" })).status).toBe(201);
    for (const role of ["teacher", "parent"] as const) expect((await get(await addColleague(s.tenantId, role), "/vehicles")).status, role).toBe(403);
    expect((await request(app).put("/api/v1/permissions/teacher").set(auth(s.token)).send({ permissions: ["transport.view"] })).status).toBe(400);
  });

  it("the transport in-charge starts with transport (it is new, so nobody loses anything); the others do not", () => {
    expect(DEFAULT_PERMISSIONS.transport).toEqual(["calendar.view", "transport.view", "transport.manage"]);
    expect(DEFAULT_PERMISSIONS.receptionist).toEqual(["calendar.view"]);
    expect(DEFAULT_PERMISSIONS.driver).toEqual(["calendar.view"]);
  });
});
