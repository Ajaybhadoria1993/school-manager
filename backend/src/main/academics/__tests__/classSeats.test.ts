import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { createSchool } from "../../../test/schools";
import { Tenant } from "../../tenants/models/Tenant";
import { SchoolClass } from "../models/SchoolClass";

const api = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

/** A school whose sections need no room, so these tests can talk about seats alone (that rule has its own tests). */
async function school(name = "Sunrise Public School") {
  const made = await createSchool(name);
  await Tenant.updateOne({ _id: made.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
  return made;
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a class has its seats", () => {
  it("is asked for when a class is made: no seats, 0, a fraction, a word or too many is refused and nothing is made", async () => {
    const { token, tenantId } = await school();
    const missing = await post(token, "/classes", { name: "Class 5", sectionCount: 0 });
    expect(missing.status).toBe(400);
    expect(details(missing)).toEqual([expect.objectContaining({ path: "capacity" })]);

    for (const capacity of [0, -5, 12.5, "40", null, 2001]) {
      const res = await post(token, "/classes", { name: "Class 5", sectionCount: 0, capacity });
      expect(res.status).toBe(400);
      expect(details(res)[0].path).toBe("capacity");
    }
    expect(await SchoolClass.countDocuments({ tenantId })).toBe(0);
  });

  it("is kept for a class with no sections at all, and shown in the class, the layout and the total", async () => {
    const { token } = await school();
    const made = await post(token, "/classes", { name: "Class 5", sectionCount: 0, capacity: 120 });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ name: "Class 5", capacity: 120, sections: [] });

    expect((await get(token, `/classes/${made.body.data.id}`)).body.data.capacity).toBe(120);
    const structure = (await get(token, "/structure")).body.data;
    expect(structure.classes[0]).toMatchObject({ name: "Class 5", capacity: 120 });
    expect(structure.totals.seats).toBe(120);
    expect((await get(token, "/classes")).body.data.items[0].capacity).toBe(120);

    await post(token, "/classes", { name: "Class 6", sectionCount: 0, capacity: 80 });
    expect((await get(token, "/structure")).body.data.totals.seats).toBe(200);
  });

  it("can be changed later, alone or with the name, and cannot be cleared", async () => {
    const { token } = await school();
    const klass = (await post(token, "/classes", { name: "Class 5", sectionCount: 0, capacity: 100 })).body.data;

    expect((await patch(token, `/classes/${klass.id}`, { capacity: 150 })).body.data).toMatchObject({ name: "Class 5", capacity: 150 });
    expect((await patch(token, `/classes/${klass.id}`, { name: "Class Five" })).body.data).toMatchObject({ name: "Class Five", capacity: 150 });
    expect((await patch(token, `/classes/${klass.id}`, { name: "Class 5", capacity: 90 })).body.data).toMatchObject({ name: "Class 5", capacity: 90 });

    for (const capacity of [null, 0, 2001, 1.5, "90"]) {
      const res = await patch(token, `/classes/${klass.id}`, { capacity });
      expect(res.status).toBe(400);
      expect(details(res)[0].path).toBe("capacity");
    }
    expect((await get(token, `/classes/${klass.id}`)).body.data.capacity).toBe(90);
  });

  it("is not set on a class made before seats existed or in bulk: it shows as null, can still be renamed, and counts for nothing", async () => {
    const { token, tenantId } = await school();
    await SchoolClass.create({ tenantId, name: "Old class", nameKey: "old class", order: 1 });
    const bulk = await post(token, "/quick-setup", { fromClass: "Nursery", toClass: "UKG", sectionsPerClass: 0 });
    expect(bulk.status).toBe(201);

    const structure = (await get(token, "/structure")).body.data;
    expect(structure.classes.every((c: { capacity: number | null }) => c.capacity === null)).toBe(true);
    expect(structure.totals.seats).toBe(0);

    const old = structure.classes.find((c: { name: string }) => c.name === "Old class");
    expect((await patch(token, `/classes/${old.id}`, { name: "Older class" })).status).toBe(200);
    expect((await patch(token, `/classes/${old.id}`, { capacity: 60 })).body.data.capacity).toBe(60);
  });

  it("belongs to one school: another school cannot read it or change it", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    const klass = (await post(a.token, "/classes", { name: "Class 5", sectionCount: 0, capacity: 100 })).body.data;

    expect((await patch(b.token, `/classes/${klass.id}`, { capacity: 5 })).status).toBe(404);
    expect((await get(b.token, `/classes/${klass.id}`)).status).toBe(404);
    expect((await get(b.token, "/structure")).body.data.totals.seats).toBe(0);
    expect((await get(a.token, `/classes/${klass.id}`)).body.data.capacity).toBe(100);
  });
});

