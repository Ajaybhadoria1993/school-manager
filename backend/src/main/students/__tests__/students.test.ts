import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { User } from "../../users/models/User";
import { Section } from "../../academics/models/Section";
import { AdmissionCounter } from "../models/AdmissionCounter";
import { Enrolment } from "../models/Enrolment";
import { Guardian } from "../models/Guardian";
import { Student } from "../models/Student";
import { todayInIndia } from "../schemas/students.schemas";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

/** An approved school with its current academic year (2026-2027). */
async function schoolWithYear(name = "Sunrise Public School") {
  const s = await createSchool(name);
  const year = (await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR)).body.data;
  return { ...s, yearId: year.id as string };
}

/** A class with these sections (seats and room are required by default, so every section has both). */
async function addClass(token: string, name: string, sections: { name: string; capacity: number }[] = []) {
  const klass = (await request(app).post(`${academics}/classes`).set(auth(token)).send({ name, sectionCount: 0 })).body.data;
  const made: { id: string; name: string }[] = [];
  for (const s of sections) {
    made.push((await request(app).post(`${academics}/classes/${klass.id}/sections`).set(auth(token)).send({ ...s, room: `Room ${s.name}` })).body.data);
  }
  return { id: klass.id as string, sections: made };
}

/** A school ready for admissions: its year, Class 5 with A (40 seats) and B (2 seats), and Class 1 with no sections. */
async function ready(name?: string) {
  const s = await schoolWithYear(name);
  const class5 = await addClass(s.token, "Class 5", [
    { name: "A", capacity: 40 },
    { name: "B", capacity: 2 },
  ]);
  const class1 = await addClass(s.token, "Class 1");
  return { ...s, class5, class1, a: class5.sections[0].id, b: class5.sections[1].id };
}

type Body = Record<string, unknown>;

/** A complete, valid admission into Class 5 - A; `over` replaces whole keys. */
const admission = (classId: string, sectionId: string | null, over: Body = {}): Body => ({
  firstName: "Asha",
  lastName: "Verma",
  gender: "Female",
  dateOfBirth: "2016-05-14",
  admissionDate: "2026-06-01",
  address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  // Needed from Class 1 to 12 (an admission into Nursery may leave it out).
  previousSchool: { name: "Little Flower School" },
  classId,
  sectionId,
  guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
  ...over,
});

const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const names = (res: request.Response) => res.body.data.items.map((i: { name: string }) => i.name);

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("who may use it", () => {
  it("needs a signed-in user, and is not for the platform owner", async () => {
    expect((await request(app).get(api)).status).toBe(401);
    const login = await request(app).post("/api/v1/auth/login").send({ email: "superadmin@example.com", password: "Admin@123" });
    expect((await get(login.body.data.accessToken, "")).status).toBe(403);
  });

  it("lets the school admin and the principal admit; the accountant only reads; teachers and parents get nothing", async () => {
    const s = await ready();
    const principal = await addColleague(s.tenantId, "principal");
    const accountant = await addColleague(s.tenantId, "accountant");
    const teacher = await addColleague(s.tenantId, "teacher");
    const parent = await addColleague(s.tenantId, "parent");

    const admitted = await post(principal, "", admission(s.class5.id, s.a));
    expect(admitted.status).toBe(201);
    const id = admitted.body.data.id;

    for (const token of [accountant, teacher, parent]) {
      expect((await post(token, "", admission(s.class5.id, s.a, { firstName: "Other" }))).status).toBe(403);
      expect((await patch(token, `/${id}`, { firstName: "Hacked" })).status).toBe(403);
      expect((await patch(token, `/${id}/enrolment`, { sectionId: s.b })).status).toBe(403);
      expect((await post(token, "/guardians/lookup", { mobile: "9876543210" })).status).toBe(403);
    }
    expect((await get(accountant, "")).status).toBe(200);
    expect((await get(accountant, `/${id}`)).status).toBe(200);
    expect((await get(accountant, "/capacity")).status).toBe(200);
    for (const token of [teacher, parent]) {
      expect((await get(token, "")).status).toBe(403);
      expect((await get(token, `/${id}`)).status).toBe(403);
    }
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });
});

