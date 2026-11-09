import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { LOGIN_PASSWORD, signInAs } from "../../../test/classroom";
import { addClass, addSubject, auth, saveAllotments } from "../../../test/timetable";
import { Tenant } from "../../tenants/models/Tenant";

const api = "/api/v1/classroom";

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("classroom", {
  seed: async (a) => {
    const event = (await request(app).post(`${api}/calendar`).set(auth(a.token)).send({ title: "Diwali", kind: "holiday", startDate: "2026-11-08", endDate: "2026-11-10" })).body.data;
    // A child with a parent who has a login, and a leave sent by that parent.
    await Tenant.updateOne({ _id: a.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
    await request(app).post("/api/v1/academics/academic-years/initial").set(auth(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" });
    const klass = await addClass(a.token, "Class 5", ["A"]);
    const child = (
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
        })
    ).body.data;
    const username = `ravi.${a.tenantId.slice(-6)}`;
    await request(app).post(`/api/v1/students/guardians/${child.guardians[0].id}/login`).set(auth(a.token)).send({ username, password: LOGIN_PASSWORD });
    const parent = await signInAs(username);
    const leave = (await request(app).post(`/api/v1/parent/children/${child.id}/leaves`).set(auth(parent)).send({ fromDate: "2026-11-12", reason: "Fever" })).body.data;
    // A subject of the section and a test of it.
    const unit = { classId: klass.id, sectionId: klass.sections[0].id };
    const subjectId = await addSubject(a.token, "Mathematics");
    await saveAllotments(a.token, unit, [{ subjectId, periodsPerWeek: 5 }]);
    const test = (await request(app).post(`${api}/tests`).set(auth(a.token)).send({ ...unit, subjectId, date: "2026-11-02", topic: "Fractions", maxMarks: 20 })).body.data;
    return { eventId: event.id as string, leaveId: leave.id as string, classId: klass.id, sectionId: klass.sections[0].id, subjectId, testId: test.id as string };
  },

  snapshot: async (a) => ({
    calendar: (await request(app).get(`${api}/calendar`).set(auth(a.token))).body.data,
    leaves: (await request(app).get(`${api}/leaves`).set(auth(a.token))).body.data,
  }),

  lists: [
    { name: "the calendar", path: `${api}/calendar`, showsRecords: (body) => body.data.items.length > 0 },
    { name: "the leaves", path: `${api}/leaves`, showsRecords: (body) => body.data.items.length > 0 },
  ],

  probes: [
    { name: "changing its holiday", method: "patch", path: (c) => `${api}/calendar/${c.eventId}`, body: () => ({ title: "Hacked" }) },
    { name: "taking its holiday off", method: "delete", path: (c) => `${api}/calendar/${c.eventId}` },
    { name: "answering its leave", method: "post", path: (c) => `${api}/leaves/${c.leaveId}/decide`, body: () => ({ status: "approved" }) },
    { name: "reading its class's attendance", method: "get", path: (c) => `${api}/attendance?classId=${c.classId}&sectionId=${c.sectionId}&date=2026-11-02` },
    { name: "taking its class's attendance", method: "put", path: () => `${api}/attendance`, body: (c) => ({ classId: c.classId, sectionId: c.sectionId, date: "2026-11-02", marks: [] }) },
    { name: "reading its class's diary", method: "get", path: (c) => `${api}/diary?classId=${c.classId}&sectionId=${c.sectionId}&date=2026-11-02` },
    { name: "writing its class's diary", method: "put", path: () => `${api}/diary`, body: (c) => ({ classId: c.classId, sectionId: c.sectionId, date: "2026-11-02", subjectId: c.subjectId, taught: "Hacked" }) },
    { name: "reading its class's tests", method: "get", path: (c) => `${api}/tests?classId=${c.classId}&sectionId=${c.sectionId}` },
    { name: "reading its test", method: "get", path: (c) => `${api}/tests/${c.testId}` },
    { name: "entering its test's marks", method: "put", path: (c) => `${api}/tests/${c.testId}/marks`, body: () => ({ marks: [] }) },
    { name: "taking its test away", method: "delete", path: (c) => `${api}/tests/${c.testId}` },
  ],
});
