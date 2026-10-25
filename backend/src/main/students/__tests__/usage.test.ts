import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { createSchool } from "../../../test/schools";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { studentCountsBySection } from "../../academics/services/usage";
import { Enrolment } from "../models/Enrolment";

/**
 * The class and section delete guards of Classes & Sections, now with real students (academics.test.ts checks the same guards with
 * the counts stubbed). A class or section with students cannot be deleted; a class keeps its history across years.
 */

const academics = "/api/v1/academics";
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

async function setUp() {
  const s = await createSchool("Sunrise Public School");
  await request(app).post(`${academics}/academic-years/initial`).set(as(s.token)).send(YEAR);
  const class5 = (await request(app).post(`${academics}/classes`).set(as(s.token)).send({ name: "Class 5", sectionCount: 0 })).body.data;
  const a = (await request(app).post(`${academics}/classes/${class5.id}/sections`).set(as(s.token)).send({ name: "A", capacity: 40, room: "1" })).body.data;
  const b = (await request(app).post(`${academics}/classes/${class5.id}/sections`).set(as(s.token)).send({ name: "B", capacity: 40, room: "2" })).body.data;
  const class1 = (await request(app).post(`${academics}/classes`).set(as(s.token)).send({ name: "Class 1", sectionCount: 0 })).body.data;
  return { ...s, class5: class5.id as string, a: a.id as string, b: b.id as string, class1: class1.id as string };
}

const admit = (token: string, classId: string, sectionId: string | null, mobile: string) =>
  request(app)
    .post("/api/v1/students")
    .set(as(token))
    .send({
      firstName: "Asha",
      lastName: `Verma ${mobile.slice(-2)}`,
      gender: "Female",
      dateOfBirth: "2018-05-14",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      previousSchool: { name: "Little Flower School" },
      classId,
      sectionId,
      guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile }],
    });

describe("the class and section delete guards, with real students", () => {
  it("counts the active students of each section", async () => {
    const s = await setUp();
    for (const mobile of ["9000000001", "9000000002"]) expect((await admit(s.token, s.class5, s.a, mobile)).status).toBe(201);
    expect((await admit(s.token, s.class5, s.b, "9000000003")).status).toBe(201);
    const counts = await studentCountsBySection(s.tenantId, [s.a, s.b]);
    expect(Object.fromEntries(counts)).toEqual({ [s.a]: 2, [s.b]: 1 });
    expect((await studentCountsBySection(s.tenantId, [])).size).toBe(0);
  });

  it("keeps a section that has a student, and lets an empty one go", async () => {
    const s = await setUp();
    await admit(s.token, s.class5, s.a, "9000000001");
    const blocked = await request(app).delete(`${academics}/sections/${s.a}`).set(as(s.token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("SECTION_HAS_STUDENTS");
    expect(blocked.body.message).toContain("1 student.");
    expect((await request(app).delete(`${academics}/sections/${s.b}`).set(as(s.token))).status).toBe(200);
  });

  it("keeps a class whose section has students, and a class without sections that has students itself", async () => {
    const s = await setUp();
    await admit(s.token, s.class5, s.b, "9000000001");
    const inSection = await request(app).delete(`${academics}/classes/${s.class5}`).set(as(s.token));
    expect(inSection.status).toBe(409);
    expect(inSection.body.code).toBe("CLASS_HAS_STUDENTS");

    await admit(s.token, s.class1, null, "9000000002");
    const inClass = await request(app).delete(`${academics}/classes/${s.class1}`).set(as(s.token));
    expect(inClass.status).toBe(409);
    expect(inClass.body.code).toBe("CLASS_HAS_STUDENTS");
    expect(inClass.body.message).toContain("1 student.");
    expect(await SchoolClass.countDocuments({ tenantId: s.tenantId })).toBe(2);
    expect(await Section.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("keeps a class that had students in another academic year (its history), even with none this year", async () => {
    const s = await setUp();
    // Last year a student sat in Class 1, which has no sections.
    await Enrolment.create({
      tenantId: s.tenantId,
      studentId: new Types.ObjectId(),
      academicYearId: new Types.ObjectId(),
      classId: s.class1,
      sectionId: null,
      enrolledAt: new Date("2025-06-01"),
    });
    const res = await request(app).delete(`${academics}/classes/${s.class1}`).set(as(s.token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CLASS_HAS_HISTORY");
    expect(await SchoolClass.countDocuments({ tenantId: s.tenantId, _id: s.class1 })).toBe(1);
  });

  it("lets a class with no students at all be deleted, as before", async () => {
    const s = await setUp();
    expect((await request(app).delete(`${academics}/classes/${s.class1}`).set(as(s.token))).status).toBe(200);
  });
});
