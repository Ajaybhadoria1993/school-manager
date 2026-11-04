import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { AcademicYear } from "../models/AcademicYear";
import { Section } from "../models/Section";

const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${academics}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${academics}${path}`).set(auth(token)).send(body);

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };
const NEXT = { name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

/** A school with its year and Class 5 with sections A (40 seats, room 5A) and B (30 seats). */
async function ready(name = "Sunrise Public School") {
  const s = await createSchool(name);
  await post(s.token, "/academic-years/initial", YEAR);
  const klass = (await post(s.token, "/classes", { name: "Class 5", capacity: 2000, sectionCount: 0 })).body.data;
  await post(s.token, `/classes/${klass.id}/sections`, { name: "A", capacity: 40, room: "5A" });
  await post(s.token, `/classes/${klass.id}/sections`, { name: "B", capacity: 30, room: "5B" });
  return { ...s, classId: klass.id as string };
}

describe("the next academic year", () => {
  it("lists the school's years, newest first, with their state", async () => {
    const s = await ready();
    await post(s.token, "/academic-years", NEXT);
    const res = await get(s.token, "/academic-years");
    expect(res.status).toBe(200);
    expect(res.body.data.map((y: { name: string; status: string }) => [y.name, y.status])).toEqual([
      ["2027-2028", "pending"],
      ["2026-2027", "active"],
    ]);
    expect(res.body.data[0]).toMatchObject({ startDate: "2027-04-01", endDate: "2028-03-31" });
  });

  it("is made pending, with the sections of the running year copied into it (names, seats and rooms)", async () => {
    const s = await ready();
    const res = await post(s.token, "/academic-years", NEXT);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ name: "2027-2028", status: "pending", sectionsCopied: 2 });

    const copied = await Section.find({ tenantId: s.tenantId, academicYearId: res.body.data.id }).sort({ nameKey: 1 }).lean();
    expect(copied.map((x) => [x.name, x.capacity, x.room])).toEqual([["A", 40, "5A"], ["B", 30, "5B"]]);
    expect(copied.every((x) => x.classId.toString() === s.classId)).toBe(true);
  });

  it("does not change what the school sees today: the class screens and the counts are still the running year's", async () => {
    const s = await ready();
    const before = (await get(s.token, "/structure")).body.data;
    await post(s.token, "/academic-years", NEXT);
    const after = (await get(s.token, "/structure")).body.data;
    expect(after.academicYear.name).toBe("2026-2027");
    expect(after.totals).toEqual(before.totals);
    expect(after.classes[0].sections.map((x: { id: string }) => x.id)).toEqual(before.classes[0].sections.map((x: { id: string }) => x.id));
    expect((await get(s.token, "/academic-years/current")).body.data.year.name).toBe("2026-2027");
  });

  it("can be made without the sections", async () => {
    const s = await ready();
    const res = await post(s.token, "/academic-years", { ...NEXT, copySections: false });
    expect(res.body.data.sectionsCopied).toBe(0);
    expect(await Section.countDocuments({ tenantId: s.tenantId, academicYearId: res.body.data.id })).toBe(0);
  });

  it("is refused with a message that tells what to change", async () => {
    const s = await ready();
    const code = async (body: object) => (await post(s.token, "/academic-years", body)).body;
    expect((await code({})).details).toEqual(expect.arrayContaining([{ path: "name", message: expect.any(String) }]));
    expect((await code({ ...NEXT, startDate: "2027-03-31" })).details).toEqual([{ path: "startDate", message: "The next year must start after the running year ends (31 Mar 2027)" }]);
    expect((await code({ ...NEXT, endDate: "2027-04-01" })).details).toEqual([{ path: "endDate", message: "The end date must be after the start date" }]);
    expect((await post(s.token, "/academic-years", NEXT)).status).toBe(201);
    // One next year at a time, and never the same name twice.
    const again = await post(s.token, "/academic-years", { ...NEXT, name: "2028-2029", startDate: "2028-04-01", endDate: "2029-03-31" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("NEXT_YEAR_EXISTS");
  });

  it("needs a running year, and is for the people who run the school", async () => {
    const empty = await createSchool("Newhope Public School");
    expect((await post(empty.token, "/academic-years", NEXT)).status).toBe(409);
    const s = await ready();
    expect((await post(await addColleague(s.tenantId, "accountant"), "/academic-years", NEXT)).status).toBe(403);
    const teacher = await addColleague(s.tenantId, "teacher");
    expect((await post(teacher, "/academic-years", NEXT)).status).toBe(403);
    expect((await get(teacher, "/academic-years")).status).toBe(200);
    expect((await post(await addColleague(s.tenantId, "principal"), "/academic-years", NEXT)).status).toBe(201);
  });

  it("each school has its own years", async () => {
    const a = await ready();
    const b = await ready("Moonrise Public School");
    await post(a.token, "/academic-years", NEXT);
    expect((await get(b.token, "/academic-years")).body.data).toHaveLength(1);
    expect(await AcademicYear.countDocuments({ tenantId: a.tenantId })).toBe(2);
  });
});

describe("switching the next year on", () => {
  it("closes the running year and makes the next one the school's year, with its own sections; only the school admin may", async () => {
    const s = await ready();
    const next = (await post(s.token, "/academic-years", NEXT)).body.data;
    expect((await post(await addColleague(s.tenantId, "principal"), `/academic-years/${next.id}/activate`)).status).toBe(403);

    const res = await post(s.token, `/academic-years/${next.id}/activate`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ name: "2027-2028", status: "active" });
    const years = (await get(s.token, "/academic-years")).body.data;
    expect(years.map((y: { name: string; status: string }) => [y.name, y.status])).toEqual([["2027-2028", "active"], ["2026-2027", "closed"]]);
    const structure = (await get(s.token, "/structure")).body.data;
    expect(structure.academicYear.name).toBe("2027-2028");
    expect(structure.classes[0].sections.map((x: { name: string }) => x.name)).toEqual(["A", "B"]);
    // The old year's sections are still there, untouched.
    expect(await Section.countDocuments({ tenantId: s.tenantId })).toBe(4);
  });

  it("only a year that is waiting can be switched on, and only the school's own", async () => {
    const s = await ready();
    const other = await ready("Moonrise Public School");
    const next = (await post(s.token, "/academic-years", NEXT)).body.data;
    const current = (await get(s.token, "/academic-years/current")).body.data.year;
    expect((await post(s.token, `/academic-years/${current.id}/activate`)).status).toBe(409);
    expect((await post(other.token, `/academic-years/${next.id}/activate`)).status).toBe(404);
    expect((await post(s.token, "/academic-years/64b000000000000000000001/activate")).status).toBe(404);
    expect((await post(s.token, "/academic-years/nope/activate")).status).toBe(400);
    expect((await post(s.token, `/academic-years/${next.id}/activate`)).status).toBe(200);
    expect((await post(s.token, `/academic-years/${next.id}/activate`)).status).toBe(409);
  });
});
