import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";

/**
 * Teacher > Manage fields, the way Students > Manage fields works: every usual detail of a teacher is needed / optional / not asked,
 * the Excel's columns are the school's own list (in order, under its headings), one Mandatory for both, and the Excel can be tried
 * before the first teacher is added (one sample row).
 */

const api = "/api/v1/staff/teachers";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};
const download = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token)).buffer(true).parse(binary);
const sheetOf = async (buffer: Buffer, name = "Teachers") => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.getWorksheet(name)!;
};
const titlesOf = (sheet: ExcelJS.Worksheet, row = 1) => (sheet.getRow(row).values as unknown[]).slice(1).map(String);
const getSettings = (token: string) => request(app).get(`${api}/settings`).set(auth(token));
const putSettings = (token: string, body: object) => request(app).put(`${api}/settings`).set(auth(token)).send(body);
const add = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const keysOf = (res: request.Response) => (res.body.data.exportColumns as { key: string }[]).map((c) => c.key);

const DEFAULT_KEYS = [
  "name", "mobile", "gender", "dateOfBirth", "email", "address", "city", "state", "pincode", "employeeCode", "designation", "qualification",
  "experienceYears", "joiningDate", "employmentType", "subjects", "username", "status", "classTeacherOf", "given",
];
const PAN = { key: "c_pan00001", label: "PAN Number", type: "text", options: [], mode: "optional" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the details of a teacher: needed, optional or not asked", () => {
  it("starts with every usual detail optional, the Excel as it always was, and is kept detail by detail", async () => {
    const s = await createSchool("Sunrise Public School");
    const first = (await getSettings(s.token)).body.data;
    expect(Object.keys(first.fields).sort()).toEqual(
      ["address", "city", "dateOfBirth", "designation", "email", "employeeCode", "employmentType", "experienceYears", "joiningDate", "pincode", "qualification", "state", "subjects"].sort()
    );
    expect(Object.values(first.fields).every((mode) => mode === "optional")).toBe(true);
    expect(first.exportIsDefault).toBe(true);
    expect(first.exportColumns.map((c: { key: string }) => c.key)).toEqual(DEFAULT_KEYS);
    expect(first.exportColumns[3]).toEqual({ key: "dateOfBirth", heading: "Date of Birth" });

    const saved = await putSettings(s.token, { fields: { dateOfBirth: "required", qualification: "hidden" } });
    expect(saved.status).toBe(200);
    expect(saved.body.data.fields).toMatchObject({ dateOfBirth: "required", qualification: "hidden", email: "optional" });
    // Only what is sent changes.
    await putSettings(s.token, { fields: { email: "required" } });
    expect((await getSettings(s.token)).body.data.fields).toMatchObject({ dateOfBirth: "required", qualification: "hidden", email: "required" });
  });

  it("refuses a detail that is not the school's to change, or a need that is none, each with its own sentence", async () => {
    const s = await createSchool("Sunrise Public School");
    const bad = await putSettings(s.token, { fields: { name: "hidden", mobile: "optional", dateOfBirth: "sometimes" } });
    expect(bad.status).toBe(400);
    const by = Object.fromEntries(details(bad).map((d) => [d.path, d.message]));
    expect(by["fields.name"]).toBe("This detail cannot be changed");
    expect(by["fields.mobile"]).toBe("This detail cannot be changed");
    expect(by["fields.dateOfBirth"]).toContain("needed, optional or not asked");
  });

  it("is the school's own: another school keeps its usual details", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    await putSettings(a.token, { fields: { dateOfBirth: "required" } });
    expect((await getSettings(b.token)).body.data.fields.dateOfBirth).toBe("optional");
  });
});

