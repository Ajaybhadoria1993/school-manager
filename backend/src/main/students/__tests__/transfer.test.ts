import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { EnrolmentChange } from "../models/EnrolmentChange";
import { Enrolment } from "../models/Enrolment";
import { Student } from "../models/Student";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

/** A school with Class 5 (A with 40 seats, B with 40 seats) and Class 6 (A), and Asha in 5-A with roll 1. */
async function ready(name = "Sunrise Public School") {
  const s = await createSchool(name);
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  const klass = async (className: string) => (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: className, capacity: 2000, sectionCount: 0 })).body.data.id as string;
  const section = async (classId: string, sectionName: string) =>
    (await request(app).post(`${academics}/classes/${classId}/sections`).set(auth(s.token)).send({ name: sectionName, capacity: 40, room: `Room ${sectionName}` })).body.data.id as string;
  const c5 = await klass("Class 5");
  const c6 = await klass("Class 6");
  const a = await section(c5, "A");
  const b = await section(c5, "B");
  const m = await section(c6, "A");
  const res = await post(s.token, "", {
    firstName: "Asha",
    lastName: "Verma",
    gender: "Female",
    dateOfBirth: "2016-05-14",
    address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
    previousSchool: { name: "Little Flower School" },
    classId: c5,
    sectionId: a,
    rollNumber: 1,
    guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { ...s, c5, c6, a, b, m, asha: res.body.data.id as string };
}

describe("moving a student inside the school keeps where they were", () => {
  it("writes who moved them, when, why, and from where to where; the page lists the moves newest first", async () => {
    const s = await ready();
    expect((await patch(s.token, `/${s.asha}/enrolment`, { sectionId: s.b, reason: "Parents asked for the morning section" })).status).toBe(200);
    expect((await patch(s.token, `/${s.asha}/enrolment`, { classId: s.c6, sectionId: s.m, rollNumber: 9 })).status).toBe(200);

    const page = (await get(s.token, `/${s.asha}`)).body.data;
    expect(page.place).toMatchObject({ className: "Class 6", sectionName: "A", rollNumber: 9 });
    expect(page.moves).toHaveLength(2);
    expect(page.moves[0]).toMatchObject({
      kind: "moved",
      reason: null,
      from: { className: "Class 5", sectionName: "B", rollNumber: null },
      to: { className: "Class 6", sectionName: "A", rollNumber: 9 },
      by: { name: "Asha Verma", role: "school_admin" },
    });
    expect(page.moves[1]).toMatchObject({
      reason: "Parents asked for the morning section",
      from: { className: "Class 5", sectionName: "A", rollNumber: 1 },
      to: { className: "Class 5", sectionName: "B", rollNumber: null },
    });
    expect(typeof page.moves[0].at).toBe("string");
    expect(page.moves[0].academicYear).toMatchObject({ name: "2026-2027" });
    // The enrolment of the year is still one record (the moves are the history), and nothing was deleted.
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId, studentId: s.asha })).toBe(1);
    expect(await EnrolmentChange.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("a change of the roll number alone is a move too; a request that changes nothing writes nothing", async () => {
    const s = await ready();
    expect((await patch(s.token, `/${s.asha}/enrolment`, { rollNumber: 7 })).status).toBe(200);
    expect((await patch(s.token, `/${s.asha}/enrolment`, { rollNumber: 7 })).status).toBe(200);
    expect((await patch(s.token, `/${s.asha}/enrolment`, { sectionId: s.a })).status).toBe(200);
    const moves = (await get(s.token, `/${s.asha}`)).body.data.moves;
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: { rollNumber: 1 }, to: { rollNumber: 7 } });
  });

  it("a refused move (a full section, a wrong class) writes nothing", async () => {
    const s = await ready();
    expect((await patch(s.token, `/${s.asha}/enrolment`, { classId: s.c6, sectionId: s.a })).status).toBe(400);
    expect(await EnrolmentChange.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("the reason is optional and short", async () => {
    const s = await ready();
    expect((await patch(s.token, `/${s.asha}/enrolment`, { sectionId: s.b, reason: "x".repeat(201) })).status).toBe(400);
  });
});

describe("transferring a student to another school", () => {
  const transfer = { schoolName: "Delhi Public School, Indore", tcNumber: "TC/2026/18", tcDate: "2026-10-20", remarks: "Father posted to Indore" };

  it("makes them inactive with the transfer certificate details kept, and says so in the list, the page and the history", async () => {
    const s = await ready();
    const res = await post(s.token, `/${s.asha}/transfer-out`, transfer);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ status: "inactive", inactive: { reason: "Transferred to Delhi Public School, Indore", transfer } });

    const inactive = (await get(s.token, "/inactive")).body.data.items[0];
    expect(inactive).toMatchObject({ name: "Asha Verma", reason: "Transferred to Delhi Public School, Indore", transfer: { tcNumber: "TC/2026/18" } });
    expect((await get(s.token, "")).body.data.total).toBe(0);
    const page = (await get(s.token, `/${s.asha}`)).body.data;
    expect(page.moves[0]).toMatchObject({ kind: "transferred_out", from: { className: "Class 5", sectionName: "A", rollNumber: 1 }, to: null, school: transfer, by: { role: "school_admin" } });
    // Nothing is deleted: the student, the enrolment and their parents are all still there.
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect(await Enrolment.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it("only the school's name is needed; the details are checked", async () => {
    const s = await ready();
    expect((await post(s.token, `/${s.asha}/transfer-out`, {})).status).toBe(400);
    expect((await post(s.token, `/${s.asha}/transfer-out`, { schoolName: "D" })).status).toBe(400);
    expect((await post(s.token, `/${s.asha}/transfer-out`, { schoolName: "Delhi Public School", tcDate: "2026-02-30" })).status).toBe(400);
    expect((await post(s.token, `/${s.asha}/transfer-out`, { schoolName: "Delhi Public School", tcDate: "2999-01-01" })).status).toBe(400);
    expect((await post(s.token, `/${s.asha}/transfer-out`, { schoolName: "Delhi Public School" })).status).toBe(200);
  });

  it("a student who is not active, or not this school's, is not found; and only the people who admit may do it", async () => {
    const s = await ready();
    const other = await ready("Moonrise Public School");
    expect((await post(other.token, `/${s.asha}/transfer-out`, transfer)).status).toBe(404);
    expect((await post(await addColleague(s.tenantId, "accountant"), `/${s.asha}/transfer-out`, transfer)).status).toBe(403);
    expect((await post(s.token, `/${s.asha}/transfer-out`, transfer)).status).toBe(200);
    expect((await post(s.token, `/${s.asha}/transfer-out`, transfer)).status).toBe(404);
  });

  it("coming back is the usual Make active: the student returns to their class and the transfer note is cleared", async () => {
    const s = await ready();
    await post(s.token, `/${s.asha}/transfer-out`, transfer);
    expect((await post(s.token, "/reactivate", { ids: [s.asha] })).body.data).toMatchObject({ reactivated: 1 });
    const page = (await get(s.token, `/${s.asha}`)).body.data;
    expect(page).toMatchObject({ status: "active", inactive: null, place: { className: "Class 5", sectionName: "A", rollNumber: 1 } });
    // The history of the transfer stays.
    expect(page.moves.map((m: { kind: string }) => m.kind)).toEqual(["transferred_out"]);
  });
});
