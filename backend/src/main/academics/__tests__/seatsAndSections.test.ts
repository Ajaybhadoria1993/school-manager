import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { createSchool } from "../../../test/schools";
import { Tenant } from "../../tenants/models/Tenant";
import { Enrolment } from "../../students/models/Enrolment";
import { Section } from "../models/Section";
import { SchoolClass } from "../models/SchoolClass";

/**
 * Two ways a class's students could be left in a wrong place by the Classes & Sections screen, with real students:
 *   - a section added by hand to a class that has students sitting in the class itself would leave them in no section;
 *   - seats set below the students already in the class (or section) would put it over its own limit.
 */

const api = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);

beforeEach(async () => {
  await seedSuperAdmin();
});

async function school() {
  const s = await createSchool("Sunrise Public School");
  await Tenant.updateOne({ _id: s.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
  await post(s.token, "/academic-years/initial", YEAR);
  return s;
}
const makeClass = async (token: string, name: string, capacity: number, sectionCount = 0) =>
  (await post(token, "/classes", { name, capacity, sectionCount })).body.data as { id: string; sections: { id: string }[] };

let counter = 0;
const admit = (token: string, classId: string, sectionId: string | null = null, over: Record<string, unknown> = {}) => {
  counter += 1;
  return request(app)
    .post("/api/v1/students")
    .set(auth(token))
    .send({
      firstName: "Asha",
      lastName: `Verma ${counter}`,
      gender: "Female",
      dateOfBirth: "2018-05-14",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      previousSchool: { name: "Little Flower School" },
      classId,
      sectionId,
      guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: `92000${String(counter).padStart(5, "0")}` }],
      ...over,
    });
};

describe("a first section is not added by hand to a class that has students in the class itself", () => {
  it("is refused with how many there are, and says to divide the class instead; nothing is made", async () => {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 100);
    for (let i = 0; i < 3; i += 1) expect((await admit(s.token, one.id)).status).toBe(201);

    const res = await post(s.token, `/classes/${one.id}/sections`, { name: "A", capacity: 40 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CLASS_HAS_UNSECTIONED_STUDENTS");
    expect(res.body.message).toContain("3 students");
    expect(res.body.message).toContain("Divide");
    expect(res.body.details).toEqual([{ path: "classId", message: expect.any(String), enrolled: 3 }]);
    expect(await Section.countDocuments({ tenantId: s.tenantId, classId: one.id })).toBe(0);
  });

  it("is allowed for a class nobody sits in, and for a class whose students all left", async () => {
    const s = await school();
    const empty = await makeClass(s.token, "Class 1", 100);
    expect((await post(s.token, `/classes/${empty.id}/sections`, { name: "A", capacity: 40 })).status).toBe(201);

    const left = await makeClass(s.token, "Class 2", 100);
    const kid = (await admit(s.token, left.id)).body.data;
    await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [kid.id] });
    expect((await post(s.token, `/classes/${left.id}/sections`, { name: "A", capacity: 40 })).status).toBe(201);
  });

  it("is allowed once the class has sections: the next section is just another section", async () => {
    const s = await school();
    const five = await makeClass(s.token, "Class 5", 100, 1);
    expect((await post(s.token, `/classes/${five.id}/sections`, { name: "B", capacity: 40 })).status).toBe(201);
  });

  it("dividing the class is the way: the students are in sections afterwards, and a next section can be added by hand", async () => {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 100);
    for (let i = 0; i < 4; i += 1) await admit(s.token, one.id);
    expect((await post(s.token, `/classes/${one.id}/divide`, { count: 2, capacity: 30 })).status).toBe(201);
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, classId: one.id, sectionId: null, status: "active" })).toBe(0);
    expect((await post(s.token, `/classes/${one.id}/sections`, { name: "C", capacity: 10 })).status).toBe(201);
  });
});

describe("seats cannot be set below the students in the place", () => {
  it("a class with no sections cannot have fewer seats than students; the same number, or more, is fine", async () => {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 10);
    for (let i = 0; i < 4; i += 1) await admit(s.token, one.id);

    const below = await patch(s.token, `/classes/${one.id}`, { capacity: 3 });
    expect(below.status).toBe(400);
    expect(below.body.code).toBe("CLASS_SEATS_BELOW_STUDENTS");
    expect(below.body.details).toEqual([{ path: "capacity", message: "At least 4 seats, as 4 students are in it" }]);
    expect((await SchoolClass.findOne({ _id: one.id, tenantId: s.tenantId }).lean())?.capacity).toBe(10);

    expect((await patch(s.token, `/classes/${one.id}`, { capacity: 4 })).status).toBe(200);
    expect((await patch(s.token, `/classes/${one.id}`, { capacity: 50 })).status).toBe(200);
  });

  it("students who left do not count", async () => {
    const s = await school();
    const one = await makeClass(s.token, "Class 1", 10);
    const kids = [(await admit(s.token, one.id)).body.data, (await admit(s.token, one.id)).body.data];
    await request(app).post("/api/v1/students/deactivate").set(auth(s.token)).send({ ids: [kids[0].id] });
    expect((await patch(s.token, `/classes/${one.id}`, { capacity: 1 })).status).toBe(200);
  });

  it("a section cannot have fewer seats than its students, and the message names how many", async () => {
    const s = await school();
    const five = await makeClass(s.token, "Class 5", 100, 1);
    const a = five.sections[0].id;
    await patch(s.token, `/sections/${a}`, { capacity: 10 });
    for (let i = 0; i < 5; i += 1) expect((await admit(s.token, five.id, a)).status).toBe(201);

    const below = await patch(s.token, `/sections/${a}`, { capacity: 4 });
    expect(below.status).toBe(400);
    expect(below.body.code).toBe("SECTION_SEATS_BELOW_STUDENTS");
    expect(below.body.details).toEqual([{ path: "capacity", message: "At least 5 seats, as 5 students are in it" }]);
    expect((await Section.findOne({ _id: a, tenantId: s.tenantId }).lean())?.capacity).toBe(10);
    expect((await patch(s.token, `/sections/${a}`, { capacity: 5 })).status).toBe(200);
  });

  it("a section that is already over its seats (admitted anyway) can still change its room, and its seats only to enough", async () => {
    const s = await school();
    const five = await makeClass(s.token, "Class 5", 100, 1);
    const a = five.sections[0].id;
    await patch(s.token, `/sections/${a}`, { capacity: 1 });
    await admit(s.token, five.id, a);
    await admit(s.token, five.id, a, { allowOverCapacity: true });
    expect((await patch(s.token, `/sections/${a}`, { room: "Room 9" })).status).toBe(200);
    expect((await patch(s.token, `/sections/${a}`, { capacity: 1 })).status).toBe(400);
    expect((await patch(s.token, `/sections/${a}`, { capacity: 2 })).status).toBe(200);
  });

  it("a section's seats are counted by the students in that section only", async () => {
    const s = await school();
    const five = await makeClass(s.token, "Class 5", 100, 2);
    const [a, b] = five.sections.map((x) => x.id);
    await patch(s.token, `/sections/${a}`, { capacity: 10 });
    await patch(s.token, `/sections/${b}`, { capacity: 10 });
    for (let i = 0; i < 6; i += 1) await admit(s.token, five.id, a);
    expect((await patch(s.token, `/sections/${b}`, { capacity: 1 })).status).toBe(200);
  });
});
