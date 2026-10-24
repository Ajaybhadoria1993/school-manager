import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Stands in for the Students module's counts, so the "students are in it" guards can be checked without admitting anyone. The real
// counts (and the guards with real students) are tested in students/__tests__/usage.test.ts.
vi.mock("../services/usage", () => ({
  studentCountsBySection: vi.fn(async () => new Map<string, number>()),
  enrolmentCountsByClass: vi.fn(async () => ({ thisYear: 0, otherYears: 0 })),
}));

import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Tenant } from "../../tenants/models/Tenant";
import { Department } from "../models/Department";
import { SchoolClass } from "../models/SchoolClass";
import { Section } from "../models/Section";
import { StructureService } from "../services/structure.service";
import { studentCountsBySection } from "../services/usage";

const api = "/api/v1/academics";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * A school for these tests: with seats and room made optional, as most of them add sections without either. (A school starts with
 * them required; that rule has its own tests in academicSettings.test.ts.)
 */
const school: typeof createSchool = async (name, role) => {
  const made = await createSchool(name, role);
  await Tenant.updateOne({ _id: made.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
  return made;
};
const colleague = addColleague;

const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);
const del = (token: string, path: string) => request(app).delete(`${api}${path}`).set(auth(token));

const structure = async (token: string) => (await get(token, "/structure")).body.data;
const sectionNames = (c: { sections: { name: string }[] }) => c.sections.map((s) => s.name);

beforeEach(async () => {
  vi.mocked(studentCountsBySection).mockReset();
  vi.mocked(studentCountsBySection).mockResolvedValue(new Map());
  await seedSuperAdmin();
});

describe("who may use it", () => {
  it("needs a signed-in user", async () => {
    const res = await request(app).get(`${api}/structure`);
    expect(res.status).toBe(401);
  });

  it("is not for the platform owner, who has no school", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({ email: "superadmin@example.com", password: "Admin@123" });
    const res = await get(login.body.data.accessToken, "/structure");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("is blocked until the school is approved", async () => {
    const { tenantId, token } = await school("Sunrise Public School");
    await Tenant.updateOne({ _id: tenantId }, { $set: { approvalStatus: "pending" } });
    const res = await get(token, "/structure");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TENANT_NOT_APPROVED");
  });

  it("lets a teacher look but not change", async () => {
    const { tenantId, token } = await school("Sunrise Public School");
    await post(token, "/classes", { name: "Class 1" });
    const teacher = await colleague(tenantId, "teacher");

    const read = await get(teacher, "/structure");
    expect(read.status).toBe(200);
    expect(read.body.data.classes).toHaveLength(1);

    const write = await post(teacher, "/classes", { name: "Class 2" });
    expect(write.status).toBe(403);
    expect(await SchoolClass.countDocuments({ tenantId })).toBe(1);
  });

  it("lets a principal change things too", async () => {
    const { tenantId } = await school("Sunrise Public School");
    const principal = await colleague(tenantId, "principal");
    expect((await post(principal, "/classes", { name: "Class 1" })).status).toBe(201);
  });
});

describe("a new school", () => {
  it("starts empty", async () => {
    const { token } = await createSchool("Sunrise Public School");
    expect(await structure(token)).toEqual({
      academicYear: null,
      settings: { sectionDetailsRequired: true },
      departments: [],
      classes: [],
      totals: { departments: 0, classes: 0, sections: 0, seats: 0 },
    });
  });
});

describe("departments", () => {
  it("are created, renamed and deleted", async () => {
    const { token } = await school("Sunrise Public School");

    const created = await post(token, "/departments", { name: "  Pre   Primary " });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Pre Primary", classCount: 0 });
    const id = created.body.data.id;

    const renamed = await patch(token, `/departments/${id}`, { name: "Kindergarten" });
    expect(renamed.body.data.name).toBe("Kindergarten");

    expect((await del(token, `/departments/${id}`)).status).toBe(200);
    expect((await structure(token)).departments).toEqual([]);
  });

  it("cannot have the same name twice, whatever the case", async () => {
    const { token } = await school("Sunrise Public School");
    await post(token, "/departments", { name: "Primary" });
    const again = await post(token, "/departments", { name: " primary " });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("DEPARTMENT_EXISTS");
  });

  it("two schools may use the same name", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    expect((await post(a.token, "/departments", { name: "Primary" })).status).toBe(201);
    expect((await post(b.token, "/departments", { name: "Primary" })).status).toBe(201);
  });

  it("rejects an empty name and angle brackets", async () => {
    const { token } = await school("Sunrise Public School");
    expect((await post(token, "/departments", { name: "   " })).status).toBe(400);
    expect((await post(token, "/departments", { name: "<b>Primary</b>" })).status).toBe(400);
  });

  it("deleting one keeps its classes, now without a department", async () => {
    const { token } = await school("Sunrise Public School");
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    await post(token, "/classes", { name: "Class 1", departmentId: dept.id });
    await post(token, "/classes", { name: "Class 2", departmentId: dept.id });

    const res = await del(token, `/departments/${dept.id}`);
    expect(res.body.data).toEqual({ unlinkedClasses: 2 });

    const s = await structure(token);
    expect(s.departments).toEqual([]);
    expect(s.classes.map((c: { departmentId: string | null }) => c.departmentId)).toEqual([null, null]);
  });
});

describe("putting classes in a department", () => {
  const classIdsOf = (names: string[], all: { id: string; name: string }[]) =>
    names.map((name) => all.find((c) => c.name === name)!.id);

  async function withLooseClasses(token: string) {
    for (const name of ["Nursery", "LKG", "UKG"]) await post(token, "/classes", { name, sectionCount: 0 });
    return (await structure(token)).classes as { id: string; name: string }[];
  }

  it("creates the department and puts the chosen classes in it, leaving the others alone", async () => {
    const { token } = await school("Sunrise Public School");
    const classes = await withLooseClasses(token);

    const res = await post(token, "/departments/assign", { name: "  Pre   Primary ", classIds: classIdsOf(["Nursery", "LKG"], classes) });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: true, assigned: 2, department: { name: "Pre Primary", classCount: 2 } });

    const s = await structure(token);
    const byName = Object.fromEntries(s.classes.map((c: { name: string; departmentId: string | null }) => [c.name, c.departmentId]));
    expect(byName.Nursery).toBe(res.body.data.department.id);
    expect(byName.LKG).toBe(res.body.data.department.id);
    expect(byName.UKG).toBeNull();
  });

  it("uses the department the school already has, whatever the case, and moves classes out of their old one", async () => {
    const { token } = await school("Sunrise Public School");
    const classes = await withLooseClasses(token);
    const primary = (await post(token, "/departments", { name: "Primary" })).body.data;
    const middle = (await post(token, "/departments", { name: "Middle" })).body.data;
    await patch(token, `/classes/${classes[2].id}`, { departmentId: middle.id });

    const res = await post(token, "/departments/assign", { name: " PRIMARY ", classIds: classIdsOf(["Nursery", "UKG"], classes) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: false, assigned: 2, department: { id: primary.id, name: "Primary", classCount: 2 } });
    expect((await structure(token)).departments).toHaveLength(2);
    expect((await structure(token)).departments.find((d: { id: string }) => d.id === middle.id).classCount).toBe(0);
  });

  it("can make just the department, and counts a class listed twice once", async () => {
    const { token } = await school("Sunrise Public School");
    const classes = await withLooseClasses(token);

    const only = await post(token, "/departments/assign", { name: "Junior Wing" });
    expect(only.body.data).toMatchObject({ created: true, assigned: 0, department: { classCount: 0 } });

    const twice = await post(token, "/departments/assign", { name: "Junior Wing", classIds: [classes[0].id, classes[0].id] });
    expect(twice.body.data).toMatchObject({ created: false, assigned: 1, department: { classCount: 1 } });
  });

  it("refuses a class that is not the school's, and then creates nothing", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    const mine = await withLooseClasses(a.token);
    const strangers = (await post(b.token, "/classes", { name: "Class 1" })).body.data;

    const res = await post(a.token, "/departments/assign", { name: "Primary", classIds: [mine[0].id, strangers.id] });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CLASS_NOT_FOUND");
    expect((await structure(a.token)).departments).toEqual([]);
    expect((await structure(b.token)).classes[0].departmentId).toBeNull();
  });

  it("checks the name and the ids", async () => {
    const { token } = await school("Sunrise Public School");
    expect((await post(token, "/departments/assign", { name: "   " })).status).toBe(400);
    expect((await post(token, "/departments/assign", { name: "<b>x</b>" })).status).toBe(400);
    expect((await post(token, "/departments/assign", { name: "Primary", classIds: ["nope"] })).status).toBe(400);
  });

  it("stops at the department limit for a new name, but still fills one it already has", async () => {
    const { token } = await school("Sunrise Public School");
    const classes = await withLooseClasses(token);
    for (let i = 1; i <= 15; i++) await post(token, "/departments", { name: `Wing ${i}` });

    const over = await post(token, "/departments/assign", { name: "One too many", classIds: [classes[0].id] });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("LIMIT_REACHED");
    expect((await structure(token)).classes[0].departmentId).toBeNull();

    const existing = await post(token, "/departments/assign", { name: "wing 3", classIds: [classes[0].id] });
    expect(existing.status).toBe(200);
    expect(existing.body.data.department.classCount).toBe(1);
  });

  it("is for the people who run the school", async () => {
    const { tenantId } = await school("Sunrise Public School");
    const teacher = await colleague(tenantId, "teacher");
    expect((await post(teacher, "/departments/assign", { name: "Primary" })).status).toBe(403);
  });
});

