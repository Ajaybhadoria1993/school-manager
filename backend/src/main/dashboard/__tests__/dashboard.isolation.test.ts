import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { addClass, addTeacher, auth } from "../../../test/timetable";
import { Tenant } from "../../tenants/models/Tenant";

const api = "/api/v1/dashboard/school";

beforeEach(async () => {
  await seedSuperAdmin();
});

// The home page counts what is in ONE school: school B sees none of school A's students, teachers, classes or admissions.
itKeepsSchoolsApart("dashboard", {
  seed: async (a) => {
    await Tenant.updateOne({ _id: a.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
    await request(app).post("/api/v1/academics/academic-years/initial").set(auth(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" });
    const klass = await addClass(a.token, "Class 5", ["A"]);
    await addTeacher(a.token, "Meena Singh", { mobile: "9000000001" });
    await request(app)
      .post("/api/v1/students")
      .set(auth(a.token))
      .send({
        firstName: "Asha",
        lastName: "Verma",
        gender: "Female",
        dateOfBirth: "2018-05-14",
        address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
        previousSchool: { name: "Little Flower School" },
        classId: klass.id,
        sectionId: klass.sections[0].id,
        guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
      });
  },
  snapshot: async (a) => (await request(app).get(api).set(auth(a.token))).body.data,
  lists: [
    { name: "its student count", path: api, showsRecords: (body) => (body.data?.students?.total ?? 0) > 0 },
    { name: "its teacher count", path: api, showsRecords: (body) => (body.data?.people?.teachers ?? 0) > 0 },
    { name: "its classes", path: api, showsRecords: (body) => (body.data?.students?.byClass?.length ?? 0) > 0 },
    { name: "its admissions", path: api, showsRecords: (body) => (body.data?.admissions ?? []).some((m: { count: number }) => m.count > 0) },
  ],
  probes: [],
});