describe("admitting a student", () => {
  it("makes the student, the guardian and this year's enrolment in one request", async () => {
    const s = await ready();
    const users = await User.countDocuments();
    const res = await post(
      s.token,
      "",
      admission(s.class5.id, s.a, {
        firstName: "  asha   rani ",
        rollNumber: 7,
        bloodGroup: "B+",
        category: "OBC",
        guardians: [{ name: "Ravi  Verma", relation: "Father", isPrimary: true, mobile: "+91 98765 43210", email: "Ravi@Example.com" }],
      })
    );
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("asha rani Verma admitted (ADM-2026-0001)");
    expect(res.body.data).toMatchObject({
      firstName: "asha rani",
      lastName: "Verma",
      name: "asha rani Verma",
      gender: "Female",
      dateOfBirth: "2016-05-14",
      admissionDate: "2026-06-01",
      admissionNumber: "ADM-2026-0001",
      status: "active",
      bloodGroup: "B+",
      category: "OBC",
      previousSchool: { name: "Little Flower School", lastClass: null, tcNumber: null, tcDate: null },
      address: { line1: "12 MG Road", line2: null, city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      place: { className: "Class 5", sectionName: "A", sectionId: s.a, rollNumber: 7 },
      guardians: [
        { name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210", mobileVerified: false, email: "ravi@example.com" },
      ],
      siblings: [],
    });
    expect(res.body.data.enrolments).toEqual([
      expect.objectContaining({ academicYear: { id: s.yearId, name: "2026-2027", status: "active" }, className: "Class 5", sectionName: "A", current: true }),
    ]);

    const enrolment = await Enrolment.findOne({ tenantId: s.tenantId }).lean();
    expect(String(enrolment?.academicYearId)).toBe(s.yearId);
    const guardian = await Guardian.findOne({ tenantId: s.tenantId }).lean();
    expect(guardian).toMatchObject({ mobile: "9876543210", mobileVerifiedAt: null });
    // No login is made for the parent (that comes with the parent app, by mobile number).
    expect(await User.countDocuments()).toBe(users);
  });

  it("uses today as the admission date when none is given, and puts a student of a class without sections in the class", async () => {
    const s = await ready();
    const res = await post(s.token, "", admission(s.class1.id, null, { admissionDate: undefined, dateOfBirth: "2020-01-01" }));
    expect(res.status).toBe(201);
    expect(res.body.data.admissionDate).toBe(todayInIndia());
    expect(res.body.data.place).toMatchObject({ className: "Class 1", sectionId: null, sectionName: null });
  });

  it("keeps the previous school only when its name is given", async () => {
    const s = await ready();
    const res = await post(
      s.token,
      "",
      admission(s.class5.id, s.a, { previousSchool: { name: "Little Flower School", lastClass: "Class 4", tcNumber: "TC/12", tcDate: "2026-03-30" } })
    );
    expect(res.body.data.previousSchool).toEqual({ name: "Little Flower School", lastClass: "Class 4", tcNumber: "TC/12", tcDate: "2026-03-30" });

    // A child of Nursery has no previous school to give (it is needed from Class 1): nothing is kept.
    const nursery = await addClass(s.token, "Nursery");
    const empty = await post(
      s.token,
      "",
      admission(nursery.id, null, {
        firstName: "Bina",
        previousSchool: { name: "", lastClass: "" },
        guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }],
      })
    );
    expect(empty.status, JSON.stringify(empty.body)).toBe(201);
    expect(empty.body.data.previousSchool).toBeNull();
  });

  it("checks every box and says what is wrong with each, without making anything", async () => {
    const s = await ready();
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const cases: [Body, string, string][] = [
      [{ firstName: "" }, "firstName", "Enter the first name"],
      [{ firstName: "A" }, "firstName", "The first name must be 2 to 50 characters"],
      [{ firstName: "x".repeat(51) }, "firstName", "The first name must be 2 to 50 characters"],
      [{ firstName: "<b>Asha" }, "firstName", "The first name cannot contain < or >"],
      [{ lastName: undefined }, "lastName", "Enter the last name"],
      [{ gender: "Boy" }, "gender", "Choose the gender"],
      [{ dateOfBirth: "" }, "dateOfBirth", "Choose the date of birth"],
      [{ dateOfBirth: "2016-02-30" }, "dateOfBirth", "Choose a valid date of birth"],
      [{ dateOfBirth: "14/05/2016" }, "dateOfBirth", "Choose a valid date of birth"],
      [{ dateOfBirth: tomorrow }, "dateOfBirth", "The date of birth cannot be in the future"],
      [{ dateOfBirth: "2025-01-01" }, "dateOfBirth", "The student must be 2 to 25 years old on the admission date"],
      [{ dateOfBirth: "1990-01-01" }, "dateOfBirth", "The student must be 2 to 25 years old on the admission date"],
      [{ admissionDate: tomorrow }, "admissionDate", "The admission date cannot be in the future"],
      [{ address: undefined }, "address.line1", "Enter the street address"],
      [{ address: undefined }, "address.pincode", "PIN code is 6 digits"],
      [{ address: { line1: "ab", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" } }, "address.line1", "Enter the street address"],
      [{ address: { line1: "12 MG Road", city: "", state: "Madhya Pradesh", pincode: "462001" } }, "address.city", "Enter the city"],
      [{ address: { line1: "12 MG Road", city: "Bhopal", state: "Atlantis", pincode: "462001" } }, "address.state", "Choose the state"],
      [{ address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "4620" } }, "address.pincode", "PIN code is 6 digits"],
      [{ bloodGroup: "C+" }, "bloodGroup", "Choose a blood group from the list"],
      [{ category: "Rich" }, "category", "Choose a category from the list"],
      [{ previousSchool: { tcNumber: "TC/1" } }, "previousSchool.name", "Enter the previous school's name"],
      [{ previousSchool: { name: "Old School", tcDate: tomorrow } }, "previousSchool.tcDate", "The TC date cannot be in the future"],
      [{ classId: "" }, "classId", "Choose the class"],
      [{ rollNumber: 0 }, "rollNumber", "The roll number must be a whole number from 1 to 999"],
      [{ rollNumber: 2.5 }, "rollNumber", "The roll number must be a whole number from 1 to 999"],
      [{ guardians: [] }, "guardians", "Add at least one guardian"],
      [{ guardians: undefined }, "guardians", "Add at least one guardian"],
      [{ guardians: [{ name: "Ravi", relation: "Father", isPrimary: false, mobile: "9876543210" }] }, "guardians", "Choose one primary guardian"],
      [
        {
          guardians: [
            { name: "Ravi", relation: "Father", isPrimary: true, mobile: "9876543210" },
            { name: "Sita", relation: "Mother", isPrimary: true, mobile: "9876543211" },
          ],
        },
        "guardians",
        "Only one guardian can be the primary guardian",
      ],
      [{ guardians: [{ name: "Ravi", relation: "Father", isPrimary: true }] }, "guardians.0.mobile", "Enter the mobile number"],
      [{ guardians: [{ name: "Ravi", relation: "Father", isPrimary: true, mobile: "5876543210" }] }, "guardians.0.mobile", "Enter a 10-digit mobile number starting with 6, 7, 8 or 9"],
      [{ guardians: [{ name: "Ravi", relation: "Father", isPrimary: true, mobile: "98765" }] }, "guardians.0.mobile", "Enter a 10-digit mobile number starting with 6, 7, 8 or 9"],
      [{ guardians: [{ name: "", relation: "Father", isPrimary: true, mobile: "9876543210" }] }, "guardians.0.name", "Enter the guardian's name"],
      [{ guardians: [{ name: "Ravi", relation: "Uncle", isPrimary: true, mobile: "9876543210" }] }, "guardians.0.relation", "Choose the relation"],
      [
        { guardians: [{ name: "Ravi", relation: "Father", isPrimary: true, mobile: "9876543210", alternateMobile: "9876543210" }] },
        "guardians.0.alternateMobile",
        "The alternate number must differ from the mobile number",
      ],
      [{ guardians: [{ name: "Ravi", relation: "Father", isPrimary: true, mobile: "9876543210", email: "ravi@" }] }, "guardians.0.email", "Enter a valid email address"],
      [
        {
          guardians: [
            { name: "Ravi", relation: "Father", isPrimary: true, mobile: "9876543210" },
            { name: "Sita", relation: "Mother", isPrimary: false, mobile: "98765 43210" },
          ],
        },
        "guardians.1.mobile",
        "Two guardians cannot have the same mobile number",
      ],
      [
        { guardians: Array.from({ length: 5 }, (_, i) => ({ name: `Person ${i}`, relation: "Other", isPrimary: i === 0, mobile: `987654321${i}` })) },
        "guardians",
        "A student can have at most 4 guardians",
      ],
    ];
    for (const [over, path, message] of cases) {
      const res = await post(s.token, "", admission(s.class5.id, s.a, over));
      expect(res.status, `${JSON.stringify(over)}: ${JSON.stringify(res.body)}`).toBe(400);
      expect(details(res), JSON.stringify(over)).toContainEqual({ path, message });
    }
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect(await AdmissionCounter.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("gives a child one father and one mother at most; a second Father or Mother is refused, any number of Guardians and Others is fine", async () => {
    const s = await ready();
    const person = (name: string, relation: string, mobile: string, isPrimary = false) => ({ name, relation, isPrimary, mobile });

    const twoFathers = await post(s.token, "", admission(s.class5.id, s.a, { guardians: [person("Ravi Verma", "Father", "9876543210", true), person("Mohan Verma", "Father", "9876543211")] }));
    expect(twoFathers.status).toBe(400);
    expect(details(twoFathers)).toEqual([{ path: "guardians.1.relation", message: "A child has only one father: choose Guardian or Other for this one" }]);

    // The second one is named wherever it stands, and each of two mothers gets its own message.
    const twoMothers = await post(
      s.token,
      "",
      admission(s.class5.id, s.a, { guardians: [person("Sita Verma", "Mother", "9876543210", true), person("Ravi Verma", "Father", "9876543211"), person("Gita Verma", "Mother", "9876543212")] })
    );
    expect(details(twoMothers)).toEqual([{ path: "guardians.2.relation", message: "A child has only one mother: choose Guardian or Other for this one" }]);

    const both = await post(
      s.token,
      "",
      admission(s.class5.id, s.a, {
        guardians: [
          person("Ravi Verma", "Father", "9876543210", true),
          person("Mohan Verma", "Father", "9876543211"),
          person("Sita Verma", "Mother", "9876543212"),
          person("Gita Verma", "Mother", "9876543213"),
        ],
      })
    );
    expect(details(both).map((d) => d.path)).toEqual(["guardians.1.relation", "guardians.3.relation"]);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(0);

    // A real family: the father, the mother, an uncle as the guardian and a neighbour; nothing is refused.
    const family = await post(
      s.token,
      "",
      admission(s.class5.id, s.a, {
        guardians: [person("Ravi Verma", "Father", "9876543210", true), person("Sita Verma", "Mother", "9876543212"), person("Mohan Verma", "Guardian", "9876543211"), person("Anil Rao", "Other", "9876543214")],
      })
    );
    expect(family.status, JSON.stringify(family.body)).toBe(201);
    expect(family.body.data.guardians.map((g: { relation: string }) => g.relation).sort()).toEqual(["Father", "Guardian", "Mother", "Other"]);
  });

  it("gives five admissions at the same moment five different, consecutive admission numbers", async () => {
    const s = await ready();
    const answers = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post(
          s.token,
          "",
          admission(s.class5.id, s.a, {
            firstName: `Child ${String.fromCharCode(65 + i)}`,
            guardians: [{ name: `Parent ${i}`, relation: "Mother", isPrimary: true, mobile: `912345678${i}` }],
          })
        )
      )
    );
    expect(answers.map((a) => a.status)).toEqual([201, 201, 201, 201, 201]);
    expect(answers.map((a) => a.body.data.admissionNumber).sort()).toEqual([
      "ADM-2026-0001",
      "ADM-2026-0002",
      "ADM-2026-0003",
      "ADM-2026-0004",
      "ADM-2026-0005",
    ]);
    // The next one carries on from there, and the number can never be changed.
    const next = await post(s.token, "", admission(s.class5.id, s.a));
    expect(next.body.data.admissionNumber).toBe("ADM-2026-0006");
    expect((await patch(s.token, `/${next.body.data.id}`, { admissionNumber: "ADM-1" })).status).toBe(400);
  });
});

describe("guardians and brothers and sisters", () => {
  it("finds a parent by mobile number with their children, and finds nothing for a number the school does not have", async () => {
    const s = await ready();
    const first = (await post(s.token, "", admission(s.class5.id, s.a, { rollNumber: 3 }))).body.data;

    const found = await post(s.token, "/guardians/lookup", { mobile: "098765 43210" });
    expect(found.status).toBe(200);
    expect(found.body.data.guardian).toMatchObject({
      id: first.guardians[0].id,
      name: "Ravi Verma",
      mobile: "9876543210",
      children: [{ id: first.id, name: "Asha Verma", admissionNumber: "ADM-2026-0001", relation: "Father", className: "Class 5", sectionName: "A" }],
    });
    expect((await post(s.token, "/guardians/lookup", { mobile: "9000000000" })).body.data).toEqual({ guardian: null });

    const wrong = await post(s.token, "/guardians/lookup", { mobile: "12345" });
    expect(wrong.status).toBe(400);
    expect(details(wrong)).toEqual([{ path: "mobile", message: "Enter a 10-digit mobile number starting with 6, 7, 8 or 9" }]);
    expect(details(await post(s.token, "/guardians/lookup", {}))).toEqual([
      { path: "mobile", message: "Enter a 10-digit mobile number starting with 6, 7, 8 or 9" },
    ]);
    // A mobile number never goes in an address: there is no GET for it.
    expect((await get(s.token, "/guardians/lookup?mobile=9876543210")).status).not.toBe(200);
  });

  it("never copies a parent silently: a second child typed with the same mobile is stopped and shown the guardian", async () => {
    const s = await ready();
    await post(s.token, "", admission(s.class5.id, s.a));
    const res = await post(s.token, "", admission(s.class5.id, s.b, { firstName: "Kabir", dateOfBirth: "2019-08-01" }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("GUARDIAN_EXISTS");
    expect(details(res)[0]).toMatchObject({
      path: "guardians.0.mobile",
      guardian: { name: "Ravi Verma", children: [{ name: "Asha Verma", className: "Class 5", sectionName: "A" }] },
    });
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it("links the same guardian to a second child, as they are, and both children see each other", async () => {
    const s = await ready();
    const first = (await post(s.token, "", admission(s.class5.id, s.a))).body.data;
    const guardianId = first.guardians[0].id;

    const second = await post(
      s.token,
      "",
      admission(s.class1.id, null, {
        firstName: "Kabir",
        dateOfBirth: "2020-08-01",
        // "Use as is": the name typed here is not saved over the guardian's.
        guardians: [{ guardianId, name: "Somebody Else", relation: "Father", isPrimary: true, mobile: "9876543210" }],
      })
    );
    expect(second.status).toBe(201);
    expect(second.body.data.guardians[0]).toMatchObject({ id: guardianId, name: "Ravi Verma" });
    expect(second.body.data.siblings).toEqual([
      { id: first.id, name: "Asha Verma", admissionNumber: "ADM-2026-0001", className: "Class 5", sectionName: "A" },
    ]);
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(1);

    const firstAgain = (await get(s.token, `/${first.id}`)).body.data;
    expect(firstAgain.siblings).toEqual([
      { id: second.body.data.id, name: "Kabir Verma", admissionNumber: "ADM-2026-0002", className: "Class 1", sectionName: null },
    ]);
    const lookup = (await post(s.token, "/guardians/lookup", { mobile: "9876543210" })).body.data.guardian;
    expect(lookup.children.map((c: { name: string }) => c.name)).toEqual(["Asha Verma", "Kabir Verma"]);
  });

  it("updates a linked guardian's details only when asked to, and keeps the relation per child", async () => {
    const s = await ready();
    const first = (await post(s.token, "", admission(s.class5.id, s.a))).body.data;
    const guardianId = first.guardians[0].id;
    const second = await post(
      s.token,
      "",
      admission(s.class1.id, null, {
        firstName: "Kabir",
        dateOfBirth: "2020-08-01",
        guardians: [
          { guardianId, updateDetails: true, name: "Ravi Kumar Verma", relation: "Guardian", isPrimary: false, mobile: "9876543210", occupation: "Teacher" },
          { name: "Sita Verma", relation: "Mother", isPrimary: true, mobile: "9123456780" },
        ],
      })
    );
    expect(second.status).toBe(201);
    expect(second.body.data.guardians).toMatchObject([
      { name: "Sita Verma", relation: "Mother", isPrimary: true },
      { id: guardianId, name: "Ravi Kumar Verma", relation: "Guardian", isPrimary: false, occupation: "Teacher" },
    ]);
    // The first child still calls him Father and still has him as the primary guardian.
    expect((await get(s.token, `/${first.id}`)).body.data.guardians).toMatchObject([
      { id: guardianId, name: "Ravi Kumar Verma", relation: "Father", isPrimary: true },
    ]);
  });

  it("refuses a picked guardian with another mobile number, or one the school does not have", async () => {
    const s = await ready();
    const first = (await post(s.token, "", admission(s.class5.id, s.a))).body.data;
    const guardianId = first.guardians[0].id;
    const mismatch = await post(
      s.token,
      "",
      admission(s.class1.id, null, { firstName: "Kabir", guardians: [{ guardianId, name: "Ravi", relation: "Father", isPrimary: true, mobile: "9000000001" }] })
    );
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe("GUARDIAN_MOBILE_MISMATCH");

    const ghost = await post(
      s.token,
      "",
      admission(s.class1.id, null, {
        firstName: "Kabir",
        guardians: [{ guardianId: new Types.ObjectId().toString(), name: "Ravi", relation: "Father", isPrimary: true, mobile: "9000000001" }],
      })
    );
    expect(ghost.status).toBe(400);
    expect(details(ghost)).toEqual([{ path: "guardians.0.guardianId", message: "That guardian is not in your school any more. Type the mobile number again" }]);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it("takes a second guardian without a mobile number", async () => {
    const s = await ready();
    const res = await post(
      s.token,
      "",
      admission(s.class5.id, s.a, {
        guardians: [
          { name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" },
          { name: "Sita Verma", relation: "Mother", isPrimary: false },
        ],
      })
    );
    expect(res.status).toBe(201);
    expect(res.body.data.guardians).toMatchObject([{ name: "Ravi Verma" }, { name: "Sita Verma", mobile: null }]);
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("lets a guardian's own details be changed, for every child; a new mobile is not verified and must be free", async () => {
    const s = await ready();
    const first = (await post(s.token, "", admission(s.class5.id, s.a))).body.data;
    await post(s.token, "", admission(s.class5.id, s.b, { firstName: "Mira", guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }] }));
    const guardianId = first.guardians[0].id;
    await Guardian.updateOne({ _id: guardianId, tenantId: s.tenantId }, { $set: { mobileVerifiedAt: new Date() } });

    const changed = await patch(s.token, `/guardians/${guardianId}`, { name: "Ravi K. Verma", mobile: "9222222222", email: "" });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ name: "Ravi K. Verma", mobile: "9222222222", email: null, children: [{ name: "Asha Verma" }] });
    expect((await Guardian.findOne({ _id: guardianId, tenantId: s.tenantId }).lean())?.mobileVerifiedAt).toBeNull();

    const taken = await patch(s.token, `/guardians/${guardianId}`, { mobile: "9111111111" });
    expect(taken.status).toBe(409);
    expect(details(taken)).toEqual([{ path: "mobile", message: "Another guardian in your school has this mobile number" }]);
    expect((await patch(s.token, `/guardians/${guardianId}`, {})).status).toBe(400);
    expect((await patch(s.token, `/guardians/${new Types.ObjectId()}`, { name: "" })).status).toBe(404);
  });
});

describe("the class and section", () => {
  it("must be a section of that class, of this year; a class with sections needs one; a class without takes none", async () => {
    const s = await ready();
    const class6 = await addClass(s.token, "Class 6", [{ name: "A", capacity: 30 }]);

    const otherClass = await post(s.token, "", admission(s.class5.id, class6.sections[0].id));
    expect(otherClass.status).toBe(400);
    expect(otherClass.body.code).toBe("SECTION_NOT_FOUND");
    expect(details(otherClass)).toEqual([{ path: "sectionId", message: "Choose a section of Class 5" }]);

    const none = await post(s.token, "", admission(s.class5.id, null));
    expect(none.status).toBe(400);
    expect(details(none)).toEqual([{ path: "sectionId", message: "Choose the section" }]);

    const unsplit = await post(s.token, "", admission(s.class1.id, s.a));
    expect(unsplit.status).toBe(400);

    // Last year's section of Class 5 is not this year's.
    const old = await Section.create({ tenantId: s.tenantId, classId: s.class5.id, academicYearId: new Types.ObjectId(), name: "C", nameKey: "c", capacity: 30, room: "1" });
    const lastYear = await post(s.token, "", admission(s.class5.id, old._id.toString()));
    expect(lastYear.status).toBe(400);
    expect(lastYear.body.code).toBe("SECTION_NOT_FOUND");

    const ghost = await post(s.token, "", admission(new Types.ObjectId().toString(), null));
    expect(ghost.status).toBe(400);
    expect(ghost.body.code).toBe("CLASS_NOT_FOUND");
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("uses a roll number once in a section", async () => {
    const s = await ready();
    expect((await post(s.token, "", admission(s.class5.id, s.a, { rollNumber: 1 }))).status).toBe(201);
    const again = await post(
      s.token,
      "",
      admission(s.class5.id, s.a, { firstName: "Mira", rollNumber: 1, guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }] })
    );
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ROLL_NUMBER_TAKEN");
    expect(details(again)).toEqual([{ path: "rollNumber", message: "Roll number 1 is already used in Class 5 - A" }]);
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(1);

    const otherSection = await post(
      s.token,
      "",
      admission(s.class5.id, s.b, { firstName: "Mira", rollNumber: 1, guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }] })
    );
    expect(otherSection.status).toBe(201);
  });

  it("keeps one enrolment per student per academic year (the database refuses a second)", async () => {
    const s = await ready();
    const student = (await post(s.token, "", admission(s.class5.id, s.a))).body.data;
    await expect(
      Enrolment.create({ tenantId: s.tenantId, studentId: student.id, academicYearId: s.yearId, classId: s.class1.id, sectionId: null, enrolledAt: new Date() })
    ).rejects.toMatchObject({ code: 11000 });
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, studentId: student.id })).toBe(1);
  });
});

describe("seats", () => {
  const family = (i: number) => ({ guardians: [{ name: `Parent ${i}`, relation: "Mother", isPrimary: true, mobile: `90000000${String(i).padStart(2, "0")}` }] });

  it("refuses a full section with the numbers, unless the person says to admit anyway", async () => {
    const s = await ready();
    for (const i of [1, 2]) expect((await post(s.token, "", admission(s.class5.id, s.b, { firstName: `Kid ${i}`, ...family(i) }))).status).toBe(201);

    const full = await post(s.token, "", admission(s.class5.id, s.b, { firstName: "Kid Three", ...family(3) }));
    expect(full.status).toBe(409);
    expect(full.body.code).toBe("SECTION_FULL");
    expect(details(full)).toEqual([
      { path: "sectionId", message: "Class 5 - B is full (2 of 2 seats taken)", capacity: 2, enrolled: 2, seatsLeft: 0 },
    ]);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(2);
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(2);

    const anyway = await post(s.token, "", admission(s.class5.id, s.b, { firstName: "Kid Three", ...family(3), allowOverCapacity: true }));
    expect(anyway.status).toBe(201);

    const capacity = (await get(s.token, "/capacity")).body.data;
    expect(capacity.academicYear).toEqual({ id: s.yearId, name: "2026-2027" });
    expect(capacity.sections).toEqual(
      expect.arrayContaining([
        { sectionId: s.b, classId: s.class5.id, capacity: 2, enrolled: 3, seatsLeft: 0, nextRollNumber: 1 },
        { sectionId: s.a, classId: s.class5.id, capacity: 40, enrolled: 0, seatsLeft: 40, nextRollNumber: 1 },
      ])
    );
    expect(capacity.classes).toEqual([{ classId: s.class5.id, enrolled: 3, nextRollNumber: 1 }]);
    expect(capacity.totals).toEqual({ students: 3, seats: 42, seatsLeft: 40, fullSections: 1 });
  });

  it("says the next free roll number of each section and of a class without sections (the one after the highest given)", async () => {
    const s = await ready();
    expect((await post(s.token, "", admission(s.class5.id, s.a, { firstName: "Roll Seven", rollNumber: 7, ...family(11) }))).status).toBe(201);
    expect((await post(s.token, "", admission(s.class5.id, s.a, { firstName: "Roll Three", rollNumber: 3, ...family(12) }))).status).toBe(201);
    expect((await post(s.token, "", admission(s.class5.id, s.a, { firstName: "No Roll", ...family(13) }))).status).toBe(201);
    expect((await post(s.token, "", admission(s.class1.id, null, { firstName: "Whole Class", rollNumber: 998, ...family(14) }))).status).toBe(201);
    expect((await post(s.token, "", admission(s.class1.id, null, { firstName: "Last Roll", rollNumber: 999, ...family(15) }))).status).toBe(201);

    const capacity = (await get(s.token, "/capacity")).body.data;
    const section = (id: string) => capacity.sections.find((x: { sectionId: string }) => x.sectionId === id);
    expect(section(s.a).nextRollNumber).toBe(8);
    expect(section(s.b).nextRollNumber).toBe(1);
    // 999 is the last roll number: nothing comes after it.
    expect(capacity.classes.find((c: { classId: string }) => c.classId === s.class1.id).nextRollNumber).toBeNull();
  });

  it("gives the last seat to one of several admissions made at the same moment, and undoes the others completely", async () => {
    const s = await ready();
    await post(s.token, "", admission(s.class5.id, s.b, { firstName: "Kid One", ...family(1) }));
    const answers = await Promise.all([2, 3, 4].map((i) => post(s.token, "", admission(s.class5.id, s.b, { firstName: `Kid ${i}`, ...family(i) }))));
    expect(answers.map((a) => a.status).sort()).toEqual([201, 409, 409]);
    for (const refused of answers.filter((a) => a.status === 409)) expect(refused.body.code).toBe("SECTION_FULL");
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, sectionId: s.b })).toBe(2);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(2);
    // The refused admissions' new parents were taken away again: no half-made family is left.
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("moves a student to another section of the year, with the same rules", async () => {
    const s = await ready();
    const asha = (await post(s.token, "", admission(s.class5.id, s.a, { rollNumber: 5 }))).body.data;
    for (const i of [1, 2]) await post(s.token, "", admission(s.class5.id, s.b, { firstName: `Kid ${i}`, ...family(i) }));

    const full = await patch(s.token, `/${asha.id}/enrolment`, { sectionId: s.b });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe("SECTION_FULL");

    const anyway = await patch(s.token, `/${asha.id}/enrolment`, { sectionId: s.b, allowOverCapacity: true });
    expect(anyway.status).toBe(200);
    // A roll number belongs to a section, so moving drops it unless a new one is given.
    expect(anyway.body.data.place).toMatchObject({ sectionName: "B", rollNumber: null });

    const roll = await patch(s.token, `/${asha.id}/enrolment`, { rollNumber: 9 });
    expect(roll.body.data.place).toMatchObject({ sectionName: "B", rollNumber: 9 });

    const toClass1 = await patch(s.token, `/${asha.id}/enrolment`, { classId: s.class1.id });
    expect(toClass1.status).toBe(200);
    expect(toClass1.body.data.place).toMatchObject({ className: "Class 1", sectionId: null });
    expect(toClass1.body.data.enrolments).toHaveLength(1);

    const needsSection = await patch(s.token, `/${asha.id}/enrolment`, { classId: s.class5.id });
    expect(needsSection.status).toBe(400);
    expect(details(needsSection)).toEqual([{ path: "sectionId", message: "Choose the section" }]);
    expect((await patch(s.token, `/${asha.id}/enrolment`, {})).status).toBe(400);
  });
});

describe("the same child twice (S-2.7)", () => {
  it("stops a second admission with the same name, birthday and primary mobile, unless the person says it is another child", async () => {
    const s = await ready();
    const first = (await post(s.token, "", admission(s.class5.id, s.a))).body.data;
    const guardianId = first.guardians[0].id;
    const again = admission(s.class5.id, s.a, {
      firstName: "ASHA",
      lastName: " verma ",
      guardians: [{ guardianId, name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
    });

    const dup = await post(s.token, "", again);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_STUDENT");
    expect(details(dup)[0]).toMatchObject({
      path: "confirmNotDuplicate",
      student: { id: first.id, name: "Asha Verma", admissionNumber: "ADM-2026-0001", dateOfBirth: "2016-05-14", className: "Class 5", sectionName: "A" },
    });
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(1);

    const twin = await post(s.token, "", { ...again, confirmNotDuplicate: true });
    expect(twin.status).toBe(201);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("does not stop a child of the same name and birthday from another family", async () => {
    const s = await ready();
    await post(s.token, "", admission(s.class5.id, s.a));
    const other = await post(s.token, "", admission(s.class5.id, s.a, { guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }] }));
    expect(other.status).toBe(201);
  });
});

describe("a school without a current academic year", () => {
  it("cannot admit, and is told where to set the year up", async () => {
    const s = await createSchool("Old Public School");
    const klass = await addClass(s.token, "Class 1");
    const res = await post(s.token, "", admission(klass.id, null));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_ACTIVE_YEAR");
    expect(res.body.message).toContain("dashboard");
    expect((await get(s.token, "")).body.data).toMatchObject({ academicYear: null, items: [], total: 0 });
    expect((await get(s.token, "/capacity")).body.data).toMatchObject({ academicYear: null, sections: [] });
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });
});

describe("the student list", () => {
  async function filled() {
    const s = await ready();
    const people: [string, string, string, string | null, string][] = [
      ["Asha", "Verma", s.class5.id, s.a, "9000000001"],
      ["Kabir", "Khan", s.class5.id, s.a, "9000000002"],
      ["Zoya", "Ali", s.class5.id, s.b, "9000000003"],
      ["Dev", "Sharma", s.class1.id, null, "9000000004"],
    ];
    for (const [firstName, lastName, classId, sectionId, mobile] of people) {
      const res = await post(s.token, "", admission(classId, sectionId, { firstName, lastName, dateOfBirth: classId === s.class1.id ? "2020-02-02" : "2016-05-14", guardians: [{ name: `${lastName} Parent`, relation: "Mother", isPrimary: true, mobile }] }));
      expect(res.status).toBe(201);
    }
    return s;
  }

  it("is this year's students in class order, each row with the class, section and primary guardian", async () => {
    const s = await filled();
    const res = await get(s.token, "");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ academicYear: { id: s.yearId, name: "2026-2027" }, page: 1, limit: 12, total: 4, totalPages: 1 });
    // Teaching order (Class 1 before Class 5), then by section, then by name.
    expect(names(res)).toEqual(["Dev Sharma", "Asha Verma", "Kabir Khan", "Zoya Ali"]);
    expect(res.body.data.items[1]).toMatchObject({
      admissionNumber: "ADM-2026-0001",
      place: { className: "Class 5", sectionName: "A" },
      primaryGuardian: { name: "Verma Parent", relation: "Mother", mobile: "9000000001" },
    });
  });

  it("is searched, filtered, sorted and paged by the server", async () => {
    const s = await filled();
    expect(names(await get(s.token, "?q=ka"))).toEqual(["Kabir Khan"]);
    expect(names(await get(s.token, "?q=adm-2026-0003"))).toEqual(["Zoya Ali"]);
    expect(names(await get(s.token, "?q=0004"))).toEqual(["Dev Sharma"]);
    expect(names(await get(s.token, `?classId=${s.class5.id}&sectionId=${s.b}`))).toEqual(["Zoya Ali"]);
    expect(names(await get(s.token, `?classId=${s.class1.id}&sectionId=none`))).toEqual(["Dev Sharma"]);
    expect(names(await get(s.token, "?sort=name&dir=desc"))).toEqual(["Zoya Ali", "Kabir Khan", "Dev Sharma", "Asha Verma"]);
    expect(names(await get(s.token, "?sort=admissionNumber&dir=desc&limit=2&page=2"))).toEqual(["Kabir Khan", "Asha Verma"]);
    const paged = await get(s.token, "?limit=3&page=2");
    expect(paged.body.data).toMatchObject({ total: 4, totalPages: 2, page: 2 });
    expect((await get(s.token, "?q=nobody")).body.data).toMatchObject({ items: [], total: 0 });
    expect((await get(s.token, "?classId=nope")).status).toBe(400);
    expect((await get(s.token, "?limit=500")).status).toBe(400);
  });
});

describe("changing a student", () => {
  it("changes only what is sent, never the admission number, and checks the age on the result", async () => {
    const s = await ready();
    const asha = (await post(s.token, "", admission(s.class5.id, s.a, { bloodGroup: "A+" }))).body.data;

    const renamed = await patch(s.token, `/${asha.id}`, { firstName: " Asha  Rani ", bloodGroup: null, previousSchool: { name: "Little Flower" } });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({
      name: "Asha Rani Verma",
      admissionNumber: "ADM-2026-0001",
      bloodGroup: null,
      gender: "Female",
      dateOfBirth: "2016-05-14",
      previousSchool: { name: "Little Flower", lastClass: null, tcNumber: null, tcDate: null },
    });
    expect(names(await get(s.token, "?q=asha%20rani"))).toEqual(["Asha Rani Verma"]);

    const tooYoung = await patch(s.token, `/${asha.id}`, { dateOfBirth: "2025-06-01" });
    expect(tooYoung.status).toBe(400);
    expect(details(tooYoung)).toEqual([{ path: "dateOfBirth", message: "The student must be 2 to 25 years old on the admission date" }]);
    const beforeBirth = await patch(s.token, `/${asha.id}`, { admissionDate: "2017-01-01" });
    expect(details(beforeBirth)).toEqual([{ path: "admissionDate", message: "The student must be 2 to 25 years old on the admission date" }]);

    const address = await patch(s.token, `/${asha.id}`, { address: { line1: "4 Lake View", line2: "Near the park", city: "Indore", state: "Madhya Pradesh", pincode: "452001" } });
    expect(address.body.data.address).toEqual({ line1: "4 Lake View", line2: "Near the park", city: "Indore", state: "Madhya Pradesh", pincode: "452001" });
    // A student of Class 1 to 12 keeps the previous school (it is needed there); a child of Nursery may have none.
    const cleared = await patch(s.token, `/${asha.id}`, { previousSchool: null });
    expect(details(cleared)).toEqual([{ path: "previousSchool.name", message: "Enter the previous school's name" }]);
    const nursery = await addClass(s.token, "Nursery");
    const little = (await post(s.token, "", admission(nursery.id, null, { firstName: "Bina", previousSchool: { name: "Play School" }, guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }] }))).body.data;
    expect((await patch(s.token, `/${little.id}`, { previousSchool: null })).body.data.previousSchool).toBeNull();
    expect((await patch(s.token, `/${asha.id}`, {})).status).toBe(400);
  });

  it("answers 404 before looking at the body, for a student that does not exist", async () => {
    const s = await ready();
    const ghost = new Types.ObjectId().toString();
    expect((await patch(s.token, `/${ghost}`, { firstName: "" })).status).toBe(404);
    expect((await patch(s.token, `/${ghost}/enrolment`, {})).status).toBe(404);
    expect((await get(s.token, `/${ghost}`)).status).toBe(404);
    expect((await get(s.token, "/not-an-id")).status).toBe(400);
  });
});
