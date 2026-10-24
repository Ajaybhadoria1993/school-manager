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

itKeepsSchoolsApart("academics", {
  seed: async (a) => {
    const department = (await request(app).post(`${api}/departments`).set(as(a.token)).send({ name: "Primary" })).body.data;
    const klass = (
      await request(app).post(`${api}/classes`).set(as(a.token)).send({ name: "Class 1", departmentId: department.id })
    ).body.data;
    return { departmentId: department.id as string, classId: klass.id as string, sectionId: klass.sections[0].id as string };
  },

  snapshot: async (a) => (await request(app).get(`${api}/structure`).set(as(a.token))).body.data,

  lists: [
    {
      name: "the class layout",
      path: `${api}/structure`,
      showsRecords: (body) => body.data.departments.length > 0 || body.data.classes.length > 0,
    },
    {
      name: "the class list",
      path: `${api}/classes`,
      showsRecords: (body) => body.data.total > 0,
    },
  ],

  probes: [
    { name: "renaming its department", method: "patch", path: (c) => `${api}/departments/${c.departmentId}`, body: () => ({ name: "Hacked" }) },
    { name: "deleting its department", method: "delete", path: (c) => `${api}/departments/${c.departmentId}` },
    {
      name: "adding classes to its department",
      method: "post",
      path: (c) => `${api}/departments/${c.departmentId}/classes`,
      body: () => ({ names: ["Hacked class"] }),
    },
    {
      // The class check comes first, so nothing is created for a stranger's class either.
      name: "putting its class in a department",
      method: "post",
      path: () => `${api}/departments/assign`,
      body: (c) => ({ name: "Hacked wing", classIds: [c.classId] }),
    },
    { name: "reading its class", method: "get", path: (c) => `${api}/classes/${c.classId}` },
    { name: "renaming its class", method: "patch", path: (c) => `${api}/classes/${c.classId}`, body: () => ({ name: "Hacked" }) },
    { name: "deleting its class", method: "delete", path: (c) => `${api}/classes/${c.classId}` },
    { name: "adding a section to its class", method: "post", path: (c) => `${api}/classes/${c.classId}/sections`, body: () => ({ name: "Z" }) },
    { name: "changing its section", method: "patch", path: (c) => `${api}/sections/${c.sectionId}`, body: () => ({ capacity: 5 }) },
    { name: "deleting its section", method: "delete", path: (c) => `${api}/sections/${c.sectionId}` },
    {
      name: "putting a new class of its own into its department",
      method: "post",
      path: () => `${api}/classes`,
      body: (c) => ({ name: "Class 9", departmentId: c.departmentId }),
      status: 400,
    },
  ],
});
