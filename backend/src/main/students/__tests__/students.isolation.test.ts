import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { createSchool, type SchoolSession } from "../../../test/schools";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { Guardian } from "../models/Guardian";
import { Student } from "../models/Student";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

/** The school's year, Class 5 with section A, and one student admitted into it. */
async function schoolWithStudent(s: SchoolSession, mobile = "9876543210") {
  await request(app).post(`${academics}/academic-years/initial`).set(as(s.token)).send(YEAR);
  const klass = (await request(app).post(`${academics}/classes`).set(as(s.token)).send({ name: "Class 5", sectionCount: 0 })).body.data;
  const section = (await request(app).post(`${academics}/classes/${klass.id}/sections`).set(as(s.token)).send({ name: "A", capacity: 40, room: "5A" })).body.data;
  const student = (
    await request(app)
      .post(api)
      .set(as(s.token))
      .send({
        firstName: "Asha",
        lastName: "Verma",
        gender: "Female",
        dateOfBirth: "2016-05-14",
        address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
        classId: klass.id,
        sectionId: section.id,
        guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile }],
      })
  ).body.data;
  return { classId: klass.id as string, sectionId: section.id as string, studentId: student.id as string, guardianId: student.guardians[0].id as string };
}

/** A body that would admit a new child into the given class and section, linking the given guardian when one is passed. */
const newChild = (classId: string, sectionId: string, guardianId?: string) => ({
  firstName: "Kabir",
  lastName: "Rao",
  gender: "Male",
  dateOfBirth: "2017-01-01",
  address: { line1: "4 Lake View", city: "Indore", state: "Madhya Pradesh", pincode: "452001" },
  classId,
  sectionId,
  guardians: [{ ...(guardianId ? { guardianId } : {}), name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
});

itKeepsSchoolsApart("students", {
  seed: (a) => schoolWithStudent(a),

  snapshot: async (a, ctx) => ({
    student: (await request(app).get(`${api}/${ctx.studentId}`).set(as(a.token))).body.data,
    list: (await request(app).get(api).set(as(a.token))).body.data,
  }),

  lists: [
    { name: "the student list", path: api, showsRecords: (body) => body.data.total > 0 },
    { name: "the seats", path: `${api}/capacity`, showsRecords: (body) => body.data.totals.students > 0 },
  ],

  probes: [
    { name: "reading its student", method: "get", path: (c) => `${api}/${c.studentId}` },
    { name: "changing its student", method: "patch", path: (c) => `${api}/${c.studentId}`, body: () => ({ firstName: "Hacked" }) },
    // 404 before 400: an invalid body does not tell school B anything either.
    { name: "changing its student with a wrong body", method: "patch", path: (c) => `${api}/${c.studentId}`, body: () => ({ firstName: "" }) },
    { name: "moving its student", method: "patch", path: (c) => `${api}/${c.studentId}/enrolment`, body: (c) => ({ sectionId: c.sectionId }) },
    { name: "changing its guardian", method: "patch", path: (c) => `${api}/guardians/${c.guardianId}`, body: () => ({ name: "Hacked" }) },
  ],
});
// Ids of school A's class, section and guardian sent in school B's request BODY are checked below (school B needs its own year and
// class for those requests to get that far).

describe("students: ids from another school in a request body", () => {
  it("are refused: another school's class, section and guardian are 'not in your school', and nothing is made", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const own = await schoolWithStudent(a);
    const theirs = await schoolWithStudent(b, "9111111111");

    const intoTheirClass = await request(app).post(api).set(as(b.token)).send(newChild(own.classId, own.sectionId));
    expect(intoTheirClass.status).toBe(400);
    expect(intoTheirClass.body.code).toBe("CLASS_NOT_FOUND");

    const intoTheirSection = await request(app).post(api).set(as(b.token)).send(newChild(theirs.classId, own.sectionId));
    expect(intoTheirSection.status).toBe(400);
    expect(intoTheirSection.body.code).toBe("SECTION_NOT_FOUND");

    const withTheirGuardian = await request(app).post(api).set(as(b.token)).send(newChild(theirs.classId, theirs.sectionId, own.guardianId));
    expect(withTheirGuardian.status).toBe(400);
    expect(withTheirGuardian.body.code).toBe("GUARDIAN_NOT_FOUND");

    const moveIntoTheirSection = await request(app).patch(`${api}/${theirs.studentId}/enrolment`).set(as(b.token)).send({ sectionId: own.sectionId });
    expect(moveIntoTheirSection.status).toBe(400);

    expect(await Student.countDocuments({ tenantId: b.tenantId })).toBe(1);
    expect(await Guardian.countDocuments({ tenantId: b.tenantId })).toBe(1);
    expect((await request(app).get(`${api}/${own.studentId}`).set(as(a.token))).body.data.guardians[0].name).toBe("Ravi Verma");
  });

  it("the guardian lookup only searches the caller's own school (the same mobile can be a parent in two schools)", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    await schoolWithStudent(a);
    await request(app).post(`${academics}/academic-years/initial`).set(as(b.token)).send(YEAR);

    expect((await request(app).post(`${api}/guardians/lookup`).set(as(b.token)).send({ mobile: "9876543210" })).body.data).toEqual({ guardian: null });
    expect((await request(app).post(`${api}/guardians/lookup`).set(as(a.token)).send({ mobile: "9876543210" })).body.data.guardian).not.toBeNull();

    // The same parent admitting a child at school B is a new guardian there, not a link to school A's.
    const theirs = await schoolWithStudent(b);
    expect(theirs.guardianId).toBeTruthy();
    expect(await Guardian.countDocuments({ tenantId: b.tenantId })).toBe(1);
    expect(await Guardian.countDocuments({ tenantId: a.tenantId })).toBe(1);
  });
});
