import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { DEFAULT_FIELD_RULES, EXPORT_COLUMNS } from "../constants";
import { Student } from "../models/Student";
import { StudentSettings } from "../models/StudentSettings";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const put = (token: string, path: string, body: object) => request(app).put(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const binary = (res: NodeJS.ReadableStream, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const download = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token)).buffer(true).parse(binary as any);

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };
/** The columns every export has (the details every school keeps), in the catalog's order. */
const LOCKED_KEYS = [
  "studentName", "gender", "dateOfBirth", "age", "category", "className", "sectionName", "fatherName", "fatherMobile", "motherName", "motherMobile",
  "address", "city", "state", "pincode", "previousSchool",
];
/** Valid Aadhaar numbers (their last digit is the Verhoeff check digit). */
const AADHAAR = ["234567890124", "345678901238", "456789012341"];

/** A school with its year and Class 5 (no sections); `fields` "default" keeps a new school's needs (the rest of the tests relax them). */
async function school(name = "Sunrise Public School", fields: "classic" | "default" = "default") {
  const s = await createSchool(name, "school_admin", fields);
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  const class5 = (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: "Class 5", sectionCount: 0 })).body.data;
  return { ...s, class5: class5.id as string };
}

/** An admission with everything a new school needs by default. */
const complete = (classId: string, over: Record<string, unknown> = {}) => ({
  firstName: "Asha",
  lastName: "Verma",
  gender: "Female",
  dateOfBirth: "2016-05-14",
  category: "OBC",
  classId,
  sectionId: null,
  aadhaarNumber: AADHAAR[0],
  address: { line1: "12 MG Road", line2: "Near the bus stand", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  previousSchool: { name: "Little Flower School", lastClass: "Class 4", tcNumber: "TC/12" },
  guardians: [
    { name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210", occupation: "Farmer" },
    { name: "Sita Verma", relation: "Mother", isPrimary: false, occupation: "Teacher" },
  ],
  ...over,
});

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a school's needs (its fields, set on Manage school > Students > Export)", () => {
  it("starts from the defaults: the form's details and the export's columns", async () => {
    const s = await school();
    const res = await get(s.token, "/settings");
    expect(res.status).toBe(200);
    expect(res.body.data.fields).toEqual(DEFAULT_FIELD_RULES);
    expect(res.body.data.fields).toMatchObject({ aadhaarNumber: "required", category: "required", previousSchoolTcNumber: "required", bloodGroup: "optional" });
    // What is not in the default export is not asked until the school turns it on (one list for the form and the file).
    expect(res.body.data.fields).toMatchObject({ admissionDate: "hidden", samagraId: "hidden", religion: "hidden", rteSeat: "hidden", previousSchoolTcDate: "optional" });
    expect(res.body.data.exportIsDefault).toBe(true);
    expect(res.body.data.exportColumns.slice(0, 5)).toEqual([
      { key: "admissionNumber", heading: "Admission No." },
      { key: "studentName", heading: "Student Name" },
      { key: "gender", heading: "Gender" },
      { key: "dateOfBirth", heading: "Date of Birth" },
      { key: "age", heading: "Age" },
    ]);
  });

  it("asks for every needed detail of a new school, with the form's words, and admits once they are there", async () => {
    const s = await school();
    const bare = await post(s.token, "", {
      firstName: "Asha",
      lastName: "Verma",
      gender: "Female",
      dateOfBirth: "2016-05-14",
      classId: s.class5,
      sectionId: null,
      guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
    });
    expect(bare.status).toBe(400);
    expect(details(bare)).toEqual(
      expect.arrayContaining([
        { path: "category", message: "Choose the category" },
        { path: "aadhaarNumber", message: "Enter the Aadhaar number" },
        { path: "address.line1", message: "Enter the street address" },
        { path: "address.line2", message: "Enter the area or landmark" },
        { path: "address.city", message: "Enter the city" },
        { path: "address.state", message: "Choose the state" },
        { path: "address.pincode", message: "PIN code is 6 digits" },
        { path: "previousSchool.name", message: "Enter the previous school's name" },
        { path: "previousSchool.lastClass", message: "Enter the last class at the previous school" },
        { path: "previousSchool.tcNumber", message: "Enter the TC number" },
        { path: "guardians.0.occupation", message: "Enter the occupation" },
        { path: "guardians", message: "Add both parents: the father and the mother (a name is enough for the one without a mobile number)" },
      ])
    );
    // Optional by default: not asked for.
    expect(details(bare).map((d) => d.path)).not.toContain("bloodGroup");
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(0);

    const ok = await post(s.token, "", complete(s.class5));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.data).toMatchObject({ aadhaarNumber: AADHAAR[0], category: "OBC", address: { line2: "Near the bus stand" } });
  });

  it("says what the school needs in the same answer as a wrong box (as the form does), and one message per box", async () => {
    const s = await school();
    const res = await post(s.token, "", {
      ...complete(s.class5, { gender: undefined, aadhaarNumber: undefined, address: { line1: "", city: "Bhopal", state: "Madhya Pradesh", pincode: "1" } }),
    });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual(
      expect.arrayContaining([
        { path: "gender", message: "Choose the gender" },
        { path: "aadhaarNumber", message: "Enter the Aadhaar number" },
        { path: "address.line1", message: "Enter the street address" },
        { path: "address.line2", message: "Enter the area or landmark" },
      ])
    );
    // A wrong PIN code is said once, as wrong (not also as missing).
    expect(details(res).filter((d) => d.path === "address.pincode")).toEqual([{ path: "address.pincode", message: "PIN code is 6 digits" }]);
    // Neither a body that is no object nor a guardian that is no object breaks it.
    expect((await post(s.token, "", { ...complete(s.class5), gender: 7, guardians: [null] })).status).toBe(400);
    const student = (await post(s.token, "", complete(s.class5))).body.data;
    const guardian = student.guardians[0].id;
    const both = await patch(s.token, `/guardians/${guardian}`, { occupation: null, mobile: "123" });
    expect(details(both)).toEqual(expect.arrayContaining([{ path: "occupation", message: "Enter the occupation" }, expect.objectContaining({ path: "mobile" })]));
    const emptied = await patch(s.token, `/${student.id}`, { aadhaarNumber: null, gender: "Robot" });
    expect(details(emptied)).toEqual(expect.arrayContaining([{ path: "aadhaarNumber", message: "Enter the Aadhaar number" }, expect.objectContaining({ path: "gender" })]));
  });

  it("follows what the school changes: a detail made optional is not asked, one made needed is", async () => {
    const s = await school();
    const saved = await put(s.token, "/settings", { fields: { aadhaarNumber: "optional", previousSchoolLastClass: "optional", previousSchoolTcNumber: "optional", bloodGroup: "required" } });
    expect(saved.status).toBe(200);
    expect(saved.body.data.fields).toMatchObject({ aadhaarNumber: "optional", previousSchoolLastClass: "optional", bloodGroup: "required", category: "required" });

    // The previous school's name is always needed in Class 1 to 12; its last class and TC number are what the school made optional.
    const res = await post(s.token, "", complete(s.class5, { aadhaarNumber: undefined, previousSchool: { name: "Little Flower School" } }));
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([{ path: "bloodGroup", message: "Choose the blood group" }]);
    expect((await post(s.token, "", complete(s.class5, { aadhaarNumber: undefined, previousSchool: { name: "Little Flower School" }, bloodGroup: "B+" }))).status).toBe(201);
  });

  it("refuses a needs list it cannot follow, and lets only the people who admit change it", async () => {
    const s = await school();
    const wrong = await put(s.token, "/settings", { fields: { firstName: "optional", rteSeat: "required", category: "sometimes" } });
    expect(wrong.status).toBe(400);
    expect(details(wrong)).toEqual(
      expect.arrayContaining([
        { path: "fields.firstName", message: "This detail cannot be changed" },
        { path: "fields.rteSeat", message: "A yes / no detail is a tick: it cannot be needed" },
        { path: "fields.category", message: "Choose needed, optional or not asked" },
      ])
    );
    expect((await put(s.token, "/settings", {})).status).toBe(400);

    const accountant = await addColleague(s.tenantId, "accountant");
    const teacher = await addColleague(s.tenantId, "teacher");
    expect((await get(accountant, "/settings")).status).toBe(200);
    expect((await put(accountant, "/settings", { fields: { category: "optional" } })).status).toBe(403);
    expect((await get(teacher, "/settings")).status).toBe(403);
    expect((await put(await addColleague(s.tenantId, "principal"), "/settings", { fields: { category: "optional" } })).status).toBe(200);
  });

  it("keeps each school's needs its own", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    await put(a.token, "/settings", { fields: { aadhaarNumber: "hidden" }, exportColumns: [{ key: "studentName", heading: "Naam" }, { key: "className", heading: "Kaksha" }] });
    const theirs = (await get(b.token, "/settings")).body.data;
    expect(theirs.fields.aadhaarNumber).toBe("required");
    expect(theirs.exportIsDefault).toBe(true);
    expect(await StudentSettings.countDocuments({ tenantId: b.tenantId })).toBe(0);
  });

  it("does not let a change empty a needed detail, but changes the rest", async () => {
    const s = await school();
    const asha = (await post(s.token, "", complete(s.class5))).body.data;
    const cleared = await patch(s.token, `/${asha.id}`, { aadhaarNumber: "", category: null });
    expect(cleared.status).toBe(400);
    expect(details(cleared)).toEqual(
      expect.arrayContaining([
        { path: "aadhaarNumber", message: "Enter the Aadhaar number" },
        { path: "category", message: "Choose the category" },
      ])
    );
    const partly = await patch(s.token, `/${asha.id}`, { address: { line1: "4 Lake View", city: "Indore", state: "Madhya Pradesh", pincode: "452001" } });
    expect(details(partly)).toEqual([{ path: "address.line2", message: "Enter the area or landmark" }]);
    const fine = await patch(s.token, `/${asha.id}`, { religion: "Hindu", rteSeat: true, bloodGroup: null });
    expect(fine.status).toBe(200);
    expect(fine.body.data).toMatchObject({ religion: "Hindu", rteSeat: true, bloodGroup: null });

    const mother = asha.guardians.find((g: { relation: string }) => g.relation === "Mother");
    const noJob = await patch(s.token, `/guardians/${mother.id}`, { occupation: "" });
    expect(details(noJob)).toEqual([{ path: "occupation", message: "Enter the occupation" }]);
  });
});

