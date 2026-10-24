import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";

const api = "/api/v1/academics";
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await seedSuperAdmin();
});

// Academic years have no route that takes an id yet: the only ways in are "my current year" and "set up my first year",
// both of which take the school from the signed-in user. So school B must see none of A's year, and setting up its own
// first year must leave A's as it was.
itKeepsSchoolsApart("academic years", {
  seed: async (a) => {
    const year = (
      await request(app).post(`${api}/academic-years/initial`).set(as(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" })
    ).body.data;
    return { yearId: year.id as string };
  },

  snapshot: async (a) => (await request(app).get(`${api}/academic-years/current`).set(as(a.token))).body.data,

  lists: [
    {
      name: "the current academic year",
      path: `${api}/academic-years/current`,
      showsRecords: (body) => body.data.year !== null,
    },
  ],

  probes: [
    {
      name: "setting up a first year of its own",
      method: "post",
      path: () => `${api}/academic-years/initial`,
      body: () => ({ name: "2026-2027", startDate: "2026-06-01", endDate: "2027-05-31" }),
      status: 201,
    },
  ],
});
