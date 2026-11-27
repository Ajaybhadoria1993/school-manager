import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { addTeacher, auth } from "../../../test/timetable";
import { Tenant } from "../../tenants/models/Tenant";

const staff = "/api/v1/staff";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const photo = async (token: string, path: string) => (await request(app).get(path).set(auth(token))).body.data;

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("profile photos", {
  seed: async (a) => {
    await Tenant.updateOne({ _id: a.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
    const teacherId = await addTeacher(a.token, "Meena Singh");
    const staffId = (await request(app).post(`${staff}/members`).set(auth(a.token)).send({ name: "Rita Das", role: "receptionist" })).body.data.id as string;
    for (const path of [`${staff}/teachers/${teacherId}/photo`, `${staff}/members/${staffId}/photo`, "/api/v1/profile/photo"]) {
      await request(app).put(path).set(auth(a.token)).attach("photo", PNG, "me.png");
    }
    await request(app).put(`${staff}/teachers/${teacherId}/resume`).set(auth(a.token)).attach("resume", Buffer.from("%PDF-1.7 resume"), "cv.pdf");
    return { teacherId, staffId };
  },

  snapshot: async (a, c) => ({
    teacher: await photo(a.token, `${staff}/teachers/${c.teacherId}/photo`),
    staff: await photo(a.token, `${staff}/members/${c.staffId}/photo`),
    mine: await photo(a.token, "/api/v1/profile/photo"),
    resume: await photo(a.token, `${staff}/teachers/${c.teacherId}/resume`),
  }),

  // Each school's own photo of its signed-in person: B's is empty although A's is there.
  lists: [{ name: "my own photo", path: "/api/v1/profile/photo", showsRecords: (body) => body.data.photo !== null }],

  probes: [
    { name: "seeing its teacher's photo", method: "get", path: (c) => `${staff}/teachers/${c.teacherId}/photo` },
    { name: "setting its teacher's photo", method: "put", path: (c) => `${staff}/teachers/${c.teacherId}/photo` },
    { name: "taking its teacher's photo away", method: "delete", path: (c) => `${staff}/teachers/${c.teacherId}/photo` },
    { name: "reading its teacher's resume", method: "get", path: (c) => `${staff}/teachers/${c.teacherId}/resume` },
    { name: "downloading its teacher's resume", method: "get", path: (c) => `${staff}/teachers/${c.teacherId}/resume/file` },
    { name: "setting its teacher's resume", method: "put", path: (c) => `${staff}/teachers/${c.teacherId}/resume` },
    { name: "taking its teacher's resume away", method: "delete", path: (c) => `${staff}/teachers/${c.teacherId}/resume` },
    { name: "seeing its staff member's photo", method: "get", path: (c) => `${staff}/members/${c.staffId}/photo` },
    { name: "setting its staff member's photo", method: "put", path: (c) => `${staff}/members/${c.staffId}/photo` },
    { name: "taking its staff member's photo away", method: "delete", path: (c) => `${staff}/members/${c.staffId}/photo` },
  ],
});