describe("the Excel's columns", () => {
  it("are the school's list: in its order, under its headings, saved and read back; null is back to the default", async () => {
    const s = await createSchool("Sunrise Public School");
    const layout = [
      { key: "name", heading: "Teacher name" },
      { key: "mobile", heading: "Mobile" },
      { key: "subjects", heading: "Teaches" },
      { key: "designation", heading: "Post" },
    ];
    const saved = await putSettings(s.token, { exportColumns: layout });
    expect(saved.status).toBe(200);
    expect(saved.body.data.exportColumns).toEqual(layout);
    expect(saved.body.data.exportIsDefault).toBe(false);
    expect((await getSettings(s.token)).body.data.exportColumns).toEqual(layout);

    const back = await putSettings(s.token, { exportColumns: null });
    expect(keysOf(back)).toEqual(DEFAULT_KEYS);
    expect(back.body.data.exportIsDefault).toBe(true);
  });

  it("keep the Name and the Mobile in every export, and refuse a column that is none, twice, or without a heading", async () => {
    const s = await createSchool("Sunrise Public School");
    const lacking = await putSettings(s.token, { exportColumns: [{ key: "email", heading: "Email" }] });
    expect(lacking.status).toBe(400);
    expect(details(lacking).map((d) => d.message).join(" ")).toContain("Name and Mobile are in every export");

    const bad = await putSettings(s.token, {
      exportColumns: [
        { key: "name", heading: "Name" },
        { key: "mobile", heading: "name" },
        { key: "email", heading: "" },
        { key: "email", heading: "Mail" },
        { key: "password", heading: "Password" },
      ],
    });
    expect(bad.status).toBe(400);
    const by = Object.fromEntries(details(bad).map((d) => [d.path, d.message]));
    expect(by["exportColumns.1.heading"]).toBe("Two columns cannot have the same heading");
    expect(by["exportColumns.2.heading"]).toBe("Enter the heading");
    expect(by["exportColumns.3.key"]).toBe("This column is already in the export");
    expect(by["exportColumns.4.key"]).toBe("Choose a column from the list");
  });

  it("have the column of a needed detail in them whatever the list says: it cannot be taken out, and comes back when a detail is made needed", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, { exportColumns: [{ key: "name", heading: "Name" }, { key: "mobile", heading: "Mobile" }] });
    const needed = await putSettings(s.token, { fields: { dateOfBirth: "required" } });
    // Made needed after the list was saved: its column is put back.
    expect(keysOf(needed)).toContain("dateOfBirth");

    const out = await putSettings(s.token, { exportColumns: [{ key: "name", heading: "Name" }, { key: "mobile", heading: "Mobile" }] });
    expect(out.status).toBe(400);
    expect(details(out).map((d) => d.message).join(" ")).toContain("Date of Birth is mandatory, so it is in every export: make it optional first");
    // Optional in the same request: its column may leave.
    const both = await putSettings(s.token, { fields: { dateOfBirth: "optional" }, exportColumns: [{ key: "name", heading: "Name" }, { key: "mobile", heading: "Mobile" }] });
    expect(both.status).toBe(200);
    expect(keysOf(both)).toEqual(["name", "mobile"]);
  });

  it("carry the school's own fields, and lose one that is deleted", async () => {
    const s = await createSchool("Sunrise Public School");
    // Asked, an own field is in the default Excel (as it was before the list could be arranged).
    const made = await putSettings(s.token, { customFields: [PAN] });
    expect(keysOf(made).slice(-4)).toEqual(["c_pan00001", "status", "classTeacherOf", "given"]);

    await putSettings(s.token, { exportColumns: [{ key: "name", heading: "Name" }, { key: "mobile", heading: "Mobile" }, { key: "c_pan00001", heading: "PAN" }] });
    expect(keysOf(await getSettings(s.token))).toEqual(["name", "mobile", "c_pan00001"]);
    const gone = await putSettings(s.token, { customFields: [] });
    expect(keysOf(gone)).toEqual(["name", "mobile"]);

    const unknown = await putSettings(s.token, { exportColumns: [{ key: "name", heading: "Name" }, { key: "mobile", heading: "Mobile" }, { key: "c_pan00001", heading: "PAN" }] });
    expect(unknown.status).toBe(400);
    expect(details(unknown)[0].message).toBe("Choose a column from the list");
  });

  it("are for the people who run the school only", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["teacher", "accountant", "parent"] as const) {
      const token = await addColleague(s.tenantId, role);
      expect((await putSettings(token, { fields: { email: "required" } })).status, role).toBe(403);
    }
  });
});

describe("a needed detail on Add teacher and Change teacher", () => {
  it("must be answered when a teacher is added, each missing one named by its box", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, { fields: { dateOfBirth: "required", address: "required", subjects: "required", employmentType: "required" } });
    const refused = await add(s.token, { name: "Meena Singh", mobile: "9876543210" });
    expect(refused.status).toBe(400);
    const paths = details(refused).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["dateOfBirth", "address.line1", "subjectIds", "employmentType"]));
    expect(details(refused).find((d) => d.path === "dateOfBirth")!.message).toBe("Enter the date of birth");

    const maths = (await request(app).post("/api/v1/subjects").set(auth(s.token)).send({ name: "Mathematics" })).body.data.id as string;
    const made = await add(s.token, {
      name: "Meena Singh",
      mobile: "9876543210",
      dateOfBirth: "1988-07-14",
      address: { line1: "12 MG Road" },
      subjectIds: [maths],
      employmentType: "full_time",
    });
    expect(made.status).toBe(201);
  });

  it("is not asked of a teacher who is only changed, but cannot be cleared", async () => {
    const s = await createSchool("Sunrise Public School");
    const t = await add(s.token, { name: "Meena Singh", mobile: "9876543210", dateOfBirth: "1988-07-14" });
    await putSettings(s.token, { fields: { dateOfBirth: "required", qualification: "required" } });
    // An older teacher has no qualification: changing another box is fine.
    expect((await request(app).patch(`${api}/${t.body.data.id}`).set(auth(s.token)).send({ designation: "Coordinator" })).status).toBe(200);
    // But a needed detail is not emptied.
    const cleared = await request(app).patch(`${api}/${t.body.data.id}`).set(auth(s.token)).send({ dateOfBirth: null });
    expect(cleared.status).toBe(400);
    expect(details(cleared)[0]).toEqual({ path: "dateOfBirth", message: "Enter the date of birth" });
  });

  it("does not stop a bulk upload: the file is read as it comes (a school's old register seldom holds everything)", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, { fields: { dateOfBirth: "required" } });
    const res = await request(app).post(`${api}/import`).set(auth(s.token)).send({ rows: [{ row: 3, teacher: { name: "Meena Singh", mobile: "9876543210" } }] });
    expect(res.status).toBe(200);
    expect(res.body.data.results[0].ok).toBe(true);
  });
});

