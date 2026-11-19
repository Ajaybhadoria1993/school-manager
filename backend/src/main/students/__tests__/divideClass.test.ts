import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Tenant } from "../../tenants/models/Tenant";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { splitEvenly } from "../../academics/services/divide.service";
import { Enrolment } from "../models/Enrolment";
import { EnrolmentChange } from "../models/EnrolmentChange";

/**
 * "Make sections": a class that has no sections, with students sitting in the class itself, is divided into sections and the students
 * are shared out between them, so nobody is left in a class that now has sections.
 */

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

async function school(roomsRequired = false) {
  const s = await createSchool("Sunrise Public School");
  await Tenant.updateOne({ _id: s.tenantId }, { $set: { "settings.sectionDetailsRequired": roomsRequired } });
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  return s;
}

const makeClass = async (token: string, name: string, capacity: number) =>
  (await request(app).post(`${academics}/classes`).set(auth(token)).send({ name, capacity, sectionCount: 0 })).body.data.id as string;

let counter = 0;
const admit = (token: string, classId: string, first: string, over: Record<string, unknown> = {}) => {
  counter += 1;
  return request(app)
    .post(api)
    .set(auth(token))
    .send({
      firstName: first,
      lastName: "Verma",
      gender: "Female",
      dateOfBirth: "2018-05-14",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      previousSchool: { name: "Little Flower School" },
      classId,
      sectionId: null,
      guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: `91000${String(counter).padStart(5, "0")}` }],
      ...over,
    });
};
const divide = (token: string, classId: string, body: object) => request(app).post(`${academics}/classes/${classId}/divide`).set(auth(token)).send(body);

describe("sharing students out", () => {
  it("is even, and the first sections take the extra student", () => {
    expect(splitEvenly(41, 2)).toEqual([21, 20]);
    expect(splitEvenly(40, 2)).toEqual([20, 20]);
    expect(splitEvenly(7, 3)).toEqual([3, 2, 2]);
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
    expect(splitEvenly(2, 4)).toEqual([1, 1, 0, 0]);
  });
});

