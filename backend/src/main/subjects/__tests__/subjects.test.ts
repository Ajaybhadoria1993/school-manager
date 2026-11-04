import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Allotment } from "../models/Allotment";

const api = "/api/v1/subjects";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path = "") => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, path: string, body: object = {}) => request(app).post(`${api}${path}`).set(auth(token)).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(`${api}${path}`).set(auth(token)).send(body);

const names = (res: request.Response) => res.body.data.items.map((s: { name: string }) => s.name);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("subjects: who may use them", () => {
  it("needs a signed-in user", async () => {
    expect((await request(app).get(api)).status).toBe(401);
  });

  it("lets the school admin and the principal change them, a teacher only look, and keeps the accountant out", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const principal = await addColleague(tenantId, "principal");
    const teacher = await addColleague(tenantId, "teacher");
    const accountant = await addColleague(tenantId, "accountant");

    expect((await post(principal, "", { name: "Hindi" })).status).toBe(201);
    expect((await post(token, "", { name: "English" })).status).toBe(201);
    expect(names(await get(teacher))).toEqual(["English", "Hindi"]);
    expect((await post(teacher, "", { name: "Art" })).status).toBe(403);
    expect((await get(accountant)).status).toBe(403);
  });
});

describe("adding a subject", () => {
  it("keeps it by its name with the category it was given, active, and lists it", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, "", { name: "  Social   Science ", code: "sst", category: "academic" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Social Science", code: "SST", category: "academic", isActive: true, sections: 0 });
    expect(names(await get(token))).toEqual(["Social Science"]);
  });

  it("is an academic subject without a code unless said otherwise", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, "", { name: "Mathematics" });
    expect(res.body.data).toMatchObject({ code: null, category: "academic" });
  });

  it("says what is wrong with a name or a code, by the box", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const empty = await post(token, "", { name: "   " });
    expect(empty.status).toBe(400);
    expect(details(empty)).toEqual([{ path: "name", message: "Enter the subject name" }]);
    const bad = await post(token, "", { name: "Art <b>", code: "A B!", category: "fun" });
    expect(bad.status).toBe(400);
    expect(details(bad).map((d) => d.path).sort()).toEqual(["category", "code", "name"]);
    expect(details(bad).find((d) => d.path === "code")!.message).toBe("The code is letters and digits only, up to 10");
  });

  it("refuses the same name (any case or spacing) or the same code twice, with the box it is about", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, "", { name: "Mathematics", code: "MAT" });
    const again = await post(token, "", { name: "mathematics" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("SUBJECT_EXISTS");
    expect(details(again)).toEqual([{ path: "name", message: "Your school already has a subject called Mathematics" }]);
    const code = await post(token, "", { name: "Maths 2", code: "mat" });
    expect(code.status).toBe(409);
    expect(code.body.code).toBe("SUBJECT_CODE_EXISTS");
    expect(details(code)[0].path).toBe("code");
  });

  it("lets two schools have the same subject", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    expect((await post(a.token, "", { name: "Hindi", code: "HIN" })).status).toBe(201);
    expect((await post(b.token, "", { name: "Hindi", code: "HIN" })).status).toBe(201);
  });
});

describe("the usual subjects in one click", () => {
  it("adds the ones that are not there, gives each the category it usually has, and says which were already there", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, "", { name: "Hindi" });
    const res = await post(token, "/quick-add", { names: ["English", "hindi", "Physical Education", "Art & Craft"] });
    expect(res.status).toBe(201);
    expect(res.body.data.created.map((s: { name: string }) => s.name)).toEqual(["English", "Physical Education", "Art & Craft"]);
    expect(res.body.data.skipped).toEqual(["hindi"]);
    const all = (await get(token)).body.data.items as { name: string; category: string }[];
    expect(all.find((s) => s.name === "Physical Education")!.category).toBe("activity");
    expect(all.find((s) => s.name === "English")!.category).toBe("academic");
  });

  it("adds a name that is not on the usual list as an academic subject, and refuses an empty request", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, "/quick-add", { names: ["Astronomy"] });
    expect(res.body.data.created[0]).toMatchObject({ name: "Astronomy", category: "academic" });
    const none = await post(token, "/quick-add", { names: [] });
    expect(none.status).toBe(400);
  });
});

describe("changing and archiving a subject", () => {
  it("renames it, changes its code and category, and refuses a name another subject has", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const maths = (await post(token, "", { name: "Maths" })).body.data;
    await post(token, "", { name: "Science" });
    const done = await patch(token, `/${maths.id}`, { name: "Mathematics", code: "mat", category: "academic" });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ name: "Mathematics", code: "MAT" });
    const clash = await patch(token, `/${maths.id}`, { name: "science" });
    expect(clash.status).toBe(409);
    // A code is cleared with an empty box.
    expect((await patch(token, `/${maths.id}`, { code: "" })).body.data.code).toBeNull();
    expect((await patch(token, `/${maths.id}`, {})).status).toBe(400);
  });

  it("archives an unused subject (out of the list, kept) and brings it back", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const art = (await post(token, "", { name: "Art" })).body.data;
    await post(token, "", { name: "Music" });
    expect((await patch(token, `/${art.id}`, { isActive: false })).body.data.isActive).toBe(false);
    expect(names(await get(token))).toEqual(["Music"]);
    expect(names(await get(token, "?status=archived"))).toEqual(["Art"]);
    expect(names(await get(token, "?status=all"))).toEqual(["Art", "Music"]);
    expect((await patch(token, `/${art.id}`, { isActive: true })).body.data.isActive).toBe(true);
    expect(names(await get(token))).toEqual(["Art", "Music"]);
  });

  it("will not archive a subject a class studies this year, and says how many sections", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const year = (
      await request(app).post("/api/v1/academics/academic-years/initial").set(auth(token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" })
    ).body.data;
    const maths = (await post(token, "", { name: "Mathematics" })).body.data;
    const row = (sectionId: string) => ({
      tenantId: new Types.ObjectId(tenantId),
      academicYearId: new Types.ObjectId(year.id),
      classId: new Types.ObjectId(),
      sectionId: new Types.ObjectId(sectionId),
      subjectId: new Types.ObjectId(maths.id),
      periodsPerWeek: 6,
    });
    await Allotment.create([row(new Types.ObjectId().toString()), row(new Types.ObjectId().toString())]);
    expect((await get(token)).body.data.items[0].sections).toBe(2);
    const refused = await patch(token, `/${maths.id}`, { isActive: false });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("SUBJECT_IN_USE");
    expect(refused.body.message).toBe("Mathematics is taught in 2 sections this year. Take it out of them first.");
    expect(names(await get(token))).toEqual(["Mathematics"]);
  });

  it("is a 404 for a subject that does not exist (before the body is read)", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const missing = new Types.ObjectId().toString();
    expect((await patch(token, `/${missing}`, { nope: 1 })).status).toBe(404);
    expect((await patch(token, "/not-an-id", { name: "x" })).status).toBe(400);
  });
});

describe("limits", () => {
  it("holds a school to 80 subjects", async () => {
    const { token } = await createSchool("Sunrise Public School");
    for (let i = 0; i < 80; i += 1) {
      const res = await post(token, "", { name: `Subject ${i}` });
      expect(res.status, `subject ${i}`).toBe(201);
    }
    const over = await post(token, "", { name: "One too many" });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("LIMIT_REACHED");
  }, 60_000);
});
