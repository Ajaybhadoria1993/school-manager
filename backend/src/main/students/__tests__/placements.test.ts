import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { MOVABLE_FIELDS } from "../constants";
import { StudentSettings } from "../models/StudentSettings";

const api = "/api/v1/students";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string) => request(app).get(`${api}/settings`).set(auth(token));
const put = (token: string, body: object) => request(app).put(`${api}/settings`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

/** The details a school may move between the steps of Add student, in the order a new school has them. */
const DEFAULT = MOVABLE_FIELDS.map((f) => ({ key: f.key, step: f.step }));
const HOUSE = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };
const BUS = { key: "c_buspass", label: "Bus pass", type: "text", options: [], mode: "optional" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("where each detail goes on Add student (the school's own steps)", () => {
  it("a new school has every movable detail in its usual step: the blood group with the student, the school records and the Aadhaar number in Academic, the family's in Parents, the rest in More details", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await get(s.token);
    expect(res.body.data.placements).toEqual(DEFAULT);
    expect(res.body.data.placementsAreDefault).toBe(true);
    const step = (key: string) => res.body.data.placements.find((p: { key: string }) => p.key === key).step;
    expect([step("bloodGroup"), step("srNumber"), step("pen"), step("aadhaarNumber")]).toEqual(["personal", "academic", "academic", "academic"]);
    expect([step("emergencyMobile"), step("rteSeat"), step("bpl")]).toEqual(["parents", "parents", "parents"]);
    expect([step("religion"), step("samagraId"), step("apaarId"), step("nationality"), step("transportStop")]).toEqual(["more", "more", "more", "more", "more"]);
    // What no school can move is not on the list: the name, the class, the parents, the address...
    const keys = res.body.data.placements.map((p: { key: string }) => p.key);
    for (const fixed of ["firstName", "gender", "dateOfBirth", "category", "classId", "guardians", "addressLine1", "previousSchoolName", "admissionDate"]) expect(keys).not.toContain(fixed);
  });

  it("a field of the school's own joins the end of More details, and a second one after it", async () => {
    const s = await createSchool("Sunrise Public School");
    await put(s.token, { customFields: [HOUSE] });
    let res = await get(s.token);
    expect(res.body.data.placements).toEqual([...DEFAULT, { key: "c_house1", step: "more" }]);
    expect(res.body.data.placementsAreDefault).toBe(true);
    await put(s.token, { customFields: [HOUSE, BUS] });
    res = await get(s.token);
    expect(res.body.data.placements.slice(-2)).toEqual([
      { key: "c_house1", step: "more" },
      { key: "c_buspass", step: "more" },
    ]);
  });

  it("moves a detail to another step and puts it where it was dropped: the answer is the saved order, the list is kept as sent", async () => {
    const s = await createSchool("Sunrise Public School");
    await put(s.token, { customFields: [HOUSE] });
    const moved = [
      { key: "c_house1", step: "academic" },
      { key: "aadhaarNumber", step: "academic" },
      { key: "bloodGroup", step: "parents" },
      ...DEFAULT.filter((p) => !["aadhaarNumber", "bloodGroup"].includes(p.key)),
    ];
    const saved = await put(s.token, { placements: moved });
    expect(saved.status).toBe(200);
    expect(saved.body.data.placements).toEqual(moved);
    expect(saved.body.data.placementsAreDefault).toBe(false);
    expect((await get(s.token)).body.data.placements).toEqual(moved);
    expect((await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.placements).toHaveLength(moved.length);
  });

  it("a list that leaves some details out is completed: each left-out detail goes to the end of its usual step", async () => {
    const s = await createSchool("Sunrise Public School");
    const saved = await put(s.token, { placements: [{ key: "pen", step: "parents" }] });
    expect(saved.status).toBe(200);
    const list = saved.body.data.placements as { key: string; step: string }[];
    expect(list[0]).toEqual({ key: "pen", step: "parents" });
    expect(list).toHaveLength(DEFAULT.length);
    expect(list.slice(1)).toEqual(DEFAULT.filter((p) => p.key !== "pen"));
  });

  it("the usual places sent back mean 'no places of our own': nothing is kept, and the school is on the default again", async () => {
    const s = await createSchool("Sunrise Public School");
    await put(s.token, { placements: [{ key: "pen", step: "parents" }] });
    const back = await put(s.token, { placements: DEFAULT });
    expect(back.body.data.placementsAreDefault).toBe(true);
    expect((await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.placements ?? null).toBeNull();
    // null says it too.
    await put(s.token, { placements: [{ key: "pen", step: "parents" }] });
    const reset = await put(s.token, { placements: null });
    expect(reset.body.data.placements).toEqual(DEFAULT);
    expect(reset.body.data.placementsAreDefault).toBe(true);
  });

  it("refuses, under the entry that is wrong: a detail no school can move, an unknown one, an unknown step, one detail twice", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await put(s.token, {
      placements: [
        { key: "firstName", step: "academic" },
        { key: "pen", step: "kitchen" },
        { key: "religion", step: "more" },
        { key: "religion", step: "personal" },
        { key: "nothing", step: "more" },
      ],
    });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([
      { path: "placements.0.key", message: "This detail cannot be moved" },
      { path: "placements.1.step", message: "Choose Personal info, Academic, Parents, More details or a step of your own" },
      { path: "placements.3.key", message: "This detail is placed once" },
      { path: "placements.4.key", message: "This detail cannot be moved" },
    ]);
    // A field of its own the school does not have is said by the school's settings (the list itself is right).
    const none = await put(s.token, { placements: [{ key: "c_house1", step: "more" }] });
    expect(none.status).toBe(400);
    expect(details(none)).toEqual([{ path: "placements.0.key", message: "Your school has no such field of its own" }]);
    expect((await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.placements ?? null).toBeNull();
    expect((await put(s.token, { placements: "more" })).status).toBe(400);
    expect((await put(s.token, { placements: [] })).status).toBe(400);
  });

  it("a field added in the same save can be placed in it; a field deleted leaves its place", async () => {
    const s = await createSchool("Sunrise Public School");
    const both = await put(s.token, { customFields: [HOUSE, BUS], placements: [{ key: "c_buspass", step: "personal" }, { key: "c_house1", step: "academic" }] });
    expect(both.status).toBe(200);
    expect(both.body.data.placements.slice(0, 2)).toEqual([
      { key: "c_buspass", step: "personal" },
      { key: "c_house1", step: "academic" },
    ]);
    const deleted = await put(s.token, { customFields: [BUS] });
    expect(deleted.body.data.placements.map((p: { key: string }) => p.key)).not.toContain("c_house1");
    expect(deleted.body.data.placements[0]).toEqual({ key: "c_buspass", step: "personal" });
    const stored = (await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.placements ?? [];
    expect(stored.map((p) => p.key)).not.toContain("c_house1");
  });

  it("only the people who change the school's fields may place them; a teacher cannot even read them", async () => {
    const s = await createSchool("Sunrise Public School");
    const accountant = await addColleague(s.tenantId, "accountant");
    const teacher = await addColleague(s.tenantId, "teacher");
    expect((await put(accountant, { placements: [{ key: "pen", step: "academic" }] })).status).toBe(403);
    expect((await get(teacher)).status).toBe(403);
    const principal = await addColleague(s.tenantId, "principal");
    expect((await put(principal, { placements: [{ key: "pen", step: "academic" }] })).status).toBe(200);
  });

  it("nothing is shared between schools: another school keeps its own places and its own fields, and cannot place a field it does not have", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Greater School");
    await put(a.token, { customFields: [HOUSE], placements: [{ key: "c_house1", step: "personal" }, { key: "pen", step: "parents" }] });

    const seenByB = await get(b.token);
    expect(seenByB.body.data.customFields).toEqual([]);
    expect(seenByB.body.data.placements).toEqual(DEFAULT);
    expect(seenByB.body.data.placementsAreDefault).toBe(true);

    // B's own save never touches A's.
    await put(b.token, { placements: [{ key: "srNumber", step: "more" }] });
    const seenByA = await get(a.token);
    expect(seenByA.body.data.placements.slice(0, 2)).toEqual([
      { key: "c_house1", step: "personal" },
      { key: "pen", step: "parents" },
    ]);

    // A field of A's is not a field of B's.
    const stolen = await put(b.token, { placements: [{ key: "c_house1", step: "more" }] });
    expect(stolen.status).toBe(400);
    expect(details(stolen)).toEqual([{ path: "placements.0.key", message: "Your school has no such field of its own" }]);
    expect(await StudentSettings.countDocuments({ tenantId: a.tenantId })).toBe(1);
  });
});
