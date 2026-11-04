import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { addClass, addTeacher, auth } from "../../../test/timetable";
import { Tenant } from "../../tenants/models/Tenant";

const api = "/api/v1/staff/teachers";

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("staff", {
  seed: async (a) => {
    await Tenant.updateOne({ _id: a.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
    await request(app).post("/api/v1/academics/academic-years/initial").set(auth(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" });
    const klass = await addClass(a.token, "Class 5", ["A"]);
    const teacherId = await addTeacher(a.token, "Meena Singh", { mobile: "9876543210" });
    await request(app).put("/api/v1/staff/class-teachers").set(auth(a.token)).send({ classId: klass.id, sectionId: klass.sections[0].id, teacherId });
    return {
      teacherId,
      classId: klass.id,
      sectionId: klass.sections[0].id,
      // One teacher who can sign in and one who cannot yet: the probes reach for each.
      withLoginId: await addTeacher(a.token, "Dev Patel", { mobile: "9876500000", login: { username: "dev.patel", password: "Sch00l@Teach1" } }),
    };
  },

  snapshot: async (a, c) => ({
    teachers: (await request(app).get(`${api}?status=all`).set(auth(a.token))).body.data,
    classes: (await request(app).get(`${api}/${c.teacherId}/classes`).set(auth(a.token))).body.data,
  }),

  lists: [
    { name: "the teachers", path: `${api}?status=all`, showsRecords: (body) => body.data.items.length > 0 },
    { name: "the teacher counts", path: `${api}/summary`, showsRecords: (body) => body.data.teaching + body.data.left > 0 },
  ],

  probes: [
    { name: "reading its teacher", method: "get", path: (c) => `${api}/${c.teacherId}` },
    { name: "changing its teacher", method: "patch", path: (c) => `${api}/${c.teacherId}`, body: () => ({ name: "Hacked" }) },
    { name: "making its teacher inactive", method: "patch", path: (c) => `${api}/${c.teacherId}`, body: () => ({ isActive: false }) },
    { name: "making a login for its teacher", method: "post", path: (c) => `${api}/${c.teacherId}/login`, body: () => ({ username: "hacker", password: "Sch00l@Teach1" }) },
    { name: "giving its teacher's login a new password", method: "post", path: (c) => `${api}/${c.withLoginId}/reset-password`, body: () => ({ password: "Sch00l@Hacked1" }) },
    { name: "making its teacher with a login inactive", method: "patch", path: (c) => `${api}/${c.withLoginId}`, body: () => ({ isActive: false }) },
    { name: "changing its teacher's username", method: "patch", path: (c) => `${api}/${c.withLoginId}/login`, body: () => ({ username: "hacker" }) },
    { name: "reading its teacher's classes", method: "get", path: (c) => `${api}/${c.teacherId}/classes` },
    {
      name: "taking away the class teacher of its section",
      method: "put",
      path: () => "/api/v1/staff/class-teachers",
      body: (c) => ({ classId: c.classId, sectionId: c.sectionId, teacherId: null }),
    },
  ],
});
