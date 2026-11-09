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
    const username = `asha.${a.tenantId.slice(-6)}`;
    const made = await request(app).post(api).set(bearer(a.token)).send({ name: "Asha Rao", role: "receptionist", login: { username, password: "Recep@Desk1" } });
    // A person with no login yet (added before the school made logins itself), for the one route that only they have.
    const bare = await StaffMember.create({ tenantId: a.tenantId, name: "Ravi Menon", nameKey: nameKeyOf("Ravi Menon"), email: null, role: "librarian", status: "invited" });
    return { staffId: made.body.data.id as string, bareId: bare._id.toString(), username };
  },

  snapshot: async (a) => (await request(app).get(`${api}?status=all`).set(bearer(a.token))).body.data,

  lists: [{ name: "the staff", path: `${api}?status=all`, showsRecords: (body) => body.data.items.length > 0 }],

  probes: [
    { name: "reading its staff member", method: "get", path: (c) => `${api}/${c.staffId}` },
    { name: "changing its staff member", method: "patch", path: (c) => `${api}/${c.staffId}`, body: () => ({ name: "Hacked", role: "management" }) },
    { name: "giving its staff member a new password", method: "post", path: (c) => `${api}/${c.staffId}/reset-password`, body: () => ({ password: "Hacked@Pass1" }) },
    { name: "changing its staff member's username", method: "patch", path: (c) => `${api}/${c.staffId}/login`, body: () => ({ username: "hacker_10" }) },
    { name: "making a login for its person with none", method: "post", path: (c) => `${api}/${c.bareId}/login`, body: () => ({ username: "hacker_10", password: "Hacked@Pass1" }) },
    { name: "removing its person with no login", method: "delete", path: (c) => `${api}/${c.bareId}` },
  ],
});
