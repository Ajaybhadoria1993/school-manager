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
const keys = (res: request.Response) => (res.body.data.exportColumns as { key: string }[]).map((c) => c.key);
const HOUSE = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the form and the Excel: independent, but a mandatory detail is in both", () => {
  it("a new school's Excel already has every column of the details it makes mandatory", async () => {
    const s = await createSchool("Sunrise Public School", "school_admin", "default");
    const res = await get(s.token);
    for (const key of ["category", "aadhaarNumber", "area", "fatherOccupation", "motherOccupation", "lastClass", "tcNumber"]) expect(keys(res), key).toContain(key);
    expect(res.body.data.exportIsDefault).toBe(true);
  });

  it("a detail made mandatory brings its column into the Excel, even when the saved layout lacks it; the saved layout is not changed by that", async () => {
    const s = await createSchool("Sunrise Public School", "school_admin", "default");
    const layout = (await get(s.token)).body.data.exportColumns as { key: string; heading: string }[];
    await put(s.token, { exportColumns: layout });
    const before = (await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.exportColumns?.map((c) => c.key);

    const res = await put(s.token, { fields: { nationality: "required" } });
    expect(res.status).toBe(200);
    expect(keys(res)).toContain("nationality");
    expect(res.body.data.exportIsDefault).toBe(false);
    expect(res.body.data.fields.nationality).toBe("required");
    expect((await StudentSettings.findOne({ tenantId: s.tenantId }).lean())?.exportColumns?.map((c) => c.key)).toEqual(before);
    // Two columns for one setting: both occupations.
    await put(s.token, { exportColumns: layout.filter((c) => !["fatherOccupation", "motherOccupation"].includes(c.key)), fields: { guardianOccupation: "optional" } });
    const again = await put(s.token, { fields: { guardianOccupation: "required" } });
    expect(keys(again)).toEqual(expect.arrayContaining(["fatherOccupation", "motherOccupation"]));
  });

  it("an Excel without the column of a mandatory detail is refused, naming the column", async () => {
    const s = await createSchool("Sunrise Public School", "school_admin", "default");
    const layout = (await get(s.token)).body.data.exportColumns as { key: string; heading: string }[];
    const res = await put(s.token, { exportColumns: layout.filter((c) => c.key !== "aadhaarNumber") });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([{ path: "exportColumns", message: "Aadhaar No. is mandatory, so it is in every export: make it optional first" }]);
    // Made optional in the same save, it can go.
    const ok = await put(s.token, { fields: { aadhaarNumber: "optional" }, exportColumns: layout.filter((c) => c.key !== "aadhaarNumber") });
    expect(ok.status).toBe(200);
    expect(keys(ok)).not.toContain("aadhaarNumber");
    // A field of the school's own is held to the same rule.
    await put(s.token, { customFields: [{ ...HOUSE, mode: "required" }], exportColumns: [...layout, { key: "c_house1", heading: "House" }] });
    const own = await put(s.token, { exportColumns: layout });
    expect(own.status).toBe(400);
    expect(details(own)).toEqual([{ path: "exportColumns", message: "House is mandatory, so it is in every export: make it optional first" }]);
  });

  it("the form and the Excel are independent for what is optional: asked but not a column, a column but not asked", async () => {
    const s = await createSchool("Sunrise Public School", "school_admin", "default");
    const layout = (await get(s.token)).body.data.exportColumns as { key: string; heading: string }[];
    // Asked on the form (optional), no column in the Excel.
    const asked = await put(s.token, { fields: { religion: "optional" }, exportColumns: layout });
    expect(asked.status).toBe(200);
    expect(asked.body.data.fields.religion).toBe("optional");
    expect(keys(asked)).not.toContain("religion");
    // A column in the Excel, not asked on the form.
    const column = await put(s.token, { fields: { bloodGroup: "hidden" } });
    expect(column.status).toBe(200);
    expect(column.body.data.fields.bloodGroup).toBe("hidden");
    expect(keys(column)).toContain("bloodGroup");
    // Both stay exactly so on the next read.
    const read = await get(s.token);
    expect(read.body.data.fields).toMatchObject({ religion: "optional", bloodGroup: "hidden" });
    expect(keys(read)).toContain("bloodGroup");
    expect(keys(read)).not.toContain("religion");
  });

  it("an own field is asked without being a column, and is a column without being asked", async () => {
    const s = await createSchool("Sunrise Public School", "school_admin", "default");
    const layout = (await get(s.token)).body.data.exportColumns as { key: string; heading: string }[];
    const a = await put(s.token, { customFields: [HOUSE], exportColumns: layout });
    expect(a.status).toBe(200);
    expect(a.body.data.customFields[0].mode).toBe("optional");
    expect(keys(a)).not.toContain("c_house1");
    const b = await put(s.token, { customFields: [{ ...HOUSE, mode: "hidden" }], exportColumns: [...layout, { key: "c_house1", heading: "House" }] });
    expect(b.status).toBe(200);
    expect(b.body.data.customFields[0].mode).toBe("hidden");
    expect(keys(b)).toContain("c_house1");
  });

  it("a detail made optional keeps its column, and optional is one thing for the form and the Excel", async () => {
    const s = await createSchool("Sunrise Public School", "school_admin", "default");
    const res = await put(s.token, { fields: { aadhaarNumber: "optional" } });
    expect(res.status).toBe(200);
    expect(res.body.data.fields.aadhaarNumber).toBe("optional");
    expect(keys(res)).toContain("aadhaarNumber");
  });

  it("another school's mandatory details never put columns in this school's Excel", async () => {
    const a = await createSchool("Sunrise Public School", "school_admin", "default");
    const b = await createSchool("Greater School", "school_admin", "default");
    await put(a.token, { fields: { nationality: "required", religion: "required" } });
    const seenByB = await get(b.token);
    expect(keys(seenByB)).not.toContain("nationality");
    expect(keys(seenByB)).not.toContain("religion");
    expect(seenByB.body.data.exportIsDefault).toBe(true);
    expect(seenByB.body.data.fields.nationality).toBe("hidden");
  });
});
