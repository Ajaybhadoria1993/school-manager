import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";

const api = "/api/v1/transport";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("transport", {
  seed: async (a) => {
    const vehicle = (await request(app).post(`${api}/vehicles`).set(auth(a.token)).send({ number: "Bus 1", registrationNumber: "MP09 AB 1234", seats: 40 })).body.data.id as string;
    const driver = (await request(app).post(`${api}/drivers`).set(auth(a.token)).send({ name: "Ramesh Yadav", mobile: "9876543210" })).body.data.id as string;
    const route = (await request(app).post(`${api}/routes`).set(auth(a.token)).send({ name: "Route 1", vehicleId: vehicle, driverId: driver, stops: [{ name: "Arera" }] })).body.data.id as string;
    return { vehicle, driver, route };
  },

  snapshot: async (a) => ({
    summary: (await request(app).get(`${api}/summary`).set(auth(a.token))).body.data,
    vehicles: (await request(app).get(`${api}/vehicles?status=all`).set(auth(a.token))).body.data,
    drivers: (await request(app).get(`${api}/drivers?status=all`).set(auth(a.token))).body.data,
    routes: (await request(app).get(`${api}/routes?status=all`).set(auth(a.token))).body.data,
  }),

  lists: [
    { name: "the vehicles", path: `${api}/vehicles?status=all`, showsRecords: (body) => body.data.items.length > 0 },
    { name: "the drivers", path: `${api}/drivers?status=all`, showsRecords: (body) => body.data.items.length > 0 },
    { name: "the routes", path: `${api}/routes?status=all`, showsRecords: (body) => body.data.items.length > 0 },
  ],

  probes: [
    { name: "changing its vehicle", method: "patch", path: (c) => `${api}/vehicles/${c.vehicle}`, body: () => ({ seats: 3 }) },
    { name: "removing its vehicle", method: "delete", path: (c) => `${api}/vehicles/${c.vehicle}` },
    { name: "changing its driver", method: "patch", path: (c) => `${api}/drivers/${c.driver}`, body: () => ({ name: "Hacked" }) },
    { name: "removing its driver", method: "delete", path: (c) => `${api}/drivers/${c.driver}` },
    { name: "changing its route", method: "patch", path: (c) => `${api}/routes/${c.route}`, body: () => ({ name: "Hacked" }) },
    { name: "removing its route", method: "delete", path: (c) => `${api}/routes/${c.route}` },
  ],
});
