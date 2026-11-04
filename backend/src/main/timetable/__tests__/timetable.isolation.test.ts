import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments } from "../../../test/timetable";
import { createSchool } from "../../../test/schools";
import { Tenant } from "../../tenants/models/Tenant";

const api = "/api/v1/timetable";

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("timetable", {
  seed: async (a) => {
    await Tenant.updateOne({ _id: a.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
    await request(app).post("/api/v1/academics/academic-years/initial").set(auth(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" });
    const klass = await addClass(a.token, "Class 5", ["A", "B"]);
    const timingId = await addTiming(a.token);
    const maths = await addSubject(a.token, "Mathematics");
    const teacherId = await addTeacher(a.token, "Meena Singh");
    const other = await addTeacher(a.token, "Dev Patel");
    const unit = { classId: klass.id, sectionId: klass.sections[0].id };
    await saveAllotments(a.token, unit, [{ subjectId: maths, periodsPerWeek: 6, teacherId }]);
    await request(app).put(`${api}/grid`).set(auth(a.token)).send({ ...unit, cells: [{ day: 1, period: 1, lessons: [{ subjectId: maths }] }] });
    return { ...unit, otherSectionId: klass.sections[1].id, timingId, teacherId, other };
  },

  snapshot: async (a, c) => ({
    overview: (await request(app).get(`${api}/overview`).set(auth(a.token))).body.data,
    schedules: (await request(app).get(`${api}/schedules`).set(auth(a.token))).body.data,
    grid: (await request(app).get(`${api}/grid?classId=${c.classId}&sectionId=${c.sectionId}`).set(auth(a.token))).body.data,
    week: (await request(app).get(`${api}/teachers/${c.teacherId}`).set(auth(a.token))).body.data,
  }),

  lists: [
    { name: "the timings", path: `${api}/schedules`, showsRecords: (body) => body.data.items.length > 0 },
    { name: "the overview", path: `${api}/overview`, showsRecords: (body) => body.data.units.length > 0 && body.data.timings.length > 0 },
  ],

  probes: [
    { name: "reading its class's timetable", method: "get", path: (c) => `${api}/grid?classId=${c.classId}&sectionId=${c.sectionId}` },
    { name: "saving its class's timetable", method: "put", path: () => `${api}/grid`, body: (c) => ({ classId: c.classId, sectionId: c.sectionId, cells: [] }) },
    { name: "publishing its class's timetable", method: "post", path: () => `${api}/grid/publish`, body: (c) => ({ classId: c.classId, sectionId: c.sectionId }) },
    { name: "taking its class's timetable back", method: "post", path: () => `${api}/grid/unpublish`, body: (c) => ({ classId: c.classId, sectionId: c.sectionId }) },
    { name: "filling its class's timetable", method: "post", path: () => `${api}/grid/autofill`, body: (c) => ({ classId: c.classId, sectionId: c.sectionId, cells: [] }) },
    { name: "copying its class's timetable", method: "post", path: () => `${api}/grid/copy`, body: (c) => ({ classId: c.classId, sectionId: c.sectionId, toSections: [c.otherSectionId] }) },
    { name: "changing its timing", method: "patch", path: (c) => `${api}/schedules/${c.timingId}`, body: () => ({ name: "Hacked" }) },
    { name: "deleting its timing", method: "delete", path: (c) => `${api}/schedules/${c.timingId}` },
    { name: "giving its class days of its own", method: "put", path: () => `${api}/class-day`, body: (c) => ({ classId: c.classId, days: [{ day: 1, slots: [{ kind: "period", start: "08:30", end: "09:10" }] }], removeLessons: true }) },
    { name: "reading its teacher's week", method: "get", path: (c) => `${api}/teachers/${c.teacherId}` },
    { name: "giving its teacher's classes away", method: "post", path: (c) => `${api}/teachers/${c.teacherId}/replace`, body: (c) => ({ withTeacherId: c.other }) },
  ],
});

// A timing of school B must not make school A's class follow it, and school B's classes cannot be named in a timing of school A.
import { describe, it, expect } from "vitest";

describe("timetable: classes of another school", () => {
  it("cannot be named in a timing", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const foreign = await addClass(b.token, "Class 1");
    const res = await request(app)
      .post(`${api}/schedules`)
      .set(auth(a.token))
      .send({ name: "Mine", days: [1], scope: "only", classIds: [foreign.id], slots: [{ kind: "period", start: "08:30", end: "09:10" }] });
    expect(res.status).toBe(400);
    expect(await request(app).get(`${api}/schedules`).set(auth(b.token)).then((r) => r.body.data.items)).toEqual([]);
    expect(res.body.details[0].path).toBe("classIds");
  });
});
