import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { StaffMember } from "../models/StaffMember";

const api = "/api/v1/staff/members";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("staff members (Staff > Add staff)", {
  seed: async (a) => {
    const email = `asha.${a.tenantId.slice(-6)}@mail.test`;
    const made = await request(app).post(api).set(bearer(a.token)).send({ name: "Asha Rao", role: "receptionist", email, giveLogin: true });
    // A person with no login (added without one), for the routes that only they have.
    const bare = await request(app).post(api).set(bearer(a.token)).send({ name: "Ravi Menon", role: "librarian" });
    // And one added before 2026-11-08, when a person could be waiting for a login ("invited").
    await StaffMember.create({ tenantId: a.tenantId, name: "Old Person", nameKey: nameKeyOf("Old Person"), email: null, role: "librarian", status: "invited" });
    return { staffId: made.body.data.id as string, bareId: bare.body.data.id as string, email };
  },

  snapshot: async (a) => (await request(app).get(`${api}?status=all`).set(bearer(a.token))).body.data,

  lists: [{ name: "the staff", path: `${api}?status=all`, showsRecords: (body) => body.data.items.length > 0 }],

  probes: [
    { name: "reading its staff member", method: "get", path: (c) => `${api}/${c.staffId}` },
    { name: "changing its staff member", method: "patch", path: (c) => `${api}/${c.staffId}`, body: () => ({ name: "Hacked", role: "management" }) },
    { name: "sending its staff member's invitation again (to the intruder's email)", method: "post", path: (c) => `${api}/${c.staffId}/login`, body: () => ({ email: "hacker@mail.test" }) },
    { name: "giving its person with no login access (to the intruder's email)", method: "post", path: (c) => `${api}/${c.bareId}/login`, body: () => ({ email: "hacker@mail.test" }) },
    { name: "removing its person with no login", method: "delete", path: (c) => `${api}/${c.bareId}` },
  ],
});
