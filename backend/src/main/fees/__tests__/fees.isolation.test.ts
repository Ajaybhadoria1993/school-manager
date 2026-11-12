import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";

const api = "/api/v1/fees";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("fees", {
  seed: async (a) => {
    await request(app).post(`${academics}/academic-years/initial`).set(auth(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" });
    const klass = (await request(app).post(`${academics}/classes`).set(auth(a.token)).send({ name: "Class 1", capacity: 100, sectionCount: 0 })).body.data.id as string;
    const head = (await request(app).post(`${api}/heads`).set(auth(a.token)).send({ name: "Tuition fee", kind: "tuition" })).body.data.id as string;
    await request(app).post(`${api}/structure/lines`).set(auth(a.token)).send({ classIds: [klass], headId: head, amount: 1000, frequency: "monthly" });
    const lineId = (await request(app).get(`${api}/structure`).set(auth(a.token))).body.data.classes[0].lines[0].id as string;
    const concession = (await request(app).post(`${api}/concessions`).set(auth(a.token)).send({ name: "Sibling", basis: "sibling", mode: "percent", value: 10 })).body.data.id as string;
    await request(app).put(`${api}/rules`).set(auth(a.token)).send({ dueDay: 5, graceDays: 3, lateFine: { mode: "flat", amount: 100, maxAmount: null }, allowPartial: true, holdReportCard: false, holdCertificate: false });
    return { head, lineId, concession };
  },

  snapshot: async (a) => ({
    heads: (await request(app).get(`${api}/heads?status=all`).set(auth(a.token))).body.data,
    structure: (await request(app).get(`${api}/structure`).set(auth(a.token))).body.data,
    concessions: (await request(app).get(`${api}/concessions?status=all`).set(auth(a.token))).body.data,
    rules: (await request(app).get(`${api}/rules`).set(auth(a.token))).body.data,
  }),

  lists: [
    { name: "the fee heads", path: `${api}/heads?status=all`, showsRecords: (body) => body.data.items.length > 0 },
    { name: "the fee chart", path: `${api}/structure`, showsRecords: (body) => body.data.classes.some((c: { lines: unknown[] }) => c.lines.length > 0) },
    { name: "the concessions", path: `${api}/concessions?status=all`, showsRecords: (body) => body.data.items.length > 0 },
  ],

  probes: [
    { name: "changing its fee head", method: "patch", path: (c) => `${api}/heads/${c.head}`, body: () => ({ name: "Hacked" }) },
    { name: "removing its fee head", method: "delete", path: (c) => `${api}/heads/${c.head}` },
    { name: "changing a line of its fee chart", method: "patch", path: (c) => `${api}/structure/lines/${c.lineId}`, body: () => ({ amount: 1 }) },
    { name: "removing a line of its fee chart", method: "delete", path: (c) => `${api}/structure/lines/${c.lineId}` },
    { name: "changing its concession", method: "patch", path: (c) => `${api}/concessions/${c.concession}`, body: () => ({ value: 99 }) },
    { name: "removing its concession", method: "delete", path: (c) => `${api}/concessions/${c.concession}` },
  ],
});
