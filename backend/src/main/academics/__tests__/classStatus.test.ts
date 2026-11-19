import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Enrolment } from "../../students/models/Enrolment";
import { Tenant } from "../../tenants/models/Tenant";
import { Department } from "../models/Department";
import { SchoolClass } from "../models/SchoolClass";
import { Section } from "../models/Section";

/**
 * A class and a department are never deleted: once a school has made one, it can only be made inactive (and active again). A class
 * holds a school's students and their history, so deleting one by mistake would lose data. These tests use the real Students module.
 */

const api = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) =>
  request(app).post(`${api}${path}`).set(auth(token)).send(/^\/classes$|\/classes$/.test(path) ? { capacity: 2000, ...body } : body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);
const structure = async (token: string) => (await get(token, "/structure")).body.data;

async function school(name = "Sunrise Public School") {
  const made = await createSchool(name);
  await Tenant.updateOne({ _id: made.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
  await request(app).post(`${api}/academic-years/initial`).set(auth(made.token)).send(YEAR);
  return made;
}

const admit = (token: string, classId: string, sectionId: string | null, mobile: string) =>
  request(app)
    .post("/api/v1/students")
    .set(auth(token))
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

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a class is never deleted", () => {
  it("has no delete route at all: it answers 404 and the class stays", async () => {
    const { token, tenantId } = await school();
    const klass = (await post(token, "/classes", { name: "Class 5", sectionCount: 0 })).body.data;
    const res = await request(app).delete(`${api}/classes/${klass.id}`).set(auth(token));
    expect(res.status).toBe(404);
    expect(await SchoolClass.countDocuments({ tenantId })).toBe(1);
  });

  it("can be made inactive: it leaves the layout and the class list, and is kept in the inactive ones, with who and when", async () => {
    const { token, tenantId } = await school();
    const five = (await post(token, "/classes", { name: "Class 5", sectionCount: 2 })).body.data;
    await post(token, "/classes", { name: "Class 6", sectionCount: 0 });

    const res = await post(token, `/classes/${five.id}/deactivate`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: five.id, name: "Class 5", status: "inactive" });
    expect(res.body.data.inactive).toMatchObject({ by: { role: "school_admin" } });
    expect(res.body.data.inactive.at).toBeTruthy();

    const s = await structure(token);
    expect(s.classes.map((c: { name: string }) => c.name)).toEqual(["Class 6"]);
    expect(s.inactiveClasses.map((c: { name: string }) => c.name)).toEqual(["Class 5"]);
    expect(s.totals.classes).toBe(1);

    // Its sections stay: nothing is thrown away.
    expect(await Section.countDocuments({ tenantId, classId: five.id })).toBe(2);
    expect(await SchoolClass.countDocuments({ tenantId })).toBe(2);
  });

  it("is listed as active by default, and the inactive ones are asked for", async () => {
    const { token } = await school();
    const five = (await post(token, "/classes", { name: "Class 5", sectionCount: 0 })).body.data;
    await post(token, "/classes", { name: "Class 6", sectionCount: 0 });
    await post(token, `/classes/${five.id}/deactivate`);

    const names = async (query: string) => (await get(token, `/classes${query}`)).body.data.items.map((c: { name: string }) => c.name);
    expect(await names("")).toEqual(["Class 6"]);
    expect(await names("?status=active")).toEqual(["Class 6"]);
    expect(await names("?status=inactive")).toEqual(["Class 5"]);
    expect(await names("?status=all")).toEqual(["Class 5", "Class 6"]);
    expect((await get(token, "/classes?status=gone")).status).toBe(400);
    // One class is still read by its id, active or not.
    expect((await get(token, `/classes/${five.id}`)).body.data.status).toBe("inactive");
  });

  it("can be made active again, and then it is back where it was", async () => {
    const { token } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const five = (await post(token, "/classes", { name: "Class 5", sectionCount: 1, departmentId: dept.id })).body.data;
    await post(token, `/classes/${five.id}/deactivate`);

    const res = await post(token, `/classes/${five.id}/reactivate`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Class 5", status: "active", departmentId: dept.id, inactive: null });
    const s = await structure(token);
    expect(s.classes).toHaveLength(1);
    expect(s.classes[0].sections).toHaveLength(1);
    expect(s.inactiveClasses).toEqual([]);
  });

  it("says so when it is made inactive twice, or active when it already is", async () => {
    const { token } = await school();
    const five = (await post(token, "/classes", { name: "Class 5", sectionCount: 0 })).body.data;
    const active = await post(token, `/classes/${five.id}/reactivate`);
    expect(active.status).toBe(409);
    expect(active.body.code).toBe("CLASS_ALREADY_ACTIVE");
    await post(token, `/classes/${five.id}/deactivate`);
    const again = await post(token, `/classes/${five.id}/deactivate`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CLASS_ALREADY_INACTIVE");
  });

  it("keeps its name for itself: nobody can make another class with it, or rename one to it, in any case or spacing", async () => {
    const { token, tenantId } = await school();
    const five = (await post(token, "/classes", { name: "Class 5", sectionCount: 0 })).body.data;
    const six = (await post(token, "/classes", { name: "Class 6", sectionCount: 0 })).body.data;
    await post(token, `/classes/${five.id}/deactivate`);

    const again = await post(token, "/classes", { name: "  class   5 ", sectionCount: 0 });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CLASS_EXISTS");
    expect(again.body.message).toContain("inactive");
    expect(again.body.message).toContain("Make it active");

    const rename = await patch(token, `/classes/${six.id}`, { name: "CLASS 5" });
    expect(rename.status).toBe(409);
    expect(rename.body.code).toBe("CLASS_EXISTS");

    // The same in a department's own screen.
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const viaDepartment = await post(token, `/departments/${dept.id}/classes`, { names: ["class 5"], sectionCount: 0 });
    expect(viaDepartment.status).toBe(409);
    expect(viaDepartment.body.code).toBe("CLASS_EXISTS");
    expect(await SchoolClass.countDocuments({ tenantId, nameKey: "class 5" })).toBe(1);
  });

  it("an active class says plainly that its name is taken, without the word inactive", async () => {
    const { token } = await school();
    await post(token, "/classes", { name: "Class 5", sectionCount: 0 });
    const again = await post(token, "/classes", { name: "class 5", sectionCount: 0 });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('You already have a class called "Class 5".');
  });

  it("cannot be changed while it is inactive, nor can its sections", async () => {
    const { token } = await school();
    const five = (await post(token, "/classes", { name: "Class 5", sectionCount: 1 })).body.data;
    await post(token, `/classes/${five.id}/deactivate`);

    for (const body of [{ name: "Class Five" }, { capacity: 50 }]) {
      const res = await patch(token, `/classes/${five.id}`, body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CLASS_INACTIVE");
    }
    const sectionId = five.sections[0].id;
    expect((await post(token, `/classes/${five.id}/sections`, { name: "B" })).body.code).toBe("CLASS_INACTIVE");
    expect((await patch(token, `/sections/${sectionId}`, { room: "9" })).body.code).toBe("CLASS_INACTIVE");
    expect((await request(app).delete(`${api}/sections/${sectionId}`).set(auth(token))).body.code).toBe("CLASS_INACTIVE");
  });

  it("is refused by another school: the id is answered as if it did not exist", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    const five = (await post(a.token, "/classes", { name: "Class 5", sectionCount: 0 })).body.data;
    expect((await post(b.token, `/classes/${five.id}/deactivate`)).status).toBe(404);
    expect((await get(a.token, `/classes/${five.id}`)).body.data.status).toBe("active");
    await post(a.token, `/classes/${five.id}/deactivate`);
    expect((await post(b.token, `/classes/${five.id}/reactivate`)).status).toBe(404);
  });

  it("follows the school's Permissions: someone who may not manage classes cannot make one inactive", async () => {
    const { token, tenantId } = await school();
    const five = (await post(token, "/classes", { name: "Class 5", sectionCount: 0 })).body.data;
    const teacher = await addColleague(tenantId, "teacher");
    expect((await post(teacher, `/classes/${five.id}/deactivate`)).status).toBe(403);
    expect((await get(token, `/classes/${five.id}`)).body.data.status).toBe("active");
  });

  it("a class made before there was a status counts as active", async () => {
    const { token, tenantId } = await school();
    await SchoolClass.collection.insertOne({ tenantId: (await Tenant.findById(tenantId))!._id, name: "Old", nameKey: "old", order: 1, capacity: 30 });
    const s = await structure(token);
    expect(s.classes.map((c: { name: string }) => c.name)).toEqual(["Old"]);
    expect((await post(token, `/classes/${s.classes[0].id}/deactivate`)).status).toBe(200);
  });
});

describe("a class with students stays until they are moved", () => {
  async function withStudents() {
    const s = await school();
    const five = (await post(s.token, "/classes", { name: "Class 5", sectionCount: 0 })).body.data;
    const a = (await post(s.token, `/classes/${five.id}/sections`, { name: "A", capacity: 40 })).body.data;
    const one = (await post(s.token, "/classes", { name: "Class 1", sectionCount: 0 })).body.data;
    return { ...s, five: five.id as string, a: a.id as string, one: one.id as string };
  }

  it("a class whose section has a student, or which holds one itself, is not made inactive, and says how many", async () => {
    const s = await withStudents();
    expect((await admit(s.token, s.five, s.a, "9000000001")).status).toBe(201);
    const inSection = await post(s.token, `/classes/${s.five}/deactivate`);
    expect(inSection.status).toBe(409);
    expect(inSection.body.code).toBe("CLASS_HAS_STUDENTS");
    expect(inSection.body.message).toContain("1 student");

    expect((await admit(s.token, s.one, null, "9000000002")).status).toBe(201);
    expect((await admit(s.token, s.one, null, "9000000003")).status).toBe(201);
    const inClass = await post(s.token, `/classes/${s.one}/deactivate`);
    expect(inClass.status).toBe(409);
    expect(inClass.body.message).toContain("2 students");
    expect((await get(s.token, `/classes/${s.one}`)).body.data.status).toBe("active");
  });

  it("is allowed once its students are inactive (they left): their record stays in the class", async () => {
    const s = await withStudents();
    const kid = (await admit(s.token, s.one, null, "9000000002")).body.data;
    expect((await post(s.token, `/classes/${s.one}/deactivate`)).status).toBe(409);
    expect((await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [kid.id] })).status).toBe(200);
    expect((await post(s.token, `/classes/${s.one}/deactivate`)).status).toBe(200);
  });

  it("a class that held students in another year (its history) can still be made inactive: nothing is lost", async () => {
    const s = await withStudents();
    await Enrolment.create({
      tenantId: s.tenantId,
      studentId: new Types.ObjectId(),
      academicYearId: new Types.ObjectId(),
      classId: s.one,
      sectionId: null,
      status: "inactive",
      enrolledAt: new Date("2025-06-01"),
    });
    expect((await post(s.token, `/classes/${s.one}/deactivate`)).status).toBe(200);
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, classId: s.one })).toBe(1);
  });

  it("nobody is admitted into an inactive class, and nobody can be moved into it", async () => {
    const s = await withStudents();
    await post(s.token, `/classes/${s.one}/deactivate`);
    const res = await admit(s.token, s.one, null, "9000000004");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CLASS_INACTIVE");

    const kid = (await admit(s.token, s.five, s.a, "9000000005")).body.data;
    const move = await request(app).patch(`/api/v1/students/${kid.id}/enrolment`).set(auth(s.token)).send({ classId: s.one, sectionId: null });
    expect(move.status).toBe(400);
    expect(move.body.code).toBe("CLASS_INACTIVE");
  });
});