describe("dividing a class into sections", () => {
  async function fullClass() {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 5);
    // Names out of order on purpose: they are shared out by name.
    for (const name of ["Dev", "Anil", "Chitra", "Bela", "Esha"]) expect((await admit(s.token, one, name)).status).toBe(201);
    return { ...s, one };
  }

  it("makes the sections and shares the students out by name, and the answer says where each went", async () => {
    const s = await fullClass();
    const res = await divide(s.token, s.one, { count: 2, capacity: 4 });
    expect(res.status).toBe(201);
    expect(res.body.data.moved).toBe(5);
    expect(res.body.data.sections.map((x: { name: string; capacity: number; students: number }) => [x.name, x.capacity, x.students])).toEqual([
      ["A", 4, 3],
      ["B", 4, 2],
    ]);
    expect(res.body.data.class.sections.map((x: { name: string }) => x.name)).toEqual(["A", "B"]);

    const a = res.body.data.sections[0].id as string;
    const b = res.body.data.sections[1].id as string;
    const inSection = async (id: string) =>
      (await Enrolment.find({ tenantId: s.tenantId, sectionId: id }).lean()).length;
    expect(await inSection(a)).toBe(3);
    expect(await inSection(b)).toBe(2);
    // Nobody is left in the class itself.
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, classId: s.one, sectionId: null, status: "active" })).toBe(0);
    // Anil, Bela, Chitra (A to C) went to A; Dev and Esha to B.
    const list = (await request(app).get(`${api}?sectionId=${a}&limit=50`).set(auth(s.token))).body.data.items.map((x: { firstName: string }) => x.firstName).sort();
    expect(list).toEqual(["Anil", "Bela", "Chitra"]);
  });

  it("keeps a record of every student it moved, saying who and why", async () => {
    const s = await fullClass();
    await divide(s.token, s.one, { count: 2, capacity: 4 });
    const changes = await EnrolmentChange.find({ tenantId: s.tenantId }).lean();
    expect(changes).toHaveLength(5);
    expect(changes[0]).toMatchObject({ kind: "moved", reason: "Class divided into sections", from: { sectionId: null, className: "Class 1" } });
    expect(changes[0].by.role).toBe("school_admin");
    expect(changes[0].to?.sectionName).toMatch(/^[AB]$/);
  });

  it("raises the class's seats when the new sections hold more than it had, and the class then has room for the next student", async () => {
    const s = await fullClass();
    const res = await divide(s.token, s.one, { count: 2, capacity: 25 });
    expect(res.body.data.classSeats).toEqual({ from: 5, to: 50 });
    expect((await SchoolClass.findOne({ _id: s.one, tenantId: s.tenantId }).lean())?.capacity).toBe(50);
    // The sixth student can now go to a section.
    const a = res.body.data.sections[1].id as string;
    expect((await admit(s.token, s.one, "Farida", { sectionId: a })).status).toBe(201);
  });

  it("keeps the class's seats when they are enough already", async () => {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 100);
    await admit(s.token, one, "Anil");
    const res = await divide(s.token, one, { count: 2, capacity: 20 });
    expect(res.body.data.classSeats).toEqual({ from: 100, to: 100 });
  });

  it("works for a class nobody has joined yet", async () => {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 40);
    const res = await divide(s.token, one, { count: 3, capacity: 10 });
    expect(res.status).toBe(201);
    expect(res.body.data.moved).toBe(0);
    expect(res.body.data.sections.map((x: { students: number }) => x.students)).toEqual([0, 0, 0]);
  });

  it("leaves students who left where they were, in no section", async () => {
    const s = await fullClass();
    const left = (await admit(s.token, s.one, "Zoya", { allowOverCapacity: true })).body.data;
    await request(app).post(`${api}/deactivate`).set(auth(s.token)).send({ ids: [left.id] });
    await divide(s.token, s.one, { count: 2, capacity: 4 });
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, classId: s.one, sectionId: null, status: "inactive" })).toBe(1);
  });

  it("is refused when the seats are too few for the biggest section, and nothing is made or moved", async () => {
    const s = await fullClass();
    const res = await divide(s.token, s.one, { count: 2, capacity: 2 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SECTION_SEATS_TOO_FEW");
    expect(res.body.details[0]).toMatchObject({ path: "capacity", message: "At least 3 seats" });
    expect(await Section.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, classId: s.one, sectionId: null })).toBe(5);
  });

  it("is refused for a class that already has sections", async () => {
    const s = await fullClass();
    expect((await divide(s.token, s.one, { count: 2, capacity: 4 })).status).toBe(201);
    const again = await divide(s.token, s.one, { count: 2, capacity: 4 });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CLASS_ALREADY_SPLIT");
    expect(await Section.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("asks for the rooms when the school needs them, naming the box", async () => {
    const s = await school(true);
    const one = await makeClass(s.token, "Class 1", 40);
    const res = await divide(s.token, one, { count: 2, capacity: 20, rooms: ["Room 1"] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SECTION_DETAILS_REQUIRED");
    expect(res.body.details).toEqual([{ path: "rooms.1", message: "Enter the room" }]);
    expect((await divide(s.token, one, { count: 2, capacity: 20, rooms: ["Room 1", "Room 2"] })).status).toBe(201);
  });

  it("refuses a count that is not 2 to 10, and seats that are not a whole number of 1 to 200", async () => {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 40);
    for (const body of [{ count: 1, capacity: 20 }, { count: 11, capacity: 20 }, { count: 2.5, capacity: 20 }, { count: 2 }, { count: 2, capacity: 0 }, { count: 2, capacity: 201 }, { count: 2, capacity: 1.5 }]) {
      expect((await divide(s.token, one, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await Section.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("is refused for an inactive class", async () => {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 40);
    await request(app).post(`${academics}/classes/${one}/deactivate`).set(auth(s.token));
    const res = await divide(s.token, one, { count: 2, capacity: 20 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CLASS_INACTIVE");
  });

  it("follows the school's Permissions, and another school's class is a 404", async () => {
    const s = await school();
    const other = await createSchool("Moonrise Public School");
    const one = await makeClass(s.token, "Class 1", 40);
    const teacher = await addColleague(s.tenantId, "teacher");
    expect((await divide(teacher, one, { count: 2, capacity: 20 })).status).toBe(403);
    expect((await divide(other.token, one, { count: 2, capacity: 20 })).status).toBe(404);
    expect(await Section.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });
});
