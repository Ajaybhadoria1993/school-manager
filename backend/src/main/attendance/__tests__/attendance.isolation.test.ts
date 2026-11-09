import { afterEach, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { addClass, addTeacher, auth } from "../../../test/timetable";
import { clock } from "../../../utils/clock";

const api = "/api/v1/attendance";
const DAY = "2026-11-05";

beforeEach(async () => {
  await seedSuperAdmin();
  vi.spyOn(clock, "now").mockReturnValue(new Date(`${DAY}T16:00:00+05:30`));
});
afterEach(() => vi.restoreAllMocks());

// A school's attendance is its own: school B reads nothing of school A's students or teachers.
itKeepsSchoolsApart("attendance", {
  seed: async (a) => {
    await request(app).post("/api/v1/academics/academic-years/initial").set(auth(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" });
    const klass = await addClass(a.token, "Class 5");
    await addTeacher(a.token, "Meena Singh", { mobile: "9000000001" });
    return { classId: klass.id };
  },
  snapshot: async (a, c) => ({
    teachers: (await request(app).get(`${api}/teachers?from=${DAY}&to=${DAY}`).set(auth(a.token))).body.data,
    students: (await request(app).get(`${api}/students?classId=${c.classId}&sectionId=all&from=${DAY}&to=${DAY}`).set(auth(a.token))).body.data,
  }),
  lists: [{ name: "the teachers' sheet", path: `${api}/teachers?from=${DAY}&to=${DAY}`, showsRecords: (body) => (body.data?.teachers?.length ?? 0) > 0 }],
  probes: [{ name: "reading the students of its class", method: "get", path: (c) => `${api}/students?classId=${c.classId}&sectionId=all&from=${DAY}&to=${DAY}` }],
});
