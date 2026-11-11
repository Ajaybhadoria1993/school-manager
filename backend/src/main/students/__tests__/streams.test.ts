import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { createSchool } from "../../../test/schools";
import { Enrolment } from "../models/Enrolment";
import { Student } from "../models/Student";
import { classNumber, needsStream, streamOf } from "../classNumber";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

async function school() {
  const s = await createSchool("Sunrise Public School");
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  return s;
}

async function addClass(token: string, name: string) {
  const res = await request(app).post(`${academics}/classes`).set(auth(token)).send({ name, capacity: 2000, sectionCount: 0 });
  return res.body.data.id as string;
}

/** A complete admission into the class given (Class 10 and up need a previous school: it is there). */
const admission = (classId: string, over: Record<string, unknown> = {}) => ({
  firstName: "Asha",
  lastName: "Verma",
  gender: "Female",
  dateOfBirth: "2010-05-14",
  admissionDate: "2026-06-01",
  address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  previousSchool: { name: "Little Flower School" },
  classId,
  sectionId: null,
  guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
  ...over,
});

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("which classes are taught in streams (read from the name)", () => {
  it("Class 11 and 12 without a stream need one; with one they are a stream's class; no other class does", () => {
    for (const name of ["Class 11", "Class 12", "XI", "XII", "11th", "Std 12", "Grade 11 "]) expect(needsStream(name), name).toBe(true);
    for (const name of ["Class 11 Science", "Class 12 Commerce", "XI Arts", "12th Maths", "Class 11 - Science", "Class 11 Science A"]) expect(needsStream(name), name).toBe(false);
    for (const name of ["Class 10", "Class 9", "Class 1", "Nursery", "LKG", "Hobby Club"]) expect(needsStream(name), name).toBe(false);
  });

  it("the stream is what follows the number, as the school wrote it", () => {
    expect(streamOf("Class 11 Science")).toBe("Science");
    expect(streamOf("XII Commerce")).toBe("Commerce");
    expect(streamOf("Class 12 - Arts & Humanities")).toBe("Arts & Humanities");
    expect(streamOf("Class 11")).toBeNull();
    expect(streamOf("Class 5 A")).toBeNull();
    expect(classNumber("Class 11 Science")).toBe(11);
  });
});

describe("a student of Class 11 or 12 is admitted into a stream, never into the class as a whole", () => {
  it("refuses Class 11 without a stream and names the streams the school has", async () => {
    const s = await school();
    const plain = await addClass(s.token, "Class 11");
    await addClass(s.token, "Class 11 Science");
    await addClass(s.token, "Class 11 Commerce");
    const res = await post(s.token, "", admission(plain));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("STREAM_REQUIRED");
    expect(details(res)[0].path).toBe("classId");
    expect(res.body.message).toBe("Class 11 is taught in streams: choose one of Class 11 Science, Class 11 Commerce.");
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("says so when the school has no stream of that class yet, and where to add them", async () => {
    const s = await school();
    const plain = await addClass(s.token, "Class 12");
    const res = await post(s.token, "", admission(plain));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("STREAM_REQUIRED");
    expect(res.body.message).toBe("Class 12 is taught in streams, and your school has none yet: add them (for example Class 12 Science) in Classes & Sections.");
  });

  it("admits into the stream's class", async () => {
    const s = await school();
    await addClass(s.token, "Class 11");
    const science = await addClass(s.token, "Class 11 Science");
    const res = await post(s.token, "", admission(science));
    expect(res.status).toBe(201);
    expect(res.body.data.place.className).toBe("Class 11 Science");
  });

  it("does not stop any other class: Class 10, Class 9 and a class with no number", async () => {
    const s = await school();
    const names = ["Class 10", "Class 9", "Nursery"];
    for (const [i, name] of names.entries()) {
      const id = await addClass(s.token, name);
      const guardians = [{ name: `Parent ${i}`, relation: "Father", isPrimary: true, mobile: `98765432${10 + i}` }];
      const res = await post(s.token, "", admission(id, name === "Nursery" ? { dateOfBirth: "2022-05-14", firstName: "Nia", previousSchool: undefined, guardians } : { firstName: `Pupil${i}`, guardians }));
      expect(res.status, name).toBe(201);
    }
  });

  it("the bulk import refuses the row the same way (the screen asks for the stream first; the server is the last word)", async () => {
    const s = await school();
    const plain = await addClass(s.token, "Class 11");
    const res = await post(s.token, "/import", { dryRun: true, allowOverCapacity: false, rows: [{ row: 2, student: admission(plain) }] });
    expect(res.status).toBe(200);
    expect(res.body.data.results[0]).toMatchObject({ ok: false, code: "STREAM_REQUIRED" });
  });
});

describe("moving a student", () => {
  async function enrolled() {
    const s = await school();
    const ten = await addClass(s.token, "Class 10");
    const plain = await addClass(s.token, "Class 11");
    const science = await addClass(s.token, "Class 11 Science");
    const made = await post(s.token, "", admission(ten));
    return { ...s, studentId: made.body.data.id as string, ten, plain, science };
  }

  it("into Class 11 without a stream is refused; into a stream it works", async () => {
    const s = await enrolled();
    const refused = await patch(s.token, `/${s.studentId}/enrolment`, { classId: s.plain, sectionId: null });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("STREAM_REQUIRED");
    const moved = await patch(s.token, `/${s.studentId}/enrolment`, { classId: s.science, sectionId: null });
    expect(moved.status).toBe(200);
    expect(moved.body.data.place.className).toBe("Class 11 Science");
  });

  it("a student who is already in Class 11 as a whole (from before) can still have their roll number changed", async () => {
    const s = await enrolled();
    await Enrolment.updateOne({ tenantId: s.tenantId, studentId: s.studentId }, { $set: { classId: s.plain } });
    const res = await patch(s.token, `/${s.studentId}/enrolment`, { rollNumber: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data.place.rollNumber).toBe(7);
  });
});