describe("the sections of a class fit inside the class's seats", () => {
  let schools = 0;
  async function classOf(capacity: number | null) {
    const s = await school(`Seats School ${++schools}`);
    const klass = (await post(s.token, "/classes", { name: "Class 5", sectionCount: 0, capacity: capacity ?? 100 })).body.data;
    // A class without seats (older, or made in bulk) is what a null is.
    if (capacity === null) await SchoolClass.updateOne({ _id: klass.id, tenantId: s.tenantId }, { $unset: { capacity: 1 } });
    return { ...s, klass };
  }
  const section = (token: string, classId: string, name: string, capacity: number | null) =>
    post(token, `/classes/${classId}/sections`, { name, capacity });

  it("refuses a section that would take the sections past the class's seats, naming the seats box", async () => {
    const { token, klass } = await classOf(100);
    expect((await section(token, klass.id, "A", 40)).status).toBe(201);
    expect((await section(token, klass.id, "B", 40)).status).toBe(201);

    const over = await section(token, klass.id, "C", 30);
    expect(over.status).toBe(400);
    expect(over.body.code).toBe("SECTION_SEATS_OVER_CLASS");
    expect(details(over)).toEqual([{ path: "capacity", message: expect.stringContaining("20") }]);
    expect(over.body.message).toContain("Class 5");

    expect((await section(token, klass.id, "C", 20)).status).toBe(201);
    expect((await get(token, `/classes/${klass.id}`)).body.data.sections).toHaveLength(3);
  });

  it("checks a change of a section's seats the same way, counting the other sections but not itself", async () => {
    const { token, klass } = await classOf(100);
    const a = (await section(token, klass.id, "A", 40)).body.data;
    await section(token, klass.id, "B", 40);

    const over = await patch(token, `/sections/${a.id}`, { capacity: 61 });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe("SECTION_SEATS_OVER_CLASS");
    expect((await patch(token, `/sections/${a.id}`, { capacity: 60 })).body.data.capacity).toBe(60);
    // a rename keeps its own seats and so cannot trip the rule
    expect((await patch(token, `/sections/${a.id}`, { name: "Red" })).status).toBe(200);
  });

  it("does not stop a section with no seats, and does not apply to a class that has no seats set", async () => {
    const full = await classOf(100);
    await section(full.token, full.klass.id, "A", 100);
    expect((await section(full.token, full.klass.id, "B", null)).status).toBe(201);

    const none = await classOf(null);
    expect((await section(none.token, none.klass.id, "A", 200)).status).toBe(201);
  });

  it("refuses to lower the class's seats under what its sections already hold", async () => {
    const { token, klass } = await classOf(100);
    await section(token, klass.id, "A", 40);
    await section(token, klass.id, "B", 40);

    const low = await patch(token, `/classes/${klass.id}`, { capacity: 70 });
    expect(low.status).toBe(400);
    expect(low.body.code).toBe("CLASS_SEATS_BELOW_SECTIONS");
    expect(details(low)).toEqual([{ path: "capacity", message: expect.stringContaining("80") }]);
    expect((await get(token, `/classes/${klass.id}`)).body.data.capacity).toBe(100);

    expect((await patch(token, `/classes/${klass.id}`, { capacity: 80 })).body.data.capacity).toBe(80);
    // a name alone is never held up by it
    expect((await patch(token, `/classes/${klass.id}`, { name: "Class Five" })).status).toBe(200);
  });
});

describe("listing classes by their seats", () => {
  const list = (token: string, query: Record<string, string | number> = {}) => request(app).get(`${api}/classes`).set(auth(token)).query(query);
  const namesOf = (res: request.Response) => res.body.data.items.map((c: { name: string }) => c.name);

  async function schoolWithClasses() {
    const s = await school();
    for (const [name, capacity] of [["Class 1", 120], ["Class 2", 40], ["Class 3", 80]] as const) {
      await post(s.token, "/classes", { name, sectionCount: 0, capacity });
    }
    await SchoolClass.create({ tenantId: s.tenantId, name: "Class 4", nameKey: "class 4", order: 99 });
    return s;
  }

  it("filters by the class's own seats, and leaves out a class whose seats are not set", async () => {
    const { token } = await schoolWithClasses();
    expect(namesOf(await list(token, { seatsMax: 80 }))).toEqual(["Class 2", "Class 3"]);
    expect(namesOf(await list(token, { seatsMin: 80 }))).toEqual(["Class 1", "Class 3"]);
    expect(namesOf(await list(token, { seatsMin: 41, seatsMax: 100 }))).toEqual(["Class 3"]);
    expect(namesOf(await list(token, {}))).toHaveLength(4);
  });

  it("sorts by seats, either way", async () => {
    const { token } = await schoolWithClasses();
    expect(namesOf(await list(token, { sort: "seats", dir: "desc" })).slice(0, 3)).toEqual(["Class 1", "Class 3", "Class 2"]);
    expect(namesOf(await list(token, { sort: "seats", dir: "asc" })).slice(-3)).toEqual(["Class 2", "Class 3", "Class 1"]);
  });
});

describe("adding classes to a department", () => {
  it("needs the seats of each new class, but not of a class that is only moved in", async () => {
    const { token, tenantId } = await school();
    const dept = (await post(token, "/departments", { name: "Primary" })).body.data;
    const loose = (await post(token, "/classes", { name: "Class 1", sectionCount: 0, capacity: 50 })).body.data;

    const missing = await post(token, `/departments/${dept.id}/classes`, { names: ["Class 2"] });
    expect(missing.status).toBe(400);
    expect(details(missing)[0].path).toBe("capacity");
    expect(await SchoolClass.countDocuments({ tenantId })).toBe(1);

    const moved = await post(token, `/departments/${dept.id}/classes`, { classIds: [loose.id] });
    expect(moved.status).toBe(200);
    expect((await get(token, `/classes/${loose.id}`)).body.data).toMatchObject({ capacity: 50, departmentId: dept.id });

    const made = await post(token, `/departments/${dept.id}/classes`, { names: ["Class 2", "Class 3"], capacity: 45 });
    expect(made.status).toBe(200);
    const seats = (await get(token, "/structure")).body.data.classes.map((c: { name: string; capacity: number }) => [c.name, c.capacity]);
    expect(seats).toEqual([["Class 1", 50], ["Class 2", 45], ["Class 3", 45]]);
  });
});
