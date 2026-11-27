import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";

const api = "/api/v1/permissions";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const COACH = encodeURIComponent("other:sports coach");

beforeEach(async () => {
  await seedSuperAdmin();
});

// A role a school made (2026-11-26) and what it may do are that school's alone: another school neither sees nor changes them.
itKeepsSchoolsApart("permissions", {
  seed: async (a) => {
    await request(app).post(`${api}/roles`).set(auth(a.token)).send({ name: "Sports Coach" });
    await request(app).put(`${api}/${COACH}`).set(auth(a.token)).send({ permissions: ["students.view"] });
    return { key: COACH };
  },

  snapshot: async (a) => (await request(app).get(api).set(auth(a.token))).body.data.profiles,

  lists: [{ name: "the roles the school made", path: `${api}/roles`, showsRecords: (body) => body.data.items.length > 0 }],

  probes: [
    { name: "changing what its role may do", method: "put", path: (c) => `${api}/${c.key}`, body: () => ({ permissions: ["fees.collect"] }) },
    { name: "putting its role back to Other roles", method: "delete", path: (c) => `${api}/${c.key}` },
    { name: "deleting its role", method: "delete", path: (c) => `${api}/roles/${c.key}` },
  ],
});