describe("the export follows the school's columns, and can be tried with no teacher", () => {
  it("writes the school's columns in its order under its headings", async () => {
    const s = await createSchool("Sunrise Public School");
    await add(s.token, { name: "Meena Singh", mobile: "9876543210", designation: "Coordinator", dateOfBirth: "1988-07-14" });
    await putSettings(s.token, {
      exportColumns: [
        { key: "mobile", heading: "Phone" },
        { key: "name", heading: "Teacher name" },
        { key: "designation", heading: "Post" },
      ],
    });
    const sheet = await sheetOf((await download(s.token, "/export")).body);
    expect(titlesOf(sheet)).toEqual(["Phone", "Teacher name", "Post"]);
    expect(sheet.getRow(2).values).toEqual([undefined, "9876543210", "Meena Singh", "Coordinator"]);
  });

  it("gives a school with no teacher one sample row, so the file can be seen and tried (a search that finds nobody gets none)", async () => {
    const s = await createSchool("Sunrise Public School");
    const sheet = await sheetOf((await download(s.token, "/export")).body);
    expect(titlesOf(sheet)).toEqual(expect.arrayContaining(["Name", "Mobile", "Date of Birth"]));
    expect(sheet.rowCount).toBe(2);
    expect(String(sheet.getRow(2).getCell(1).value)).toBe("Sample Teacher");

    await add(s.token, { name: "Meena Singh", mobile: "9876543210" });
    const real = await sheetOf((await download(s.token, "/export")).body);
    expect(real.rowCount).toBe(2);
    expect(String(real.getRow(2).getCell(1).value)).toBe("Meena Singh");
    const none = await sheetOf((await download(s.token, "/export?search=zzz")).body);
    expect(none.rowCount).toBe(1);
  });

  it("has a preview: how many teachers, the first rows with every column's value, or the one sample row", async () => {
    const s = await createSchool("Sunrise Public School");
    const empty = await request(app).get(`${api}/export/preview`).set(auth(s.token));
    expect(empty.status).toBe(200);
    expect(empty.body.data.sample).toBe(true);
    expect(empty.body.data.total).toBe(0);
    expect(empty.body.data.rows).toHaveLength(1);
    expect(empty.body.data.rows[0]).toMatchObject({ name: "Sample Teacher", mobile: expect.any(String), dateOfBirth: expect.any(String) });

    for (let n = 0; n < 12; n += 1) await add(s.token, { name: `Teacher ${String(n).padStart(2, "0")}`, mobile: `98765000${String(n).padStart(2, "0")}` });
    const some = await request(app).get(`${api}/export/preview`).set(auth(s.token));
    expect(some.body.data.sample).toBeUndefined();
    expect(some.body.data.total).toBe(12);
    expect(some.body.data.rows).toHaveLength(10);
    expect(some.body.data.rows[0]).toMatchObject({ name: "Teacher 00", status: "Teaching" });
    const filtered = await request(app).get(`${api}/export/preview?search=zzz`).set(auth(s.token));
    expect(filtered.body.data).toEqual({ total: 0, rows: [] });
  });

  it("has a preview for the people who may export only, and only of the caller's school", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    await add(a.token, { name: "Meena Singh", mobile: "9876543210" });
    for (const role of ["teacher", "accountant", "parent"] as const) {
      expect((await request(app).get(`${api}/export/preview`).set(auth(await addColleague(a.tenantId, role)))).status, role).toBe(403);
    }
    expect((await request(app).get(`${api}/export/preview`)).status).toBe(401);
    expect((await request(app).get(`${api}/export/preview`).set(auth(b.token))).body.data.sample).toBe(true);
  });
});

describe("the sample file follows what the school needs", () => {
  it("marks a needed detail green (with its star) and leaves out a detail the school does not ask", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, { fields: { dateOfBirth: "required", qualification: "hidden" } });
    const sheet = await sheetOf((await download(s.token, "/import/template")).body);
    const titles = titlesOf(sheet, 2);
    expect(titles).toContain("Date of Birth *");
    expect(titles).not.toContain("Qualification");
    expect(titles).toContain("Designation");
    const dob = sheet.getRow(2).getCell(titles.indexOf("Date of Birth *") + 1);
    expect((dob.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF92D050");
  });
});