describe("a department is never deleted", () => {
  it("has no delete route: it answers 404 and the department stays", async () => {
    const { token, tenantId } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const res = await request(app).delete(`${api}/departments/${dept.id}`).set(auth(token));
    expect(res.status).toBe(404);
    expect(await Department.countDocuments({ tenantId })).toBe(1);
  });

  it("can be made inactive when it has no active classes: it leaves the layout and is kept in the inactive ones", async () => {
    const { token, tenantId } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const res = await post(token, `/departments/${dept.id}/deactivate`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: dept.id, name: "Primary", status: "inactive" });
    expect(res.body.data.inactive).toMatchObject({ by: { role: "school_admin" } });

    const s = await structure(token);
    expect(s.departments).toEqual([]);
    expect(s.inactiveDepartments.map((d: { name: string }) => d.name)).toEqual(["Primary"]);
    expect(await Department.countDocuments({ tenantId })).toBe(1);
  });

  it("is not made inactive while it has an active class: the class is named, and nothing changes", async () => {
    const { token } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const one = (await post(token, "/classes", { name: "Class 1", departmentId: dept.id, sectionCount: 0 })).body.data;
    await post(token, "/classes", { name: "Class 2", departmentId: dept.id, sectionCount: 0 });

    const blocked = await post(token, `/departments/${dept.id}/deactivate`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("DEPARTMENT_HAS_CLASSES");
    expect(blocked.body.message).toContain("2 active classes");
    expect((await structure(token)).departments).toHaveLength(1);

    // Class 1 goes inactive, Class 2 is still there.
    await post(token, `/classes/${one.id}/deactivate`);
    expect((await post(token, `/departments/${dept.id}/deactivate`)).body.message).toContain("1 active class");
  });

  it("is made inactive after its classes are, and its inactive classes keep pointing at it", async () => {
    const { token } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const one = (await post(token, "/classes", { name: "Class 1", departmentId: dept.id, sectionCount: 0 })).body.data;
    await post(token, `/classes/${one.id}/deactivate`);
    expect((await post(token, `/departments/${dept.id}/deactivate`)).status).toBe(200);

    const s = await structure(token);
    expect(s.inactiveClasses[0]).toMatchObject({ name: "Class 1", departmentId: dept.id });
  });

  it("is made active again, and a class of it can then be made active", async () => {
    const { token } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const one = (await post(token, "/classes", { name: "Class 1", departmentId: dept.id, sectionCount: 0 })).body.data;
    await post(token, `/classes/${one.id}/deactivate`);
    await post(token, `/departments/${dept.id}/deactivate`);

    // The class cannot come back into a department that is inactive.
    const blocked = await post(token, `/classes/${one.id}/reactivate`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("DEPARTMENT_INACTIVE");

    const back = await post(token, `/departments/${dept.id}/reactivate`);
    expect(back.status).toBe(200);
    expect(back.body.data).toMatchObject({ status: "active", inactive: null });
    expect((await post(token, `/classes/${one.id}/reactivate`)).status).toBe(200);
    expect((await structure(token)).departments.map((d: { name: string; classCount: number }) => [d.name, d.classCount])).toEqual([["Primary", 1]]);
  });

  it("says so when it is made inactive twice, or active when it already is", async () => {
    const { token } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    expect((await post(token, `/departments/${dept.id}/reactivate`)).body.code).toBe("DEPARTMENT_ALREADY_ACTIVE");
    await post(token, `/departments/${dept.id}/deactivate`);
    expect((await post(token, `/departments/${dept.id}/deactivate`)).body.code).toBe("DEPARTMENT_ALREADY_INACTIVE");
  });

  it("keeps its name for itself, in any case or spacing, and cannot be renamed while inactive", async () => {
    const { token } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const other = (await post(token, "/departments", { name: "Middle" })).body.data;
    await post(token, `/departments/${dept.id}/deactivate`);

    const again = await post(token, "/departments", { name: " primary " });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("DEPARTMENT_EXISTS");
    expect(again.body.message).toContain("inactive");

    const rename = await patch(token, `/departments/${other.id}`, { name: "PRIMARY" });
    expect(rename.status).toBe(409);
    expect(rename.body.code).toBe("DEPARTMENT_EXISTS");

    const own = await patch(token, `/departments/${dept.id}`, { name: "Primary Wing" });
    expect(own.status).toBe(409);
    expect(own.body.code).toBe("DEPARTMENT_INACTIVE");
  });

  it("takes no new class while inactive: not made in it, not moved into it", async () => {
    const { token } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const loose = (await post(token, "/classes", { name: "Class 9", sectionCount: 0 })).body.data;
    await post(token, `/departments/${dept.id}/deactivate`);

    const made = await post(token, "/classes", { name: "Class 1", departmentId: dept.id, sectionCount: 0 });
    expect(made.status).toBe(409);
    expect(made.body.code).toBe("DEPARTMENT_INACTIVE");
    expect((await patch(token, `/classes/${loose.id}`, { departmentId: dept.id })).body.code).toBe("DEPARTMENT_INACTIVE");
    expect((await post(token, `/departments/${dept.id}/classes`, { classIds: [loose.id] })).body.code).toBe("DEPARTMENT_INACTIVE");
    expect((await post(token, "/departments/assign", { name: "primary", classIds: [loose.id] })).body.code).toBe("DEPARTMENT_INACTIVE");
    expect((await get(token, `/classes/${loose.id}`)).body.data.departmentId).toBeNull();
  });

  it("is refused by another school", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    const dept = (await post(a.token, "/departments", { name: "Primary" })).body.data;
    expect((await post(b.token, `/departments/${dept.id}/deactivate`)).status).toBe(404);
    expect((await post(b.token, `/departments/${dept.id}/reactivate`)).status).toBe(404);
  });
});