describe("filling a department from its own screen", () => {
  const names = (classes: { name: string }[]) => classes.map((c) => c.name);

  it("moves classes the school has and creates the ones it does not, with sections if asked", async () => {
    const { token } = await school("Sunrise Public School");
    const loose = (await post(token, "/classes", { name: "Hobby Club", sectionCount: 0 })).body.data;
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;

    const res = await post(token, `/departments/${dept.id}/classes`, { classIds: [loose.id], names: ["  Class   1 ", "Class 2"], sectionCount: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ moved: 1, created: 2, department: { id: dept.id, classCount: 3 } });

    const s = await structure(token);
    expect(s.classes.every((c: { departmentId: string }) => c.departmentId === dept.id)).toBe(true);
    const made = s.classes.find((c: { name: string }) => c.name === "Class 1");
    expect(sectionNames(made)).toEqual(["A", "B"]);
    expect(sectionNames(s.classes.find((c: { name: string }) => c.name === "Hobby Club"))).toEqual([]);
  });

  it("makes classes without sections unless asked", async () => {
    const { token } = await school("Sunrise Public School");
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    await post(token, `/departments/${dept.id}/classes`, { names: ["Class 1"] });
    expect(sectionNames((await structure(token)).classes[0])).toEqual([]);
  });

  it("puts a standard class where it belongs in the teaching order, a class of its own last", async () => {
    const { token } = await school("Sunrise Public School");
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    for (const name of ["Class 3", "Class 5"]) await post(token, "/classes", { name, sectionCount: 0 });

    await post(token, `/departments/${dept.id}/classes`, { names: ["Class 4", "Pre-Nursery", "Hobby Club", "Class 1"] });
    expect(names((await structure(token)).classes)).toEqual(["Pre-Nursery", "Class 1", "Class 3", "Class 4", "Class 5", "Hobby Club"]);

    // and a class added on its own (the Add class button) goes the same way
    await post(token, "/classes", { name: "Class 2", sectionCount: 0 });
    expect(names((await structure(token)).classes)).toEqual(["Pre-Nursery", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Hobby Club"]);
  });

  it("keeps the teaching order when a class is added behind classes of the school's own", async () => {
    const { token } = await school("Sunrise Public School");
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    for (const name of ["Class 11", "Hobby Club", "Class 13"]) await post(token, "/classes", { name, sectionCount: 0 });

    // A numbered class continues the count, so Class 13 goes right behind Class 11 when it is added, and Class 12 then goes
    // before Class 13; a class with a name of its own (Hobby Club) stays last.
    await post(token, `/departments/${dept.id}/classes`, { names: ["Class 12", "Class 10"] });
    expect(names((await structure(token)).classes)).toEqual(["Class 10", "Class 11", "Class 12", "Class 13", "Hobby Club"]);
  });

  it("puts a class that is first in the school at the front, and any class last in a school with no standard classes", async () => {
    const { token } = await school("Sunrise Public School");
    await post(token, "/classes", { name: "Class 2", sectionCount: 0 });
    await post(token, "/classes", { name: "Nursery", sectionCount: 0 });
    expect(names((await structure(token)).classes)).toEqual(["Nursery", "Class 2"]);

    const other = await school("Moonrise Public School");
    for (const name of ["Zeta", "Alpha"]) await post(other.token, "/classes", { name, sectionCount: 0 });
    expect(names((await structure(other.token)).classes)).toEqual(["Zeta", "Alpha"]);
  });

  it("refuses a class the school already has, and changes nothing", async () => {
    const { token } = await school("Sunrise Public School");
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const loose = (await post(token, "/classes", { name: "Nursery", sectionCount: 0 })).body.data;
    await post(token, "/classes", { name: "Class 1", sectionCount: 0 });

    const res = await post(token, `/departments/${dept.id}/classes`, { classIds: [loose.id], names: ["Class 2", "class 1"] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CLASS_EXISTS");
    const s = await structure(token);
    expect(names(s.classes)).toEqual(["Nursery", "Class 1"]);
    expect(s.classes.map((c: { departmentId: string | null }) => c.departmentId)).toEqual([null, null]);
  });

  it("refuses another school's class or department, and an empty request", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    const deptA = (await post(a.token, "/departments", { name: "Primary" })).body.data;
    const deptB = (await post(b.token, "/departments", { name: "Primary" })).body.data;
    const classB = (await post(b.token, "/classes", { name: "Class 1" })).body.data;

    const stranger = await post(a.token, `/departments/${deptA.id}/classes`, { classIds: [classB.id] });
    expect(stranger.status).toBe(404);
    expect(stranger.body.code).toBe("CLASS_NOT_FOUND");
    expect((await post(a.token, `/departments/${deptB.id}/classes`, { names: ["Class 1"] })).status).toBe(404);
    expect((await post(a.token, `/departments/${deptA.id}/classes`, {})).status).toBe(400);
    expect((await post(a.token, `/departments/${deptA.id}/classes`, { names: ["<b>x</b>"] })).status).toBe(400);
    expect((await post(a.token, `/departments/${deptA.id}/classes`, { names: ["Class 1"], sectionCount: 11 })).status).toBe(400);
    expect((await structure(b.token)).classes[0].departmentId).toBeNull();
  });

  it("stops at the class limit without creating any of them", async () => {
    const { token, tenantId } = await school("Sunrise Public School");
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    await SchoolClass.insertMany(
      Array.from({ length: 59 }, (_, i) => ({ tenantId, name: `Extra ${i}`, nameKey: `extra ${i}`, order: i + 1 }))
    );
    const res = await post(token, `/departments/${dept.id}/classes`, { names: ["Class 1", "Class 2"] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LIMIT_REACHED");
    expect(await SchoolClass.countDocuments({ tenantId })).toBe(59);
  });

  it("is for the people who run the school", async () => {
    const { tenantId, token } = await school("Sunrise Public School");
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const teacher = await colleague(tenantId, "teacher");
    expect((await post(teacher, `/departments/${dept.id}/classes`, { names: ["Class 1"] })).status).toBe(403);
  });
});

describe("listing classes: filter, sort and pages, all in the database", () => {
  const list = (token: string, query: Record<string, string | number> = {}) =>
    request(app).get(`${api}/classes`).set(auth(token)).query(query);
  const namesOf = (res: { body: { data: { items: { name: string }[] } } }) => res.body.data.items.map((c) => c.name);

  /** Makes a class with one section per entry of `seats` (null = a section without a limit). */
  async function makeClass(token: string, name: string, seats: (number | null)[] = [], departmentId?: string) {
    const made = (await post(token, "/classes", { name, sectionCount: 0, ...(departmentId ? { departmentId } : {}) })).body.data;
    for (const [i, capacity] of seats.entries()) {
      await post(token, `/classes/${made.id}/sections`, { name: String.fromCharCode(65 + i), capacity });
    }
    return made.id as string;
  }

  it("lists every class in teaching order with its sections, one page at a time", async () => {
    const { token } = await school("Sunrise Public School");
    for (const name of ["Class 10", "Nursery", "Class 2", "Class 1"]) await makeClass(token, name, [30]);

    const res = await list(token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 1, limit: 10, total: 4, totalPages: 1 });
    expect(namesOf(res)).toEqual(["Nursery", "Class 1", "Class 2", "Class 10"]);
    expect(res.body.data.items[0].sections).toEqual([expect.objectContaining({ name: "A", capacity: 30 })]);
  });

  it("cuts the list into pages and says how many there are in all", async () => {
    const { token } = await school("Sunrise Public School");
    for (let i = 1; i <= 7; i++) await makeClass(token, `Class ${i}`);

    const first = await list(token, { limit: 3 });
    expect(first.body.data).toMatchObject({ page: 1, limit: 3, total: 7, totalPages: 3 });
    expect(namesOf(first)).toEqual(["Class 1", "Class 2", "Class 3"]);
    expect(namesOf(await list(token, { limit: 3, page: 3 }))).toEqual(["Class 7"]);
    const past = await list(token, { limit: 3, page: 9 });
    expect(past.body.data).toMatchObject({ items: [], total: 7, totalPages: 3 });
  });

  it("finds classes by name: any case, any spacing, a part of the name, and a search is never a pattern", async () => {
    const { token } = await school("Sunrise Public School");
    for (const name of ["Nursery", "Class 1", "Class 10", "Class 12", "Class 2"]) await makeClass(token, name);

    expect(namesOf(await list(token, { search: "class 1" }))).toEqual(["Class 1", "Class 10", "Class 12"]);
    expect(namesOf(await list(token, { search: "  CLASS   1  " }))).toEqual(["Class 1", "Class 10", "Class 12"]);
    expect(namesOf(await list(token, { search: "nur" }))).toEqual(["Nursery"]);
    expect(namesOf(await list(token, { search: ".*" }))).toEqual([]);
    expect(namesOf(await list(token, { search: "" }))).toHaveLength(5);
  });

  it("filters by department, or by none", async () => {
    const { token } = await school("Sunrise Public School");
    const primary = (await post(token, "/departments", { name: "Primary" })).body.data;
    await makeClass(token, "Class 1", [], primary.id);
    await makeClass(token, "Class 2", [], primary.id);
    await makeClass(token, "Hobby Club");

    expect(namesOf(await list(token, { departmentId: primary.id }))).toEqual(["Class 1", "Class 2"]);
    expect(namesOf(await list(token, { departmentId: "none" }))).toEqual(["Hobby Club"]);
    expect(namesOf(await list(token, { departmentId: primary.id, search: "2" }))).toEqual(["Class 2"]);
    expect((await list(token, { departmentId: "not-an-id" })).status).toBe(400);
  });

  it("filters by seats (all of a class's sections added up); a class with no seats set is left out", async () => {
    const { token } = await school("Sunrise Public School");
    await makeClass(token, "Class 1", [30, 30]); // 60
    await makeClass(token, "Class 2", [40]); // 40
    await makeClass(token, "Class 3", [null]); // a section, but no limit
    await makeClass(token, "Class 4"); // no sections

    expect(namesOf(await list(token, { seatsMax: 50 }))).toEqual(["Class 2"]);
    expect(namesOf(await list(token, { seatsMin: 50 }))).toEqual(["Class 1"]);
    expect(namesOf(await list(token, { seatsMin: 40, seatsMax: 60 }))).toEqual(["Class 1", "Class 2"]);
    expect(namesOf(await list(token, { seatsMin: "", seatsMax: "" }))).toHaveLength(4);
    expect((await list(token, { seatsMin: 70, seatsMax: 60 })).status).toBe(400);
  });

  it("sorts by name (Class 2 before Class 10) or by seats, either way", async () => {
    const { token } = await school("Sunrise Public School");
    await makeClass(token, "Class 10", [20]);
    await makeClass(token, "Class 2", [50]);
    await makeClass(token, "Alpha", [35]);

    expect(namesOf(await list(token, { sort: "name" }))).toEqual(["Alpha", "Class 2", "Class 10"]);
    expect(namesOf(await list(token, { sort: "name", dir: "desc" }))).toEqual(["Class 10", "Class 2", "Alpha"]);
    expect(namesOf(await list(token, { sort: "seats", dir: "desc" }))).toEqual(["Class 2", "Alpha", "Class 10"]);
    expect(namesOf(await list(token, { sort: "seats" }))).toEqual(["Class 10", "Alpha", "Class 2"]);
  });

  it("refuses what makes no sense", async () => {
    const { token } = await school("Sunrise Public School");
    const refused: Record<string, string | number>[] = [
      { limit: 0 },
      { limit: 51 },
      { page: 0 },
      { sort: "colour" },
      { dir: "sideways" },
      { seatsMin: -1 },
      { seatsMax: "x" },
    ];
    for (const bad of refused) {
      expect((await list(token, bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("gets one class with its sections, and a teacher may read the list too", async () => {
    const { tenantId, token } = await school("Sunrise Public School");
    const id = await makeClass(token, "Class 5", [40, 35]);

    const one = await get(token, `/classes/${id}`);
    expect(one.status).toBe(200);
    expect(one.body.data).toMatchObject({ id, name: "Class 5" });
    expect(sectionNames(one.body.data)).toEqual(["A", "B"]);
    expect((await get(token, "/classes/000000000000000000000000")).status).toBe(404);

    const teacher = await colleague(tenantId, "teacher");
    expect((await list(teacher)).status).toBe(200);
    expect((await get(teacher, `/classes/${id}`)).status).toBe(200);
  });

  it("only ever shows the school's own classes", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    await makeClass(a.token, "Class 1", [40]);
    await makeClass(b.token, "Class 1", [40]);
    await makeClass(b.token, "Class 2", [40]);

    expect((await list(a.token, { seatsMin: 1 })).body.data.total).toBe(1);
    expect((await list(b.token)).body.data.total).toBe(2);
  });
});

describe("classes", () => {
  it("start with section A, or as many as asked", async () => {
    const { token } = await school("Sunrise Public School");
    const one = await post(token, "/classes", { name: "Class 1" });
    expect(one.status).toBe(201);
    expect(sectionNames(one.body.data)).toEqual(["A"]);

    const three = await post(token, "/classes", { name: "Class 2", sectionCount: 3 });
    expect(sectionNames(three.body.data)).toEqual(["A", "B", "C"]);

    const none = await post(token, "/classes", { name: "Class 3", sectionCount: 0 });
    expect(none.body.data.sections).toEqual([]);

    expect((await post(token, "/classes", { name: "Class 4", sectionCount: 11 })).status).toBe(400);
  });

  it("go in the order they were added", async () => {
    const { token } = await school("Sunrise Public School");
    for (const name of ["Nursery", "LKG", "Class 1"]) await post(token, "/classes", { name });
    expect((await structure(token)).classes.map((c: { name: string }) => c.name)).toEqual(["Nursery", "LKG", "Class 1"]);
  });

  it("cannot have the same name twice, whatever the case or the spaces", async () => {
    const { token } = await school("Sunrise Public School");
    await post(token, "/classes", { name: "Class 5" });
    const again = await post(token, "/classes", { name: "class   5" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CLASS_EXISTS");
    expect((await structure(token)).totals.classes).toBe(1);
  });

  it("can be put in a department, moved, and taken out of it", async () => {
    const { token } = await school("Sunrise Public School");
    const primary = (await post(token, "/departments", { name: "Primary" })).body.data;
    const middle = (await post(token, "/departments", { name: "Middle" })).body.data;
    const klass = (await post(token, "/classes", { name: "Class 5", departmentId: primary.id })).body.data;
    expect(klass.departmentId).toBe(primary.id);

    const moved = await patch(token, `/classes/${klass.id}`, { departmentId: middle.id });
    expect(moved.body.data.departmentId).toBe(middle.id);
    expect((await structure(token)).departments.map((d: { classCount: number }) => d.classCount)).toEqual([1, 0]);

    const cleared = await patch(token, `/classes/${klass.id}`, { departmentId: null });
    expect(cleared.body.data.departmentId).toBeNull();
  });

  it("cannot be put in another school's department", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    const foreign = (await post(b.token, "/departments", { name: "Primary" })).body.data;

    const res = await post(a.token, "/classes", { name: "Class 1", departmentId: foreign.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DEPARTMENT_NOT_FOUND");
    expect(await SchoolClass.countDocuments({ tenantId: a.tenantId })).toBe(0);
  });

  it("are renamed, and a rename cannot clash with another class", async () => {
    const { token } = await school("Sunrise Public School");
    const first = (await post(token, "/classes", { name: "Class 1" })).body.data;
    await post(token, "/classes", { name: "Class 2" });

    expect((await patch(token, `/classes/${first.id}`, { name: "First" })).body.data.name).toBe("First");
    const clash = await patch(token, `/classes/${first.id}`, { name: "class 2" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("CLASS_EXISTS");
    expect((await patch(token, `/classes/${first.id}`, {})).status).toBe(400);
  });

  it("are deleted together with their sections", async () => {
    const { token, tenantId } = await school("Sunrise Public School");
    const klass = (await post(token, "/classes", { name: "Class 1", sectionCount: 3 })).body.data;
    await post(token, "/classes", { name: "Class 2", sectionCount: 2 });

    const res = await del(token, `/classes/${klass.id}`);
    expect(res.body.data).toEqual({ removedSections: 3 });
    expect(await SchoolClass.countDocuments({ tenantId })).toBe(1);
    expect(await Section.countDocuments({ tenantId })).toBe(2);
  });

  it("cannot be deleted while students are in one of its sections", async () => {
    const { token, tenantId } = await school("Sunrise Public School");
    const klass = (await post(token, "/classes", { name: "Class 1", sectionCount: 2 })).body.data;
    vi.mocked(studentCountsBySection).mockResolvedValue(new Map([[klass.sections[1].id, 3]]));

    const res = await del(token, `/classes/${klass.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CLASS_HAS_STUDENTS");
    expect(res.body.message).toContain("3 students");
    expect(await SchoolClass.countDocuments({ tenantId })).toBe(1);
    expect(await Section.countDocuments({ tenantId })).toBe(2);
  });

  it("report a missing class as 404", async () => {
    const { token } = await school("Sunrise Public School");
    const ghost = "64b000000000000000000000";
    expect((await patch(token, `/classes/${ghost}`, { name: "X" })).status).toBe(404);
    expect((await del(token, `/classes/${ghost}`)).status).toBe(404);
    expect((await patch(token, "/classes/not-an-id", { name: "X" })).status).toBe(400);
  });
});

describe("the order departments are shown in", () => {
  it("follows the order of their first class, empty departments last", async () => {
    const { tenantId, token } = await school("Sunrise Public School");
    const ids: string[] = [];
    for (const name of ["Nursery", "LKG", "UKG"]) ids.push((await post(token, "/classes", { name })).body.data.id);
    const primary = (await post(token, "/departments", { name: "Primary" })).body.data;
    const early = (await post(token, "/departments", { name: "Pre-Primary" })).body.data;
    const unused = (await post(token, "/departments", { name: "Archive" })).body.data;
    await patch(token, `/classes/${ids[0]}`, { departmentId: early.id });
    await patch(token, `/classes/${ids[2]}`, { departmentId: primary.id });

    const names = () => structure(token).then((s) => s.departments.map((d: { name: string }) => d.name));
    expect(await names()).toEqual(["Pre-Primary", "Primary", "Archive"]);
    // Put UKG (Primary) first and Nursery (Pre-Primary) last: the departments follow their first class.
    for (const [index, id] of [ids[2], ids[1], ids[0]].entries()) await SchoolClass.updateOne({ _id: id, tenantId }, { $set: { order: index + 1 } });
    expect(await names()).toEqual(["Primary", "Pre-Primary", "Archive"]);
    expect(unused.classCount).toBe(0);
  });
});

describe("sections", () => {
  async function oneClass() {
    const s = await school("Sunrise Public School");
    const klass = (await post(s.token, "/classes", { name: "Class 11", sectionCount: 0 })).body.data;
    return { ...s, klass };
  }

  it("are added with a capacity and a room, both optional when the school makes them so", async () => {
    const { token, klass } = await oneClass();
    const plain = await post(token, `/classes/${klass.id}/sections`, { name: "Science" });
    expect(plain.status).toBe(201);
    expect(plain.body.data).toMatchObject({ name: "Science", capacity: null, room: null, classId: klass.id });

    const full = await post(token, `/classes/${klass.id}/sections`, { name: "Commerce", capacity: 40, room: "  Room 12 " });
    expect(full.body.data).toMatchObject({ name: "Commerce", capacity: 40, room: "Room 12" });
  });

  it("cannot repeat a name in the same class, but another class may use it", async () => {
    const { token, klass } = await oneClass();
    const other = (await post(token, "/classes", { name: "Class 12", sectionCount: 0 })).body.data;
    await post(token, `/classes/${klass.id}/sections`, { name: "A" });

    const again = await post(token, `/classes/${klass.id}/sections`, { name: "a" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("SECTION_EXISTS");
    expect((await post(token, `/classes/${other.id}/sections`, { name: "A" })).status).toBe(201);
  });

  it("check the capacity", async () => {
    const { token, klass } = await oneClass();
    for (const capacity of [0, -5, 2.5, 201, "forty"]) {
      const res = await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity });
      expect(res.status).toBe(400);
    }
  });

  it("are changed, and capacity and room can be cleared", async () => {
    const { token, klass } = await oneClass();
    const section = (await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity: 40, room: "Room 1" })).body.data;

    const changed = await patch(token, `/sections/${section.id}`, { name: "B", capacity: 35 });
    expect(changed.body.data).toMatchObject({ name: "B", capacity: 35, room: "Room 1" });

    const cleared = await patch(token, `/sections/${section.id}`, { capacity: null, room: "" });
    expect(cleared.body.data).toMatchObject({ capacity: null, room: null });
  });

  it("cannot be renamed to a name the class already has", async () => {
    const { token, klass } = await oneClass();
    await post(token, `/classes/${klass.id}/sections`, { name: "A" });
    const b = (await post(token, `/classes/${klass.id}/sections`, { name: "B" })).body.data;
    const res = await patch(token, `/sections/${b.id}`, { name: "A" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SECTION_EXISTS");
  });

  it("are listed in a natural order inside their class", async () => {
    const { token, klass } = await oneClass();
    for (const name of ["B", "10", "A", "2"]) await post(token, `/classes/${klass.id}/sections`, { name });
    const s = await structure(token);
    expect(sectionNames(s.classes[0])).toEqual(["2", "10", "A", "B"]);
  });

  it("are deleted, unless students are in them", async () => {
    const { token, tenantId, klass } = await oneClass();
    const keep = (await post(token, `/classes/${klass.id}/sections`, { name: "A" })).body.data;
    const drop = (await post(token, `/classes/${klass.id}/sections`, { name: "B" })).body.data;

    vi.mocked(studentCountsBySection).mockResolvedValue(new Map([[keep.id, 1]]));
    const blocked = await del(token, `/sections/${keep.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("SECTION_HAS_STUDENTS");
    expect(blocked.body.message).toContain("1 student.");

    expect((await del(token, `/sections/${drop.id}`)).status).toBe(200);
    expect(await Section.countDocuments({ tenantId })).toBe(1);
  });

  it("add up in the totals", async () => {
    const { token, klass } = await oneClass();
    await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity: 40 });
    await post(token, `/classes/${klass.id}/sections`, { name: "B", capacity: 35 });
    await post(token, `/classes/${klass.id}/sections`, { name: "C" });
    expect((await structure(token)).totals).toEqual({ departments: 0, classes: 1, sections: 3, seats: 75 });
  });

  it("report a missing class or section as 404", async () => {
    const { token } = await oneClass();
    const ghost = "64b000000000000000000000";
    expect((await post(token, `/classes/${ghost}/sections`, { name: "A" })).status).toBe(404);
    expect((await patch(token, `/sections/${ghost}`, { name: "A" })).status).toBe(404);
    expect((await del(token, `/sections/${ghost}`)).status).toBe(404);
  });
});

describe("quick setup", () => {
  it("creates the usual classes, departments and sections for a range", async () => {
    const { token } = await school("Sunrise Public School");
    const res = await post(token, "/quick-setup", { fromClass: "Nursery", toClass: "3", sectionsPerClass: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ departmentsCreated: 2, classesCreated: 6, classesSkipped: 0, sectionsCreated: 12 });

    const s = await structure(token);
    expect(s.classes.map((c: { name: string }) => c.name)).toEqual(["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3"]);
    expect(s.classes.every((c: { sections: unknown[] }) => c.sections.length === 2)).toBe(true);
    expect(s.departments).toEqual([
      expect.objectContaining({ name: "Pre-Primary", classCount: 3 }),
      expect.objectContaining({ name: "Primary", classCount: 3 }),
    ]);
  });

  it("puts every level in its usual department", async () => {
    const { token } = await school("Sunrise Public School");
    await post(token, "/quick-setup", { fromClass: "Pre-Nursery", toClass: "12", sectionsPerClass: 1 });
    const s = await structure(token);
    expect(s.departments.map((d: { name: string; classCount: number }) => [d.name, d.classCount])).toEqual([
      ["Pre-Primary", 4],
      ["Primary", 5],
      ["Middle", 3],
      ["Secondary", 2],
      ["Senior Secondary", 2],
    ]);
    expect(s.totals).toMatchObject({ classes: 16, sections: 16 });
  });

  it("can be run again: what exists is left exactly as it is", async () => {
    const { token } = await school("Sunrise Public School");
    const mine = (await post(token, "/classes", { name: "class 2", sectionCount: 1 })).body.data;
    await patch(token, `/sections/${mine.sections[0].id}`, { capacity: 33 });

    const first = await post(token, "/quick-setup", { fromClass: "1", toClass: "3", sectionsPerClass: 3 });
    expect(first.body.data).toEqual({ departmentsCreated: 1, classesCreated: 2, classesSkipped: 1, sectionsCreated: 6 });

    const again = await post(token, "/quick-setup", { fromClass: "1", toClass: "3", sectionsPerClass: 3 });
    expect(again.body.data).toEqual({ departmentsCreated: 0, classesCreated: 0, classesSkipped: 3, sectionsCreated: 0 });

    const s = await structure(token);
    expect(s.totals).toMatchObject({ classes: 3, sections: 7 });
    const kept = s.classes.find((c: { name: string }) => c.name === "class 2");
    expect(kept.sections).toHaveLength(1);
    expect(kept.sections[0].capacity).toBe(33);
  });

  it("reuses a department the school already has", async () => {
    const { token, tenantId } = await school("Sunrise Public School");
    await post(token, "/departments", { name: "primary" });
    const res = await post(token, "/quick-setup", { fromClass: "1", toClass: "2", sectionsPerClass: 1 });
    expect(res.body.data.departmentsCreated).toBe(0);
    expect(await Department.countDocuments({ tenantId })).toBe(1);
  });

  it("can make the classes without any sections, which are then added class by class", async () => {
    const { token } = await school("Sunrise Public School");
    const res = await post(token, "/quick-setup", { fromClass: "Nursery", toClass: "UKG", sectionsPerClass: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ classesCreated: 3, sectionsCreated: 0 });

    const s = await structure(token);
    expect(s.classes.map((c: { name: string }) => c.name)).toEqual(["Nursery", "LKG", "UKG"]);
    expect(s.classes.every((c: { sections: unknown[] }) => c.sections.length === 0)).toBe(true);
    expect(s.totals).toMatchObject({ classes: 3, sections: 0, seats: 0 });

    expect((await post(token, `/classes/${s.classes[1].id}/sections`, { name: "A" })).status).toBe(201);
    expect(sectionNames((await structure(token)).classes[1])).toEqual(["A"]);
  });

  it("rejects a range that runs backwards, and unknown classes", async () => {
    const { token } = await school("Sunrise Public School");
    expect((await post(token, "/quick-setup", { fromClass: "5", toClass: "2", sectionsPerClass: 1 })).status).toBe(400);
    expect((await post(token, "/quick-setup", { fromClass: "Class 5", toClass: "8", sectionsPerClass: 1 })).status).toBe(400);
    expect((await post(token, "/quick-setup", { fromClass: "1", toClass: "5", sectionsPerClass: -1 })).status).toBe(400);
    expect((await post(token, "/quick-setup", { fromClass: "1", toClass: "5", sectionsPerClass: 7 })).status).toBe(400);
  });
});

describe("approving a school", () => {
  /** A school that is waiting for the platform's decision, with the class range it gave at sign-up (or none). */
  async function pendingSchool(range?: { lowest: string; highest: string }) {
    const sunrise = await school("Sunrise Public School");
    const $set: Record<string, unknown> = { approvalStatus: "pending" };
    if (range) Object.assign($set, { "profile.lowestClass": range.lowest, "profile.highestClass": range.highest });
    await Tenant.updateOne({ _id: sunrise.tenantId }, { $set });
    return sunrise;
  }

  async function approve(tenantId: string) {
    const login = await request(app).post("/api/v1/auth/login").send({ email: "superadmin@example.com", password: "Admin@123" });
    return request(app)
      .post(`/api/v1/tenants/${tenantId}/approve`)
      .set(auth(login.body.data.accessToken))
      .send({});
  }

  it("starts its classes from the range it gave at sign-up, without sections", async () => {
    const { tenantId, token } = await pendingSchool({ lowest: "Nursery", highest: "2" });
    expect((await approve(tenantId)).status).toBe(200);

    const s = await structure(token);
    expect(s.classes.map((c: { name: string }) => c.name)).toEqual(["Nursery", "LKG", "UKG", "Class 1", "Class 2"]);
    expect(s.totals.sections).toBe(0);
    expect(s.departments.map((d: { name: string }) => d.name)).toEqual(["Pre-Primary", "Primary"]);
  });

  it("leaves the classes empty when the school gave no range, and still approves it", async () => {
    const { tenantId, token } = await pendingSchool();
    expect((await approve(tenantId)).status).toBe(200);
    expect((await structure(token)).classes).toEqual([]);
  });

  it("is still approved when starting the classes fails", async () => {
    const { tenantId } = await pendingSchool({ lowest: "Nursery", highest: "2" });
    const failing = vi.spyOn(StructureService, "startFromProfile").mockRejectedValueOnce(new Error("database hiccup"));

    expect((await approve(tenantId)).status).toBe(200);
    expect(failing).toHaveBeenCalledTimes(1);
    expect((await Tenant.findById(tenantId).lean())?.approvalStatus).toBe("approved");
    failing.mockRestore();
  });

  it("does not touch classes the school already made", async () => {
    const { tenantId, token } = await pendingSchool({ lowest: "Nursery", highest: "2" });
    await Tenant.updateOne({ _id: tenantId }, { $set: { approvalStatus: "approved" } });
    const mine = (await post(token, "/classes", { name: "nursery", sectionCount: 2 })).body.data;
    await Tenant.updateOne({ _id: tenantId }, { $set: { approvalStatus: "pending" } });

    expect((await approve(tenantId)).status).toBe(200);
    const s = await structure(token);
    expect(s.classes).toHaveLength(5);
    expect(sectionNames(s.classes.find((c: { id: string }) => c.id === mine.id))).toEqual(["A", "B"]);
  });
});

describe("one school cannot reach another's layout", () => {
  it("sees, changes and deletes only its own", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");

    const dept = (await post(a.token, "/departments", { name: "Primary" })).body.data;
    const klass = (await post(a.token, "/classes", { name: "Class 1", departmentId: dept.id })).body.data;
    const section = klass.sections[0];

    expect((await structure(b.token)).classes).toEqual([]);
    expect((await structure(b.token)).departments).toEqual([]);

    expect((await patch(b.token, `/departments/${dept.id}`, { name: "Hacked" })).status).toBe(404);
    expect((await del(b.token, `/departments/${dept.id}`)).status).toBe(404);
    expect((await patch(b.token, `/classes/${klass.id}`, { name: "Hacked" })).status).toBe(404);
    expect((await del(b.token, `/classes/${klass.id}`)).status).toBe(404);
    expect((await post(b.token, `/classes/${klass.id}/sections`, { name: "Z" })).status).toBe(404);
    expect((await patch(b.token, `/sections/${section.id}`, { name: "Z" })).status).toBe(404);
    expect((await del(b.token, `/sections/${section.id}`)).status).toBe(404);

    const mine = await structure(a.token);
    expect(mine.departments[0].name).toBe("Primary");
    expect(mine.classes[0].name).toBe("Class 1");
    expect(sectionNames(mine.classes[0])).toEqual(["A"]);
  });
});
