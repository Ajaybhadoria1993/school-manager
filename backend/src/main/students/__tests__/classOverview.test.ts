import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const acad = (token: string, path: string, body: object) => request(app).post(`${academics}${path}`).set(auth(token)).send(body);

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

/**
 * A school with Primary (Class 1 without sections, Class 5 with A of 40 seats, B of 2 and C with no limit), Middle (Class 6 with A of 30)
 * and Class 9 in no department. Students: Asha and Bina in 5-A, Chitra in 5-B, Dev in Class 1.
 */
async function ready(name = "Sunrise Public School") {
  const s = await createSchool(name);
  await acad(s.token, "/academic-years/initial", YEAR);
  // A section may have no seat limit and no room (they are required until the school says otherwise).
  await request(app).put(`${academics}/settings`).set(auth(s.token)).send({ sectionDetailsRequired: false });
  const primary = (await acad(s.token, "/departments", { name: "Primary" })).body.data;
  const middle = (await acad(s.token, "/departments", { name: "Middle" })).body.data;
  const klass = async (className: string, departmentId: string | null) => (await acad(s.token, "/classes", { name: className, departmentId, capacity: 2000, sectionCount: 0 })).body.data.id as string;
  const section = async (classId: string, sectionName: string, capacity: number | null) =>
    (await acad(s.token, `/classes/${classId}/sections`, { name: sectionName, capacity, room: capacity === null ? null : `Room ${sectionName}` })).body.data.id as string;
  const c1 = await klass("Class 1", primary.id);
  const c5 = await klass("Class 5", primary.id);
  const c6 = await klass("Class 6", middle.id);
  const c9 = await klass("Class 9", null);
  const a = await section(c5, "A", 40);
  const b = await section(c5, "B", 2);
  const c = await section(c5, "C", null);
  const m = await section(c6, "A", 30);
  const admit = async (firstName: string, classId: string, sectionId: string | null, mobile: string) => {
    const res = await post(s.token, "", {
      firstName,
      lastName: "Verma",
      gender: "Female",
      dateOfBirth: "2016-05-14",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      previousSchool: { name: "Little Flower School" },
      classId,
      sectionId,
      guardians: [{ name: `Father of ${firstName}`, relation: "Father", isPrimary: true, mobile }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  };
  const asha = await admit("Asha", c5, a, "9000000001");
  const bina = await admit("Bina", c5, a, "9000000002");
  const chitra = await admit("Chitra", c5, b, "9000000003");
  const dev = await admit("Dev", c1, null, "9000000004");
  return { ...s, primary: primary.id as string, middle: middle.id as string, c1, c5, c6, c9, a, b, c, m, asha, bina, chitra, dev };
}

type Overview = { departments: { id: string; name: string }[]; summary: Record<string, number>; classes: { id: string; name: string; students: number; departmentName: string | null; seats: number; seatsLeft: number; percent: number; sections: { id: string; name: string; enrolled: number; capacity: number | null; seatsLeft: number | null; state: string; percent: number; room: string | null }[] }[] };
const overview = async (token: string, query = "") => (await get(token, `/class-overview${query}`)).body.data as Overview;
const names = (o: Overview) => o.classes.map((c) => c.name);

describe("the classes at a glance (every filter is the server's)", () => {
  it("lists every class in teaching order with its department, its students and each section's students and seats", async () => {
    const s = await ready();
    const o = await overview(s.token);
    expect(names(o)).toEqual(["Class 1", "Class 5", "Class 6", "Class 9"]);
    expect(o.classes.map((c) => [c.name, c.students, c.departmentName])).toEqual([
      ["Class 1", 1, "Primary"],
      ["Class 5", 3, "Primary"],
      ["Class 6", 0, "Middle"],
      ["Class 9", 0, null],
    ]);
    const five = o.classes[1];
    expect(five.sections.map((x) => [x.name, x.enrolled, x.capacity, x.seatsLeft, x.state, x.room])).toEqual([
      ["A", 2, 40, 38, "open", "Room A"],
      ["B", 1, 2, 1, "open", "Room B"],
      ["C", 0, null, null, "unlimited", null],
    ]);
    // Seats are the sum of the limits that were set (40 + 2), and how many of them are used (2 + 1).
    expect(five).toMatchObject({ seats: 42, seatsLeft: 39, percent: 7 });
    // A class without sections has its own seat limit (2000 here), and its students use it (2026-11-04).
    expect(o.classes[0]).toMatchObject({ seats: 2000, seatsLeft: 1999, percent: 0, sections: [] });
    expect(o.departments.map((d) => d.name)).toEqual(["Primary", "Middle"]);
    expect(o.summary).toMatchObject({ classes: 4, sections: 4, students: 4, seats: 4072, seatsLeft: 4068 });
  });

  it("a class's seats: its sections' seats added up (3 sections of 40 = 120), or its own limit when it has no sections, or none when nothing is set", async () => {
    const s = await ready();
    const make = async (name: string, capacity: number | null) => (await acad(s.token, "/classes", { name, departmentId: null, capacity, sectionCount: 0 })).body.data.id as string;
    const seven = await make("Class 7", 120);
    const sevenA = (await acad(s.token, `/classes/${seven}/sections`, { name: "A", capacity: 40, room: "Room 7A" })).body.data.id as string;
    for (const n of ["B", "C"]) await acad(s.token, `/classes/${seven}/sections`, { name: n, capacity: 40, room: `Room 7${n}` });
    const eight = await make("Class 8", 40);
    const admit = (firstName: string, classId: string, sectionId: string | null, mobile: string) =>
      post(s.token, "", {
        firstName,
        lastName: "Shah",
        gender: "Male",
        dateOfBirth: "2015-02-02",
        address: { line1: "1 Park Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
        previousSchool: { name: "Little Flower School" },
        classId,
        sectionId,
        guardians: [{ name: `Father of ${firstName}`, relation: "Father", isPrimary: true, mobile }],
      });
    expect((await admit("Kunal", seven, sevenA, "9000000011")).status).toBe(201);
    expect((await admit("Lalit", seven, sevenA, "9000000012")).status).toBe(201);
    for (const [i, n] of ["Manu", "Neel", "Om", "Pari"].entries()) expect((await admit(n, eight, null, `900000002${i}`)).status).toBe(201);

    const o = await overview(s.token);
    const byName = (n: string) => o.classes.find((c) => c.name === n)!;
    expect(byName("Class 7")).toMatchObject({ students: 2, seats: 120, seatsLeft: 118, percent: 2 });
    expect(byName("Class 8")).toMatchObject({ students: 4, seats: 40, seatsLeft: 36, percent: 10 });
  });

  it("a section at its limit is full, and one from 85% is almost full", async () => {
    const s = await ready();
    const body = (firstName: string, mobile: string) => ({
      firstName,
      lastName: "Rao",
      gender: "Male",
      dateOfBirth: "2016-01-01",
      address: { line1: "4 Lake View", city: "Indore", state: "Madhya Pradesh", pincode: "452001" },
      previousSchool: { name: "Little Flower School" },
      classId: s.c5,
      sectionId: s.b,
      guardians: [{ name: `Father of ${firstName}`, relation: "Father", isPrimary: true, mobile }],
    });
    expect((await post(s.token, "", body("Esha", "9000000005"))).status).toBe(201);
    const full = (await overview(s.token, `?classId=${s.c5}`)).classes[0].sections.find((x) => x.name === "B")!;
    expect(full).toMatchObject({ enrolled: 2, seatsLeft: 0, state: "full", percent: 100 });
  });

  it("filters by department, by 'none' (no department), by class and by part of a class name", async () => {
    const s = await ready();
    expect(names(await overview(s.token, `?departmentId=${s.primary}`))).toEqual(["Class 1", "Class 5"]);
    expect(names(await overview(s.token, `?departmentId=${s.middle}`))).toEqual(["Class 6"]);
    expect(names(await overview(s.token, "?departmentId=none"))).toEqual(["Class 9"]);
    expect(names(await overview(s.token, `?classId=${s.c5}`))).toEqual(["Class 5"]);
    expect(names(await overview(s.token, "?q=%20class%20%205"))).toEqual(["Class 5"]);
    expect(names(await overview(s.token, "?q=6"))).toEqual(["Class 6"]);
    expect(names(await overview(s.token, `?departmentId=${s.middle}&q=5`))).toEqual([]);
    // The summary and the department list follow the filter (the summary), or stay whole (the departments, for the dropdown).
    const middle = await overview(s.token, `?departmentId=${s.middle}`);
    expect(middle.summary).toMatchObject({ classes: 1, students: 0, seats: 30 });
    expect(middle.departments.map((d) => d.name)).toEqual(["Primary", "Middle"]);
  });

  it("does not count students who are inactive", async () => {
    const s = await ready();
    await post(s.token, "/deactivate", { ids: [s.asha, s.dev] });
    const o = await overview(s.token);
    expect(o.classes.map((c) => [c.name, c.students])).toEqual([["Class 1", 0], ["Class 5", 2], ["Class 6", 0], ["Class 9", 0]]);
    expect(o.classes[1].sections.map((x) => x.enrolled)).toEqual([1, 1, 0]);
    expect(o.summary.students).toBe(2);
  });

  it("wrong filters are refused with a message", async () => {
    const s = await ready();
    expect((await get(s.token, "/class-overview?classId=nope")).status).toBe(400);
    expect((await get(s.token, "/class-overview?departmentId=nope")).status).toBe(400);
  });

  it("is for the people who may read students, and each school sees only its own classes", async () => {
    const s = await ready();
    const other = await ready("Moonrise Public School");
    expect((await get(await addColleague(s.tenantId, "accountant"), "/class-overview")).status).toBe(200);
    expect((await get(await addColleague(s.tenantId, "teacher"), "/class-overview")).status).toBe(403);
    expect((await get(other.token, `/class-overview?classId=${s.c5}`)).body.data.classes).toEqual([]);
    expect((await overview(other.token)).summary.students).toBe(4);
  });

  it("a school without an academic year has nothing to count", async () => {
    const s = await createSchool("Newhope Public School");
    const res = await get(s.token, "/class-overview");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ academicYear: null, classes: [], summary: { classes: 0, students: 0 } });
  });
});

describe("the student list filtered by department", () => {
  const listed = async (token: string, query: string) => ((await get(token, `?limit=50${query}`)).body.data.items as { name: string }[]).map((i) => i.name);

  it("shows the students of the classes of a department, or of the classes in none, and combines with the class and the search", async () => {
    const s = await ready();
    expect(await listed(s.token, `&departmentId=${s.primary}`)).toEqual(["Dev Verma", "Asha Verma", "Bina Verma", "Chitra Verma"]);
    expect(await listed(s.token, `&departmentId=${s.middle}`)).toEqual([]);
    expect(await listed(s.token, "&departmentId=none")).toEqual([]);
    expect(await listed(s.token, `&departmentId=${s.primary}&classId=${s.c5}&sectionId=${s.b}`)).toEqual(["Chitra Verma"]);
    expect(await listed(s.token, `&departmentId=${s.primary}&q=bina`)).toEqual(["Bina Verma"]);
    // A class from another department gives nobody, not the whole class.
    expect(await listed(s.token, `&departmentId=${s.middle}&classId=${s.c5}`)).toEqual([]);
    expect((await get(s.token, "?departmentId=nope")).status).toBe(400);
  });

  it("shows only the boys or only the girls, with the other filters", async () => {
    const s = await ready();
    const eshan = await post(s.token, "", {
      firstName: "Eshan",
      lastName: "Rao",
      gender: "Male",
      dateOfBirth: "2016-01-01",
      address: { line1: "4 Lake View", city: "Indore", state: "Madhya Pradesh", pincode: "452001" },
      previousSchool: { name: "Little Flower School" },
      classId: s.c5,
      sectionId: s.a,
      guardians: [{ name: "Father of Eshan", relation: "Father", isPrimary: true, mobile: "9000000009" }],
    });
    expect(eshan.status, JSON.stringify(eshan.body)).toBe(201);
    expect(await listed(s.token, "&gender=Male")).toEqual(["Eshan Rao"]);
    expect(await listed(s.token, "&gender=Female")).toEqual(["Dev Verma", "Asha Verma", "Bina Verma", "Chitra Verma"]);
    expect(await listed(s.token, `&gender=Female&classId=${s.c5}&sectionId=${s.a}`)).toEqual(["Asha Verma", "Bina Verma"]);
    expect(await listed(s.token, "&gender=Male&q=asha")).toEqual([]);
    // The count and the pages follow the filter.
    expect((await get(s.token, "?gender=Male")).body.data).toMatchObject({ total: 1, totalPages: 1 });
    expect((await get(s.token, "?gender=Robot")).status).toBe(400);
  });
});
