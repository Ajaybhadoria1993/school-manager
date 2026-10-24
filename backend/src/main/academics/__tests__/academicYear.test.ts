import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Tenant } from "../../tenants/models/Tenant";
import { AcademicYear } from "../models/AcademicYear";
import { Section } from "../models/Section";

const api = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);

const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

beforeEach(async () => {
  await seedSuperAdmin();
});

// `createSchool` makes an approved school directly, the way schools were made before academic years existed: it has none.
describe("a school approved before academic years existed", () => {
  it("is told it has no year, and only its administrators may name the one that is running", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    expect((await get(token, "/academic-years/current")).body.data).toEqual({ year: null, needsSetUp: true });

    const teacher = await addColleague(tenantId, "teacher");
    expect((await get(teacher, "/academic-years/current")).status).toBe(200);
    expect((await post(teacher, "/academic-years/initial", YEAR)).status).toBe(403);

    const wrong = await post(token, "/academic-years/initial", { ...YEAR, endDate: "2026-03-01" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.details).toEqual([{ path: "endDate", message: "The end date must be after the start date" }]);

    const made = await post(token, "/academic-years/initial", YEAR);
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: "active" });
    expect((await get(token, "/academic-years/current")).body.data).toEqual({ year: made.body.data, needsSetUp: false });

    // Only once.
    expect((await post(token, "/academic-years/initial", { ...YEAR, name: "2027-2028" })).status).toBe(409);
    expect(await AcademicYear.countDocuments({ tenantId })).toBe(1);
  });

  it("cannot end up with two active years, even when asked twice at the same moment", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const answers = await Promise.all([
      post(token, "/academic-years/initial", YEAR),
      post(token, "/academic-years/initial", { ...YEAR, name: "2026-27" }),
      post(token, "/academic-years/initial", { ...YEAR, name: "Session 2026" }),
    ]);
    expect(answers.map((a) => a.status).sort()).toEqual([201, 409, 409]);
    expect(await AcademicYear.countDocuments({ tenantId, status: "active" })).toBe(1);
  });

  it("gives the sections it already had to the year it names, and leaves another school's alone", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const classA = (await post(a.token, "/classes", { name: "Class 5", sectionCount: 2 })).body.data;
    const classB = (await post(b.token, "/classes", { name: "Class 5", sectionCount: 1 })).body.data;
    expect(await Section.countDocuments({ tenantId: a.tenantId, academicYearId: null })).toBe(2);

    const year = (await post(a.token, "/academic-years/initial", YEAR)).body.data;
    const sections = await Section.find({ tenantId: a.tenantId, classId: classA.id }).lean();
    expect(sections.map((s) => String(s.academicYearId))).toEqual([year.id, year.id]);
    expect(await Section.countDocuments({ tenantId: b.tenantId, classId: classB.id, academicYearId: null })).toBe(1);

    // The screens show them as before, now for this year.
    const structure = (await get(a.token, "/structure")).body.data;
    expect(structure.academicYear).toEqual({ id: year.id, name: "2026-2027" });
    expect(structure.classes[0].sections.map((s: { name: string }) => s.name)).toEqual(["A", "B"]);
  });
});

