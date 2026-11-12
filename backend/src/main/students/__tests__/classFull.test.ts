import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { createSchool } from "../../../test/schools";
import { Tenant } from "../../tenants/models/Tenant";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { Enrolment } from "../models/Enrolment";
import { Student } from "../models/Student";

/**
 * A class that has no sections holds its students itself, so its own seats are the limit. A full class does not take another student
 * silently: it says so, and the person can raise its seats (and admit) or make sections. A section's seats work the same way.
 */

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

async function school() {
  const s = await createSchool("Sunrise Public School");
  await Tenant.updateOne({ _id: s.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  return s;
}

/** A class with its seats; `null` is a class made in bulk (or before seats existed), which the API cannot make: it has no seats set. */
const makeClass = async (s: { token: string; tenantId: string }, name: string, capacity: number | null) => {
  if (capacity === null) {
    return (await SchoolClass.create({ tenantId: s.tenantId, name, nameKey: name.toLowerCase(), order: 1 }))._id.toString();
  }
  return (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name, capacity, sectionCount: 0 })).body.data.id as string;
};
const makeSection = async (token: string, classId: string, name: string, capacity: number) =>
  (await request(app).post(`${academics}/classes/${classId}/sections`).set(auth(token)).send({ name, capacity })).body.data.id as string;

let counter = 0;
const body = (classId: string, sectionId: string | null, over: Record<string, unknown> = {}) => {
  counter += 1;
  return {
    firstName: "Asha",
    lastName: `Verma ${counter}`,
    gender: "Female",
    dateOfBirth: "2018-05-14",
    address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
    previousSchool: { name: "Little Flower School" },
    classId,
    sectionId,
    guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: `90000${String(counter).padStart(5, "0")}` }],
    ...over,
  };
};
const admit = (token: string, classId: string, sectionId: string | null = null, over: Record<string, unknown> = {}) =>
  request(app).post(api).set(auth(token)).send(body(classId, sectionId, over));
const seatsOfClass = async (tenantId: string, id: string) => (await SchoolClass.findOne({ _id: id, tenantId }).select("capacity").lean())?.capacity;
const seatsOfSection = async (tenantId: string, id: string) => (await Section.findOne({ _id: id, tenantId }).select("capacity").lean())?.capacity;
const sitting = (tenantId: string, classId: string) => Enrolment.countDocuments({ tenantId, classId, status: "active" });

describe("a class with no sections is held to its own seats", () => {
  it("takes students up to its seats, then refuses the next one with the numbers, and nobody is admitted by the refusal", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 2);
    expect((await admit(s.token, one)).status).toBe(201);
    expect((await admit(s.token, one)).status).toBe(201);

    const full = await admit(s.token, one);
    expect(full.status).toBe(409);
    expect(full.body.code).toBe("CLASS_FULL");
    expect(full.body.message).toBe("Class 1 is full: 2 of 2 seats are taken.");
    expect(full.body.details[0]).toMatchObject({ path: "classId", capacity: 2, enrolled: 2, seatsLeft: 0, classId: one, sectionId: null });
    expect(await sitting(s.tenantId, one)).toBe(2);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("a student who left makes room again", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 1);
    const first = (await admit(s.token, one)).body.data;
    expect((await admit(s.token, one)).body.code).toBe("CLASS_FULL");
    await request(app).post(`${api}/deactivate`).set(auth(s.token)).send({ ids: [first.id] });
    expect((await admit(s.token, one)).status).toBe(201);
  });

  it("a class whose seats are not set has no limit", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", null);
    expect(await seatsOfClass(s.tenantId, one)).toBeNull();
    for (let i = 0; i < 3; i += 1) expect((await admit(s.token, one)).status).toBe(201);
  });

  it("admits anyway when the person says so, and the seats stay as they were", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 1);
    await admit(s.token, one);
    expect((await admit(s.token, one, null, { allowOverCapacity: true })).status).toBe(201);
    expect(await seatsOfClass(s.tenantId, one)).toBe(1);
    expect(await sitting(s.tenantId, one)).toBe(2);
  });

  it("raises the seats and admits, when the person says to raise them to a number", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 2);
    await admit(s.token, one);
    await admit(s.token, one);

    const raised = await admit(s.token, one, null, { raiseSeatsTo: 5 });
    expect(raised.status).toBe(201);
    expect(await seatsOfClass(s.tenantId, one)).toBe(5);
    expect(await sitting(s.tenantId, one)).toBe(3);
    // The class has its room now: the next ones need no question.
    expect((await admit(s.token, one)).status).toBe(201);
  });

  it("will not raise the seats to a number that leaves no room, and changes nothing", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 2);
    await admit(s.token, one);
    await admit(s.token, one);
    for (const raiseSeatsTo of [2, 1]) {
      const res = await admit(s.token, one, null, { raiseSeatsTo });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("SEATS_TOO_FEW");
      expect(res.body.details[0]).toMatchObject({ path: "raiseSeatsTo", message: "At least 3 seats" });
    }
    expect((await admit(s.token, one, null, { raiseSeatsTo: 0 })).status).toBe(400);
    expect((await admit(s.token, one, null, { raiseSeatsTo: 2001 })).status).toBe(400);
    expect(await seatsOfClass(s.tenantId, one)).toBe(2);
    expect(await sitting(s.tenantId, one)).toBe(2);
  });

  it("does not raise or lower the seats of a class that still has room, even when told a number", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 10);
    expect((await admit(s.token, one, null, { raiseSeatsTo: 50 })).status).toBe(201);
    expect(await seatsOfClass(s.tenantId, one)).toBe(10);
  });

  it("puts the seats back when the admission fails after they were raised (a duplicate child is refused before anything changes)", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 1);
    const first = body(one, null);
    expect((await request(app).post(api).set(auth(s.token)).send(first)).status).toBe(201);
    // The same child again, while the class is full and the person asked to raise the seats: the duplicate is refused first.
    const again = await request(app).post(api).set(auth(s.token)).send({ ...first, raiseSeatsTo: 9 });
    expect(again.status).toBe(409);
    expect(again.body.code).not.toBe("CLASS_FULL");
    expect(await seatsOfClass(s.tenantId, one)).toBe(1);
  });

  it("two admissions into the last seat at the same moment: one gets it, the other is told the class is full", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 1);
    const [a, b] = await Promise.all([admit(s.token, one), admit(s.token, one)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await sitting(s.tenantId, one)).toBe(1);
  });
});