describe("the details every school has (they cannot be turned off): the Excel's fixed columns, the address, the previous school by class", () => {
  const FIXED_COLUMNS = [
    "studentName", "gender", "dateOfBirth", "age", "category", "className", "sectionName", "fatherName", "fatherMobile", "motherName", "motherMobile",
    "address", "city", "state", "pincode", "previousSchool",
  ];
  const nursery = async (token: string) => (await request(app).post(`${academics}/classes`).set(auth(token)).send({ name: "Nursery", sectionCount: 0 })).body.data.id as string;

  it("a new school's Excel has the birthday next to the gender, and every fixed column is in every layout", async () => {
    const s = await school("Sunrise Public School", "classic");
    const res = await get(s.token, "/settings");
    expect(res.body.data.exportColumns.slice(0, 5).map((c: { key: string }) => c.key)).toEqual(["admissionNumber", "studentName", "gender", "dateOfBirth", "age"]);
    for (const key of FIXED_COLUMNS) expect(res.body.data.exportColumns.map((c: { key: string }) => c.key), key).toContain(key);

    const bare = await put(s.token, "/settings", { exportColumns: [{ key: "studentName", heading: "Name" }, { key: "className", heading: "Class" }] });
    expect(bare.status).toBe(400);
    expect(details(bare)).toContainEqual({
      path: "exportColumns",
      message: "Student Name, Gender, Date of Birth, Age, Category, Class, Section, Father's Name, Father's Mobile, Mother's Name, Mother's Mobile, Address, City or Village, State, PIN Code and Previous School are in every export",
    });
    // With the others given, a layout is kept in the order the school chose; what it adds on top is its own.
    const layout = [...FIXED_COLUMNS.slice().reverse(), "religion"].map((key) => ({ key, heading: `H ${key}` }));
    expect((await put(s.token, "/settings", { exportColumns: layout })).status).toBe(200);
  });

  it("a layout saved before these columns were fixed gets them back where they belong when it is read (nothing the school chose is lost)", async () => {
    const s = await school("Sunrise Public School", "classic");
    await StudentSettings.updateOne(
      { tenantId: s.tenantId },
      { $set: { exportColumns: [{ key: "studentName", heading: "Naam" }, { key: "className", heading: "Kaksha" }, { key: "religion", heading: "Dharm" }] } }
    );
    const res = await get(s.token, "/settings");
    expect(res.body.data.exportIsDefault).toBe(false);
    expect(res.body.data.exportColumns.map((c: { key: string }) => c.key)).toEqual([
      "studentName", "gender", "dateOfBirth", "age", "category", "className", "sectionName", "fatherName", "fatherMobile", "motherName", "motherMobile",
      // Each comes back right after the nearest column before it in the catalog that the layout has (the previous school is the catalog's
      // last group, so after Religion here).
      "address", "city", "state", "pincode", "religion", "previousSchool",
    ]);
    // Its own headings stay; the ones that came back have the usual ones.
    expect(res.body.data.exportColumns.find((c: { key: string }) => c.key === "studentName").heading).toBe("Naam");
    expect(res.body.data.exportColumns.find((c: { key: string }) => c.key === "className").heading).toBe("Kaksha");
    expect(res.body.data.exportColumns.find((c: { key: string }) => c.key === "dateOfBirth").heading).toBe("Date of Birth");
  });

  it("the address is always needed and the category is always asked: the school cannot change them, and an older setting is read the right way", async () => {
    const s = await school("Sunrise Public School", "classic");
    for (const key of ["addressLine1", "addressCity", "addressState", "addressPincode", "previousSchoolName"]) {
      for (const mode of ["optional", "hidden"]) {
        const res = await put(s.token, "/settings", { fields: { [key]: mode } });
        expect(details(res), `${key} ${mode}`).toContainEqual({ path: `fields.${key}`, message: "This detail is always needed" });
      }
      // Saying "needed" is no change at all and is fine.
      expect((await put(s.token, "/settings", { fields: { [key]: "required" } })).status, key).toBe(200);
    }
    const hidden = await put(s.token, "/settings", { fields: { category: "hidden" } });
    expect(details(hidden)).toContainEqual({ path: "fields.category", message: "This detail is always asked: choose needed or optional" });
    expect((await put(s.token, "/settings", { fields: { category: "optional" } })).body.data.fields.category).toBe("optional");

    // A school that saved them the other way (before this rule) is read the right way.
    await StudentSettings.updateOne(
      { tenantId: s.tenantId },
      { $set: { fields: [{ key: "addressCity", mode: "hidden" }, { key: "addressLine1", mode: "optional" }, { key: "category", mode: "hidden" }, { key: "previousSchoolName", mode: "optional" }] } }
    );
    const read = (await get(s.token, "/settings")).body.data.fields;
    expect(read).toMatchObject({ addressCity: "required", addressLine1: "required", category: "optional", previousSchoolName: "required" });
  });

  it("the previous school is needed from Class 1 to 12 and optional before it (Nursery, LKG, UKG): the class says which", async () => {
    const s = await school("Sunrise Public School", "classic");
    const small = await nursery(s.token);
    const base = { firstName: "Asha", lastName: "Verma", gender: "Female", dateOfBirth: "2016-05-14", sectionId: null, address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" }, guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }] };

    const numbered = await post(s.token, "", { ...base, classId: s.class5 });
    expect(numbered.status).toBe(400);
    expect(details(numbered)).toEqual([{ path: "previousSchool.name", message: "Enter the previous school's name" }]);

    // A child who comes into the first years of school has no previous school to give; one that is given is kept.
    const preschool = await post(s.token, "", { ...base, classId: small });
    expect(preschool.status, JSON.stringify(preschool.body)).toBe(201);
    expect(preschool.body.data.previousSchool).toBeNull();
    const sibling = await post(s.token, "", { ...base, firstName: "Bina", classId: small, previousSchool: { name: "Little Flower Play School" }, guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }] });
    expect(sibling.status).toBe(201);
    expect(sibling.body.data.previousSchool).toMatchObject({ name: "Little Flower Play School" });

    const ok = await post(s.token, "", { ...base, firstName: "Cara", classId: s.class5, previousSchool: { name: "Little Flower School" }, guardians: [{ name: "Imran Ali", relation: "Father", isPrimary: true, mobile: "9222222222" }] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
  });

  it("the last class and the TC number, when the school needs them, are needed from Class 1 too and never before it; a change follows the student's class", async () => {
    const s = await school("Sunrise Public School", "default");
    await put(s.token, "/settings", { fields: { aadhaarNumber: "optional", category: "optional" } });
    const small = await nursery(s.token);
    const base = { ...complete(s.class5), aadhaarNumber: undefined, previousSchool: undefined };
    const numbered = await post(s.token, "", base);
    expect(details(numbered)).toEqual(
      expect.arrayContaining([
        { path: "previousSchool.name", message: "Enter the previous school's name" },
        { path: "previousSchool.lastClass", message: "Enter the last class at the previous school" },
        { path: "previousSchool.tcNumber", message: "Enter the TC number" },
      ])
    );
    const early = await post(s.token, "", { ...base, classId: small });
    expect(early.status, JSON.stringify(early.body)).toBe(201);

    // A change: emptying the previous school of a student of Class 1 to 12 is refused; of a student of Nursery it is fine.
    const grown = await post(s.token, "", { ...base, firstName: "Dev", classId: s.class5, previousSchool: { name: "Old School", lastClass: "Class 4", tcNumber: "TC/1" }, guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111", occupation: "Driver" }, { name: "Sita Rao", relation: "Mother", isPrimary: false, occupation: "Nurse" }] });
    expect(grown.status, JSON.stringify(grown.body)).toBe(201);
    const refused = await patch(s.token, `/${grown.body.data.id}`, { previousSchool: null });
    expect(details(refused)).toEqual(expect.arrayContaining([{ path: "previousSchool.name", message: "Enter the previous school's name" }]));
    expect((await patch(s.token, `/${early.body.data.id}`, { previousSchool: null })).status).toBe(200);
  });
});

describe("the student's records", () => {
  it("keeps every record, checks each one, and gives them back", async () => {
    const s = await school("Sunrise Public School", "classic");
    const records = {
      aadhaarNumber: "2345 6789 0124",
      samagraId: "123456789",
      apaarId: "123456789012",
      pen: "12345678901",
      srNumber: "SR/2019/45",
      religion: "Hindu",
      nationality: "Indian",
      emergencyMobile: "+91 98111 22233",
      disability: "None",
      medicalNotes: "Allergic to peanuts",
      rteSeat: true,
      bpl: false,
      feeConcession: "50% tuition",
      transportRoute: "Route 3",
      transportStop: "MP Nagar",
    };
    const res = await post(s.token, "", complete(s.class5, records));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ ...records, aadhaarNumber: "234567890124", emergencyMobile: "9811122233" });

    const cases: [Record<string, unknown>, string, string][] = [
      [{ aadhaarNumber: "234567890120" }, "aadhaarNumber", "Enter a valid 12-digit Aadhaar number"],
      [{ aadhaarNumber: "12345" }, "aadhaarNumber", "Enter a valid 12-digit Aadhaar number"],
      [{ aadhaarNumber: "123456789012" }, "aadhaarNumber", "Enter a valid 12-digit Aadhaar number"],
      [{ samagraId: "1234" }, "samagraId", "Samagra ID is 8 or 9 digits"],
      [{ apaarId: "12345" }, "apaarId", "APAAR ID is 12 digits"],
      [{ pen: "123" }, "pen", "PEN is 11 digits"],
      [{ religion: "Pastafarian" }, "religion", "Choose a religion from the list"],
      [{ disability: "Tired" }, "disability", "Choose a disability from the list"],
      [{ emergencyMobile: "12345" }, "emergencyMobile", "Enter a 10-digit mobile number starting with 6, 7, 8 or 9"],
      [{ rteSeat: "maybe" }, "rteSeat", "Say yes or no"],
      [{ medicalNotes: "x".repeat(301) }, "medicalNotes", "Keep the medical notes under 300 characters"],
    ];
    for (const [over, path, message] of cases) {
      const bad = await post(s.token, "", complete(s.class5, { firstName: "Other", aadhaarNumber: AADHAAR[1], ...over }));
      expect(bad.status, JSON.stringify(over)).toBe(400);
      expect(details(bad), JSON.stringify(over)).toContainEqual({ path, message });
    }
  });

  it("gives one Aadhaar number to one student: a second is refused with whose it is", async () => {
    const s = await school("Sunrise Public School", "classic");
    const asha = (await post(s.token, "", complete(s.class5))).body.data;
    const twin = await post(s.token, "", complete(s.class5, { firstName: "Bina", guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }] }));
    expect(twin.status).toBe(409);
    expect(twin.body.code).toBe("AADHAAR_TAKEN");
    expect(details(twin)).toEqual([{ path: "aadhaarNumber", message: `Aadhaar number ${AADHAAR[0]} is already Asha Verma's (${asha.admissionNumber})` }]);

    const bina = (await post(s.token, "", complete(s.class5, { firstName: "Bina", aadhaarNumber: AADHAAR[1], guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }] }))).body.data;
    const taken = await patch(s.token, `/${bina.id}`, { aadhaarNumber: AADHAAR[0] });
    expect(taken.status).toBe(409);
    // Another school may have the same child's number on its own books.
    const other = await school("Moonrise Public School", "classic");
    expect((await post(other.token, "", complete(other.class5))).status).toBe(201);
  });
});