describe("sections belong to one academic year", () => {
  /** A school with its active year and Class 5 (sections A and B), plus another session's section A of the same class. */
  async function schoolWithTwoSessions() {
    const s = await createSchool("Sunrise Public School");
    // These tests add sections by name only, so the school makes seats and room optional (they are required by default).
    await Tenant.updateOne({ _id: s.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
    const year = (await post(s.token, "/academic-years/initial", YEAR)).body.data;
    const klass = (await post(s.token, "/classes", { name: "Class 5", sectionCount: 2 })).body.data;
    const lastYear = await AcademicYear.create({
      tenantId: s.tenantId,
      name: "2025-2026",
      nameKey: "2025-2026",
      startDate: new Date("2025-04-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      status: "closed",
      source: "school",
      closedAt: new Date(),
    });
    // Last session's records stay as they were: the same name "A" in the same class is a different section.
    await Section.create({ tenantId: s.tenantId, classId: klass.id, academicYearId: lastYear._id, name: "A", nameKey: "a", capacity: 30 });
    return { ...s, year, klass, lastYear };
  }

  it("refuses the same name twice in a class within one year, but another year may have its own", async () => {
    const { token, tenantId, klass, year } = await schoolWithTwoSessions();
    const again = await post(token, `/classes/${klass.id}/sections`, { name: "a" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("SECTION_EXISTS");
    expect(await Section.countDocuments({ tenantId, classId: klass.id })).toBe(3);

    const c = await post(token, `/classes/${klass.id}/sections`, { name: "C" });
    expect(c.status).toBe(201);
    expect(String((await Section.findOne({ tenantId, _id: c.body.data.id }).lean())?.academicYearId)).toBe(year.id);
  });

  it("shows only the current year's sections on every screen, and counts only them", async () => {
    const { token, klass } = await schoolWithTwoSessions();
    const structure = (await get(token, "/structure")).body.data;
    expect(structure.classes[0].sections.map((s: { name: string }) => s.name)).toEqual(["A", "B"]);
    expect(structure.totals).toMatchObject({ sections: 2, seats: 0 });
    expect((await get(token, `/classes/${klass.id}`)).body.data.sections).toHaveLength(2);
    const page = (await get(token, "/classes")).body.data;
    expect(page.items[0].sections).toHaveLength(2);
  });

  it("keeps a closed year's sections when the year is read again (nothing is moved or deleted)", async () => {
    const { tenantId, lastYear } = await schoolWithTwoSessions();
    const old = await Section.find({ tenantId, academicYearId: lastYear._id }).lean();
    expect(old).toMatchObject([{ name: "A", capacity: 30 }]);
    expect(await AcademicYear.findOne({ tenantId, _id: lastYear._id }).lean()).toMatchObject({ status: "closed" });
  });

  it("is enforced by the database: a second active year for a school is refused", async () => {
    const { tenantId } = await schoolWithTwoSessions();
    await expect(
      AcademicYear.create({
        tenantId: new Types.ObjectId(tenantId),
        name: "Another",
        nameKey: "another",
        startDate: new Date("2027-04-01T00:00:00.000Z"),
        endDate: new Date("2028-03-31T00:00:00.000Z"),
        status: "active",
        source: "school",
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe("the history of other academic years is kept", () => {
  async function schoolWithLastYear() {
    const s = await createSchool("Sunrise Public School");
    await Tenant.updateOne({ _id: s.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
    await post(s.token, "/academic-years/initial", YEAR);
    const klass = (await post(s.token, "/classes", { name: "Class 5", sectionCount: 1 })).body.data;
    const lastYear = await AcademicYear.create({
      tenantId: s.tenantId,
      name: "2025-2026",
      nameKey: "2025-2026",
      startDate: new Date("2025-04-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      status: "closed",
      source: "school",
      closedAt: new Date(),
    });
    const old = await Section.create({ tenantId: s.tenantId, classId: klass.id, academicYearId: lastYear._id, name: "A", nameKey: "a", capacity: 30, room: "Room 1" });
    return { ...s, klass, old };
  }

  it("will not change or delete a section of another year from the current one", async () => {
    const { token, tenantId, old } = await schoolWithLastYear();
    const change = await request(app).patch(`${api}/sections/${old._id}`).set(auth(token)).send({ capacity: 99 });
    expect(change.status).toBe(409);
    expect(change.body.code).toBe("SECTION_OTHER_YEAR");
    const remove = await request(app).delete(`${api}/sections/${old._id}`).set(auth(token));
    expect(remove.status).toBe(409);
    expect(remove.body.code).toBe("SECTION_OTHER_YEAR");
    expect(await Section.findOne({ tenantId, _id: old._id }).lean()).toMatchObject({ capacity: 30, room: "Room 1" });
  });

  it("will not delete a class that holds sections of another year, and says why; the other year's sections stay", async () => {
    const { token, tenantId, klass, old } = await schoolWithLastYear();
    const res = await request(app).delete(`${api}/classes/${klass.id}`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CLASS_HAS_HISTORY");
    expect(await Section.countDocuments({ tenantId, classId: klass.id })).toBe(2);
    expect(await Section.exists({ tenantId, _id: old._id })).toBeTruthy();
  });

  it("still deletes a class whose sections are all of the current year", async () => {
    const s = await createSchool("Moonrise Public School");
    await post(s.token, "/academic-years/initial", YEAR);
    const klass = (await post(s.token, "/classes", { name: "Class 6", sectionCount: 2 })).body.data;
    expect((await request(app).delete(`${api}/classes/${klass.id}`).set(auth(s.token))).status).toBe(200);
    expect(await Section.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });
});
