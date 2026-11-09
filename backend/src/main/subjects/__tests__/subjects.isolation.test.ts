import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments } from "../../../test/timetable";
import { Tenant } from "../../tenants/models/Tenant";

const api = "/api/v1/subjects";

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("subjects", {
  seed: async (a) => {
    await Tenant.updateOne({ _id: a.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
    await request(app).post("/api/v1/academics/academic-years/initial").set(auth(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" });
    const klass = await addClass(a.token, "Class 5", ["A"]);
    await addTiming(a.token);
    const subjectId = await addSubject(a.token, "Mathematics");
    const teacherId = await addTeacher(a.token, "Meena Singh");
    const unit = { classId: klass.id, sectionId: klass.sections[0].id };
    await saveAllotments(a.token, unit, [{ subjectId, periodsPerWeek: 6, teacherId }]);
    return { ...unit, subjectId, teacherId };
  },

  snapshot: async (a, c) => ({
    subjects: (await request(app).get(`${api}?status=all`).set(auth(a.token))).body.data,
    allotments: (await request(app).get(`${api}/allotments?classId=${c.classId}&sectionId=${c.sectionId}`).set(auth(a.token))).body.data,
  }),

  lists: [{ name: "the subjects", path: `${api}?status=all`, showsRecords: (body) => body.data.items.length > 0 }],

  probes: [
    { name: "changing its subject", method: "patch", path: (c) => `${api}/${c.subjectId}`, body: () => ({ name: "Hacked" }) },
    { name: "archiving its subject", method: "patch", path: (c) => `${api}/${c.subjectId}`, body: () => ({ isActive: false }), status: 404 },
    { name: "reading what its section studies", method: "get", path: (c) => `${api}/allotments?classId=${c.classId}&sectionId=${c.sectionId}` },
    {
      name: "changing what its section studies",
      method: "put",
      path: () => `${api}/allotments`,
      body: (c) => ({ classId: c.classId, sectionId: c.sectionId, rows: [{ subjectId: c.subjectId, periodsPerWeek: 1 }] }),
    },
    {
      name: "taking the teacher off a subject of its section",
      method: "put",
      path: () => `${api}/allotments/teacher`,
      body: (c) => ({ classId: c.classId, sectionId: c.sectionId, subjectId: c.subjectId, teacherId: null }),
    },
    {
      name: "saving the class teacher and the teachers of its section in one go (2026-11-06)",
      method: "put",
      path: () => `${api}/allotments/teachers`,
      body: (c) => ({ classId: c.classId, sectionId: c.sectionId, classTeacherId: null, subjects: [{ subjectId: c.subjectId, teacherId: null, backupTeacherIds: [] }] }),
    },
  ],
});