describe("moving a student into a full class", () => {
  it("is refused like an admission, and works when the person raises the seats", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 1);
    const two = await makeClass(s, "Class 2", 5);
    await admit(s.token, one);
    const kid = (await admit(s.token, two)).body.data;

    const refused = await request(app).patch(`${api}/${kid.id}/enrolment`).set(auth(s.token)).send({ classId: one, sectionId: null });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CLASS_FULL");
    expect(await sitting(s.tenantId, one)).toBe(1);

    const raised = await request(app).patch(`${api}/${kid.id}/enrolment`).set(auth(s.token)).send({ classId: one, sectionId: null, raiseSeatsTo: 2 });
    expect(raised.status).toBe(200);
    expect(await seatsOfClass(s.tenantId, one)).toBe(2);
    expect(await sitting(s.tenantId, one)).toBe(2);
  });
});

describe("a section's seats are raised the same way", () => {
  it("raises the section, and the class too when its sections no longer fit in it", async () => {
    const s = await school();
    const six = (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: "Class 6", capacity: 3, sectionCount: 0 })).body.data.id as string;
    const a = await makeSection(s.token, six, "A", 2);
    const b = await makeSection(s.token, six, "B", 1);
    await admit(s.token, six, a);
    await admit(s.token, six, a);
    expect((await admit(s.token, six, a)).body.code).toBe("SECTION_FULL");

    const raised = await admit(s.token, six, a, { raiseSeatsTo: 3 });
    expect(raised.status).toBe(201);
    expect(await seatsOfSection(s.tenantId, a)).toBe(3);
    expect(await seatsOfSection(s.tenantId, b)).toBe(1);
    // A (3) + B (1) = 4 no longer fit in the class's 3.
    expect(await seatsOfClass(s.tenantId, six)).toBe(4);
  });

  it("a section can have up to 200 seats", async () => {
    const s = await school();
    const six = (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: "Class 6", capacity: 2000, sectionCount: 0 })).body.data.id as string;
    const a = await makeSection(s.token, six, "A", 1);
    await admit(s.token, six, a);
    const res = await admit(s.token, six, a, { raiseSeatsTo: 201 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SEATS_TOO_MANY");
    expect(await seatsOfSection(s.tenantId, a)).toBe(1);
    expect(await sitting(s.tenantId, six)).toBe(1);
  });
});

describe("bringing students in from a file", () => {
  it("raises the seats of a class with no sections to hold everyone who was admitted, and says so", async () => {
    const s = await school();
    const one = await makeClass(s, "Class 1", 2);
    const rows = [1, 2, 3, 4].map((n) => ({ row: n + 1, student: body(one, null) }));
    const res = await request(app).post(`${api}/import`).set(auth(s.token)).send({ dryRun: false, allowOverCapacity: true, rows });
    expect(res.body.data).toMatchObject({ ok: 4, failed: 0 });
    expect(res.body.data.seatsRaised).toEqual([
      { classId: one, className: "Class 1", sectionId: null, sectionName: null, from: 2, to: 4, classFrom: null, classTo: null },
    ]);
    expect(await seatsOfClass(s.tenantId, one)).toBe(4);
  });
});