describe("the export in the school's own layout", () => {
  it("writes the school's columns, in its order, under its headings, and shows a preview of the first students", async () => {
    const s = await school("Sunrise Public School", "classic");
    await post(s.token, "", complete(s.class5, { rteSeat: true }));
    await post(s.token, "", complete(s.class5, { firstName: "Kabir", aadhaarNumber: AADHAAR[1], guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111", occupation: "Driver" }] }));

    // The columns every export has, the class first and the names of three of them in the school's own words, then two more.
    const fixed = ((await get(s.token, "/settings")).body.data.exportColumns as { key: string; heading: string }[]).filter((c) => LOCKED_KEYS.includes(c.key));
    const own: Record<string, string> = { className: "Kaksha", studentName: "Chhatra ka naam", fatherName: "Pita" };
    const layout = [
      { key: "className", heading: "Kaksha" },
      ...fixed.filter((c) => c.key !== "className").map((c) => ({ key: c.key, heading: own[c.key] ?? c.heading })),
      { key: "aadhaarNumber", heading: "Aadhaar" },
      { key: "rteSeat", heading: "RTE" },
    ];
    const saved = await put(s.token, "/settings", { exportColumns: layout });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ exportColumns: layout, exportIsDefault: false });

    const sheet = await (async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load((await download(s.token, "/export")).body as unknown as ArrayBuffer);
      return workbook.getWorksheet("Students")!;
    })();
    const headings = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(headings).toEqual(layout.map((c) => c.heading));
    // Each student's row, by the school's headings.
    const rowOf = (n: number) => Object.fromEntries(headings.map((h, i) => [h as string, (sheet.getRow(n).values as unknown[])[i + 1]]));
    expect(rowOf(2)).toMatchObject({ Kaksha: "Class 5", "Chhatra ka naam": "Asha Verma", Pita: "Ravi Verma", Aadhaar: AADHAAR[0], RTE: "Yes", "Date of Birth": "14-05-2016" });
    expect(rowOf(3)).toMatchObject({ Kaksha: "Class 5", "Chhatra ka naam": "Kabir Verma", Pita: "Anil Rao", Aadhaar: AADHAAR[1], RTE: "No" });
    // The Aadhaar column is text, so Excel keeps all 12 digits.
    expect(sheet.getColumn(headings.indexOf("Aadhaar") + 1).numFmt).toBe("@");

    const preview = await get(s.token, "/export/preview");
    expect(preview.status).toBe(200);
    expect(preview.body.data.total).toBe(2);
    expect(Object.keys(preview.body.data.rows[0]).sort()).toEqual(EXPORT_COLUMNS.map((c) => c.key).sort());
    expect(preview.body.data.rows[0]).toMatchObject({ studentName: "Asha Verma", fatherOccupation: "Farmer", motherName: "Sita Verma", area: "Near the bus stand", tcNumber: "TC/12" });

    // Back to the default layout.
    expect((await put(s.token, "/settings", { exportColumns: null })).body.data.exportIsDefault).toBe(true);
  });

  it("lets a school add fields of its own: asked, checked by kind, kept, changed, exported, and deleted", async () => {
    const s = await school("Sunrise Public School", "classic");
    const own = [
      { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "required" },
      { key: "c_bus001", label: "Bus pass no.", type: "text", mode: "optional" },
      { key: "c_fee001", label: "Fee paid", type: "yesNo", mode: "optional" },
      { key: "c_hgt001", label: "Height (cm)", type: "number", mode: "optional" },
      { key: "c_join01", label: "Hostel from", type: "date", mode: "optional" },
    ];
    // The columns every export has (and what a new school starts with), then three of its own.
    const usual = (await get(s.token, "/settings")).body.data.exportColumns as { key: string; heading: string }[];
    const layout = [
      ...usual,
      { key: "c_house1", heading: "House" },
      { key: "c_join01", heading: "Hostel from" },
      { key: "c_fee001", heading: "Fee paid" },
    ];
    const saved = await put(s.token, "/settings", { customFields: own, exportColumns: layout });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.customFields).toEqual(own.map((f) => ({ options: [], ...f })));

    // Asked and checked by kind, with the form's words.
    const missingHouse = await post(s.token, "", complete(s.class5));
    expect(details(missingHouse)).toContainEqual({ path: "custom.c_house1", message: "Choose the House" });
    const wrong = await post(s.token, "", complete(s.class5, { custom: { c_house1: "Green", c_hgt001: "12", c_join01: "2026-02-30", c_fee001: "yes", c_other1: "x" } }));
    expect(details(wrong)).toEqual(
      expect.arrayContaining([
        { path: "custom.c_house1", message: "Choose the House from the list" },
        { path: "custom.c_hgt001", message: "Enter a number for Height (cm)" },
        { path: "custom.c_join01", message: "Choose a valid date for Hostel from" },
        { path: "custom.c_fee001", message: "Say yes or no" },
        { path: "custom.c_other1", message: "This is not one of your school's fields" },
      ])
    );
    const ok = await post(s.token, "", complete(s.class5, { custom: { c_house1: "Red", c_bus001: "  BP   12 ", c_fee001: true, c_hgt001: 132, c_join01: "2026-04-01" } }));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.data.custom).toEqual({ c_house1: "Red", c_bus001: "BP 12", c_fee001: true, c_hgt001: 132, c_join01: "2026-04-01" });

    // A needed one cannot be cleared; an optional one can; the others stay.
    const id = ok.body.data.id;
    expect(details(await patch(s.token, `/${id}`, { custom: { c_house1: null } }))).toContainEqual({ path: "custom.c_house1", message: "Choose the House" });
    const changed = await patch(s.token, `/${id}`, { custom: { c_house1: "Blue", c_bus001: null } });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data.custom).toEqual({ c_house1: "Blue", c_fee001: true, c_hgt001: 132, c_join01: "2026-04-01" });

    // In the preview and the file, under the school's headings (a day as DD-MM-YYYY, a tick as Yes / No).
    const preview = await get(s.token, "/export/preview");
    expect(preview.body.data.rows[0]).toMatchObject({ c_house1: "Blue", c_join01: "01-04-2026", c_fee001: "Yes", c_hgt001: 132, c_bus001: "" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await download(s.token, "/export")).body as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Students")!;
    const headings = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(headings).toEqual(layout.map((c) => c.heading));
    const first = Object.fromEntries(headings.map((h, i) => [h as string, (sheet.getRow(2).values as unknown[])[i + 1]]));
    expect(first).toMatchObject({ "Student Name": "Asha Verma", Class: "Class 5", House: "Blue", "Hostel from": "01-04-2026", "Fee paid": "Yes" });

    // What cannot be: a field's kind changed, a name of the list or twice, a list without choices, a needed tick, a column of no field.
    const refused = await put(s.token, "/settings", {
      customFields: [
        { ...own[0] },
        { key: "c_bus001", label: "Religion", type: "text", mode: "optional" },
        { key: "c_fee001", label: "Fee paid", type: "yesNo", mode: "required" },
        { key: "c_hgt001", label: "Height (cm)", type: "text", mode: "optional" },
        { key: "c_new001", label: "house", type: "choice", options: [], mode: "optional" },
      ],
    });
    expect(details(refused)).toEqual(
      expect.arrayContaining([
        { path: "customFields.1.label", message: "There is already a field called Religion: switch it on in the list" },
        { path: "customFields.2.mode", message: "A yes / no detail is a tick: it cannot be needed" },
        { path: "customFields.4.label", message: "Two fields cannot have the same name" },
        { path: "customFields.4.options", message: "Add the choices, one per line" },
      ])
    );
    const kind = await put(s.token, "/settings", { customFields: own.map((f) => (f.key === "c_hgt001" ? { ...f, type: "text" } : f)) });
    expect(details(kind)).toEqual([{ path: "customFields.3.type", message: "A field keeps its kind: add a new field for another kind" }]);
    const noField = await put(s.token, "/settings", { exportColumns: [...layout, { key: "c_gone01", heading: "Gone" }] });
    expect(details(noField)).toEqual([{ path: `exportColumns.${layout.length}.key`, message: "Choose a column from the list" }]);

    // Deleted: out of the form (no longer needed) and out of the saved file layout; the answers stay in the record, unread.
    const deleted = await put(s.token, "/settings", { customFields: own.filter((f) => f.key !== "c_house1") });
    expect(deleted.body.data.exportColumns.map((c: { key: string }) => c.key)).toEqual(layout.filter((c) => c.key !== "c_house1").map((c) => c.key));
    expect((await post(s.token, "", complete(s.class5, { firstName: "Kabir", aadhaarNumber: AADHAAR[1], guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111", occupation: "Driver" }] }))).status).toBe(201);

    // Another school's field is no field here.
    const other = await school("Moonlight School", "classic");
    const elsewhere = await post(other.token, "", complete(other.class5, { custom: { c_bus001: "BP 1" } }));
    expect(details(elsewhere)).toContainEqual({ path: "custom.c_bus001", message: "This is not one of your school's fields" });
  });

  it("keeps the fixed columns in every layout (the name, the class...), and two columns from sharing a heading", async () => {
    const s = await school("Sunrise Public School", "classic");
    const noName = await put(s.token, "/settings", { exportColumns: [{ key: "className", heading: "Class" }] });
    expect(details(noName)).toContainEqual({
      path: "exportColumns",
      message: "Student Name, Gender, Date of Birth, Age, Category, Class, Section, Father's Name, Father's Mobile, Mother's Name, Mother's Mobile, Address, City or Village, State, PIN Code and Previous School are in every export",
    });
    const twice = await put(s.token, "/settings", {
      exportColumns: [
        { key: "studentName", heading: "Name" },
        { key: "className", heading: "name" },
        { key: "className", heading: "Class" },
        { key: "salary", heading: "Salary" },
        { key: "gender", heading: "" },
      ],
    });
    expect(details(twice)).toEqual(
      expect.arrayContaining([
        { path: "exportColumns.1.heading", message: "Two columns cannot have the same heading" },
        { path: "exportColumns.2.key", message: "This column is already in the export" },
        { path: "exportColumns.3.key", message: "Choose a column from the list" },
        { path: "exportColumns.4.heading", message: "Enter the heading" },
      ])
    );
  });
});

describe("a bulk import and the school's needs", () => {
  it("admits a row that lacks what the school needs, and says what it lacks", async () => {
    const s = await school();
    await put(s.token, "/settings", { customFields: [{ key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "required" }] });
    const res = await post(s.token, "/import", {
      dryRun: false,
      rows: [
        {
          row: 3,
          student: {
            firstName: "Asha",
            lastName: "Verma",
            gender: "Female",
            dateOfBirth: "2016-05-14",
            classId: s.class5,
            sectionId: null,
            address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
            previousSchool: { name: "Little Flower School" },
            guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
          },
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.results[0].ok).toBe(true);
    // The address and the previous school (Class 1 to 12) are not said here: a row without them is refused, not admitted with a warning.
    expect(res.body.data.results[0].warnings).toEqual([
      "Not in the file, but your school needs it: Category, Aadhaar number, Area or landmark, Last class there, TC number, Parent's occupation, Both parents (father and mother), House.",
    ]);
    // An answer to a field of the school's own that is given wrong refuses the row.
    const wrong = await post(s.token, "/import", {
      dryRun: true,
      rows: [{ row: 4, student: { firstName: "Kabir", lastName: "Rao", gender: "Male", dateOfBirth: "2016-01-01", classId: s.class5, sectionId: null, guardians: [{ name: "Anil Rao", relation: "Father", isPrimary: true, mobile: "9111111111" }], custom: { c_house1: "Green" } } }],
    });
    expect(wrong.body.data.results[0]).toMatchObject({ ok: false, errors: [{ path: "custom.c_house1", message: "Choose the House from the list" }] });
  });
});
