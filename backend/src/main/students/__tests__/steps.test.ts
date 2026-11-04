import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { createSchool } from "../../../test/schools";
import { StudentSettings } from "../models/StudentSettings";

const api = "/api/v1/students";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string) => request(app).get(`${api}/settings`).set(auth(token));
const put = (token: string, body: object) => request(app).put(`${api}/settings`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const MORE = { key: "more", name: "More details" };
const HEALTH = { key: "s_health1", name: "Health" };
const DOCS = { key: "s_docs001", name: "Documents" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a school's own steps on Add student", () => {
  it("a new school has More details as its one step beyond Personal info, Academic and Parents", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await get(s.token);
    expect(res.body.data.steps).toEqual([MORE]);
    expect(res.body.data.stepsAreDefault).toBe(true);
  });

  it("the details a new school does not ask are shared out over the four steps, so no step is much longer than another", async () => {
    const s = await createSchool("Sunrise Public School");
    const places = (await get(s.token)).body.data.placements as { key: string; step: string }[];
    const count = (step: string) => places.filter((p) => p.step === step).length;
    // The blood group and the Aadhaar number are the only two a new school asks, so they are in different steps (Personal info and Academic).
    expect(places.filter((p) => p.step === "personal").map((p) => p.key)).toEqual(["bloodGroup"]);
    expect([count("personal"), count("academic"), count("parents"), count("more")]).toEqual([1, 3, 3, 9]);
    expect(places.filter((p) => p.step === "academic").map((p) => p.key)).toEqual(["srNumber", "pen", "aadhaarNumber"]);
  });

  it("a step of its own is added with a name, kept in the order sent, and a detail can be placed in it", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await put(s.token, { steps: [MORE, HEALTH], placements: [{ key: "medicalNotes", step: "s_health1" }, { key: "disability", step: "s_health1" }] });
    expect(res.status).toBe(200);
    expect(res.body.data.steps).toEqual([MORE, HEALTH]);
    expect(res.body.data.stepsAreDefault).toBe(false);
    const places = res.body.data.placements as { key: string; step: string }[];
    expect(places.slice(0, 2)).toEqual([{ key: "medicalNotes", step: "s_health1" }, { key: "disability", step: "s_health1" }]);
    expect((await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.steps).toHaveLength(2);
  });

  it("the steps can be put in another order, More details included; More details cannot be renamed or taken out", async () => {
    const s = await createSchool("Sunrise Public School");
    const reordered = await put(s.token, { steps: [HEALTH, DOCS, MORE] });
    expect(reordered.body.data.steps).toEqual([HEALTH, DOCS, MORE]);
    // Renamed, it keeps its name; left out, it is put back first.
    const renamed = await put(s.token, { steps: [{ key: "more", name: "Extras" }, HEALTH] });
    expect(renamed.body.data.steps).toEqual([MORE, HEALTH]);
    const missing = await put(s.token, { steps: [HEALTH] });
    expect(missing.body.data.steps).toEqual([MORE, HEALTH]);
  });

  it("the usual steps sent back are kept as none", async () => {
    const s = await createSchool("Sunrise Public School");
    await put(s.token, { steps: [MORE, HEALTH] });
    const back = await put(s.token, { steps: [MORE] });
    expect(back.body.data.stepsAreDefault).toBe(true);
    expect((await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.steps ?? null).toBeNull();
    await put(s.token, { steps: [MORE, HEALTH] });
    expect((await put(s.token, { steps: null })).body.data.steps).toEqual([MORE]);
  });

  it("refuses, under the step that is wrong: a name taken by a built-in step, the same name twice, a name too short", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await put(s.token, {
      steps: [MORE, { key: "s_one0001", name: "parents" }, { key: "s_two0002", name: "Health" }, { key: "s_thr0003", name: "health" }, { key: "s_fou0004", name: "x" }],
    });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([
      { path: "steps.1.name", message: "There is already a step called Parents" },
      { path: "steps.3.name", message: "There is already a step called Health" },
      { path: "steps.4.name", message: "The name of a step is 2 to 30 characters" },
    ]);
    expect((await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.steps ?? null).toBeNull();
  });

  it("refuses a name with < >, a key that is not a step, and the same step twice", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await put(s.token, { steps: [MORE, { key: "s_five0005", name: "<b>Hi</b>" }, { key: "weird", name: "Odd" }, { key: "s_five0005", name: "Again" }] });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([
      { path: "steps.1.name", message: "The name cannot contain < or >" },
      { path: "steps.2.key", message: "This step cannot be used" },
      { path: "steps.3.key", message: "This step is listed once" },
    ]);
  });

  it("a school can have 4 steps of its own, not more; the list cannot be empty or not a list", async () => {
    const s = await createSchool("Sunrise Public School");
    const four = [1, 2, 3, 4].map((n) => ({ key: `s_step000${n}`, name: `Step number ${n}` }));
    expect((await put(s.token, { steps: [MORE, ...four] })).status).toBe(200);
    const five = await put(s.token, { steps: [MORE, ...four, { key: "s_step0005", name: "Step number 5" }] });
    expect(five.status).toBe(400);
    expect((await put(s.token, { steps: [] })).status).toBe(400);
    expect((await put(s.token, { steps: "more" })).status).toBe(400);
  });

  it("a detail cannot be placed in a step the school does not have; a wrong step name is refused as before", async () => {
    const s = await createSchool("Sunrise Public School");
    const none = await put(s.token, { placements: [{ key: "pen", step: "s_health1" }] });
    expect(none.status).toBe(400);
    expect(details(none)).toEqual([{ path: "placements.0.step", message: "Your school has no such step" }]);
    const wrong = await put(s.token, { placements: [{ key: "pen", step: "kitchen" }] });
    expect(details(wrong)).toEqual([{ path: "placements.0.step", message: "Choose Personal info, Academic, Parents, More details or a step of your own" }]);
  });

  it("a step taken out sends its details to More details, whatever the places saved say", async () => {
    const s = await createSchool("Sunrise Public School");
    await put(s.token, { steps: [MORE, HEALTH], placements: [{ key: "medicalNotes", step: "s_health1" }] });
    const gone = await put(s.token, { steps: [MORE] });
    expect(gone.status).toBe(200);
    const places = gone.body.data.placements as { key: string; step: string }[];
    expect(places.find((p) => p.key === "medicalNotes")?.step).toBe("more");
    expect(places.some((p) => p.step === "s_health1")).toBe(false);
    const stored = (await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.placements ?? [];
    expect(stored.some((p) => p.step === "s_health1")).toBe(false);
  });

  it("steps and the places in them are one school's: another school sees only its own, and cannot use a step it does not have", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Greater School");
    await put(a.token, { steps: [MORE, HEALTH], placements: [{ key: "medicalNotes", step: "s_health1" }] });
    const seenByB = await get(b.token);
    expect(seenByB.body.data.steps).toEqual([MORE]);
    expect(seenByB.body.data.placements.find((p: { key: string }) => p.key === "medicalNotes").step).toBe("more");
    const stolen = await put(b.token, { placements: [{ key: "pen", step: "s_health1" }] });
    expect(stolen.status).toBe(400);
    expect(details(stolen)).toEqual([{ path: "placements.0.step", message: "Your school has no such step" }]);
    // B keeps its own.
    await put(b.token, { steps: [MORE, DOCS] });
    expect((await get(a.token)).body.data.steps).toEqual([MORE, HEALTH]);
  });
});
