import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Tenant } from "../../tenants/models/Tenant";
import { Section } from "../models/Section";

const api = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);
const put = (token: string, path: string, body: object) => request(app).put(`${api}${path}`).set(auth(token)).send(body);

const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the school's switch: a section's seats and room are required", () => {
  async function schoolWithAClass() {
    const s = await createSchool("Sunrise Public School");
    const klass = (await post(s.token, "/classes", { name: "Class 5", sectionCount: 0 })).body.data;
    return { ...s, klass };
  }

  it("is on for a school that never chose, and is shown with the layout", async () => {
    const { token } = await schoolWithAClass();
    expect((await get(token, "/settings")).body.data).toEqual({ sectionDetailsRequired: true });
    expect((await get(token, "/structure")).body.data.settings).toEqual({ sectionDetailsRequired: true });
  });

  it("refuses a new section without its seats or its room, naming each missing box, and creates nothing", async () => {
    const { token, tenantId, klass } = await schoolWithAClass();

    const neither = await post(token, `/classes/${klass.id}/sections`, { name: "A" });
    expect(neither.status).toBe(400);
    expect(neither.body.code).toBe("SECTION_DETAILS_REQUIRED");
    expect(details(neither)).toEqual([
      { path: "capacity", message: "Enter the seats" },
      { path: "room", message: "Enter the room" },
    ]);

    const noRoom = await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity: 40 });
    expect(details(noRoom)).toEqual([{ path: "room", message: "Enter the room" }]);
    const noSeats = await post(token, `/classes/${klass.id}/sections`, { name: "A", room: "Room 1" });
    expect(details(noSeats)).toEqual([{ path: "capacity", message: "Enter the seats" }]);
    // null and an empty room are "not given" too
    expect((await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity: null, room: null })).status).toBe(400);
    expect((await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity: 40, room: "   " })).status).toBe(400);

    expect(await Section.countDocuments({ tenantId, classId: klass.id })).toBe(0);
    const ok = await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity: 40, room: "Room 1" });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ name: "A", capacity: 40, room: "Room 1" });
  });

  it("still checks the other rules first-hand (a bad capacity, a missing class), and a missing class is a 404, not a 400", async () => {
    const { token, klass } = await schoolWithAClass();
    const bad = await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity: 500, room: "Room 1" });
    expect(bad.status).toBe(400);
    expect(details(bad)[0].path).toBe("capacity");
    expect((await post(token, "/classes/64b000000000000000000000/sections", { name: "A" })).status).toBe(404);
  });

  it("applies to a change too: the section as it will be needs seats and room, so they cannot be cleared", async () => {
    const { token, klass } = await schoolWithAClass();
    const section = (await post(token, `/classes/${klass.id}/sections`, { name: "A", capacity: 40, room: "Room 1" })).body.data;

    const clearSeats = await patch(token, `/sections/${section.id}`, { capacity: null });
    expect(clearSeats.status).toBe(400);
    expect(details(clearSeats)).toEqual([{ path: "capacity", message: "Enter the seats" }]);
    expect((await patch(token, `/sections/${section.id}`, { room: "" })).status).toBe(400);
    // a change that keeps them is fine, whichever boxes it names
    expect((await patch(token, `/sections/${section.id}`, { name: "B" })).status).toBe(200);
    expect((await patch(token, `/sections/${section.id}`, { capacity: 35, room: "Room 2" })).body.data).toMatchObject({ capacity: 35, room: "Room 2" });
    expect((await get(token, `/classes/${klass.id}`)).body.data.sections[0]).toMatchObject({ name: "B", capacity: 35, room: "Room 2" });
  });

  it("completes a section that never had its seats or room the first time it is changed (bulk-made sections, older sections)", async () => {
    const { token, tenantId } = await schoolWithAClass();
    // Sections made together with their class, or before the rule, have neither.
    const made = (await post(token, "/classes", { name: "Class 6", sectionCount: 2 })).body.data;
    expect(made.sections.map((s: { capacity: number | null }) => s.capacity)).toEqual([null, null]);

    const renameOnly = await patch(token, `/sections/${made.sections[0].id}`, { name: "Red" });
    expect(renameOnly.status).toBe(400);
    expect(details(renameOnly).map((d) => d.path)).toEqual(["capacity", "room"]);
    expect((await patch(token, `/sections/${made.sections[0].id}`, { name: "Red", capacity: 30, room: "Room 3" })).status).toBe(200);
    expect(await Section.countDocuments({ tenantId, name: "B", capacity: null })).toBe(1);
  });

  it("can be switched off by the school's administrators, then seats and room are optional again; switching it back changes no data", async () => {
    const { tenantId, token, klass } = await schoolWithAClass();
    expect((await post(token, `/classes/${klass.id}/sections`, { name: "A" })).status).toBe(400);

    const off = await put(token, "/settings", { sectionDetailsRequired: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toEqual({ sectionDetailsRequired: false });
    expect((await Tenant.findById(tenantId))?.settings?.sectionDetailsRequired).toBe(false);
    expect((await get(token, "/structure")).body.data.settings).toEqual({ sectionDetailsRequired: false });

    const plain = await post(token, `/classes/${klass.id}/sections`, { name: "A" });
    expect(plain.status).toBe(201);
    expect(plain.body.data).toMatchObject({ capacity: null, room: null });

    await put(token, "/settings", { sectionDetailsRequired: true });
    expect((await get(token, `/classes/${klass.id}`)).body.data.sections).toHaveLength(1);
    expect((await post(token, `/classes/${klass.id}/sections`, { name: "B" })).status).toBe(400);
  });

  it("is changed only by the people who run the school, with a real on or off, and each school has its own", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const teacher = await addColleague(a.tenantId, "teacher");

    expect((await put(teacher, "/settings", { sectionDetailsRequired: false })).status).toBe(403);
    expect((await get(teacher, "/settings")).status).toBe(200);
    for (const body of [{}, { sectionDetailsRequired: "no" }, { sectionDetailsRequired: null }]) {
      expect((await put(a.token, "/settings", body)).status).toBe(400);
    }
    expect((await request(app).put(`${api}/settings`).send({ sectionDetailsRequired: false })).status).toBe(401);

    await put(a.token, "/settings", { sectionDetailsRequired: false });
    expect((await get(a.token, "/settings")).body.data.sectionDetailsRequired).toBe(false);
    expect((await get(b.token, "/settings")).body.data.sectionDetailsRequired).toBe(true);
  });
});
