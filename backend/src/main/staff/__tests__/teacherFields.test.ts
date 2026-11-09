import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";

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
const getSettings = (token: string) => request(app).get(`${api}/settings`).set(auth(token));
const putSettings = (token: string, customFields: object[]) => request(app).put(`${api}/settings`).set(auth(token)).send({ customFields });
const add = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

const PAN = { key: "c_pan00001", label: "PAN Number", type: "text", options: [], mode: "optional" };
const BLOOD = { key: "c_blood001", label: "Blood Group", type: "choice", options: ["A+", "B+", "O+"], mode: "optional" };
const HOUSE = { key: "c_house001", label: "House Duty", type: "yesNo", options: [], mode: "optional" };
const SINCE = { key: "c_since001", label: "Member Since", type: "date", options: [], mode: "optional" };
const KIDS = { key: "c_kids0001", label: "Children", type: "number", options: [], mode: "optional" };
const NEEDED = { key: "c_aadhaar1", label: "Aadhaar Number", type: "text", options: [], mode: "required" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a school's own fields for its teachers: the list", () => {
  it("starts empty, is kept as it is saved (in order), and is for the people who run the school only", async () => {
    const s = await createSchool("Sunrise Public School");
    expect((await getSettings(s.token)).body.data).toEqual({ customFields: [] });
    const saved = await putSettings(s.token, [BLOOD, PAN]);
    expect(saved.status).toBe(200);
    expect(saved.body.data.customFields.map((f: { key: string }) => f.key)).toEqual(["c_blood001", "c_pan00001"]);
    expect((await getSettings(s.token)).body.data.customFields).toEqual([BLOOD, PAN]);
    // The whole list is replaced: a field left out is gone.
    expect((await putSettings(s.token, [PAN])).body.data.customFields).toEqual([PAN]);
    expect((await putSettings(s.token, [])).body.data.customFields).toEqual([]);

    for (const role of ["teacher", "accountant", "parent"] as const) {
      const token = await addColleague(s.tenantId, role);
      expect((await getSettings(token)).status, role).toBe(403);
      expect((await putSettings(token, [PAN])).status, role).toBe(403);
    }
    expect((await request(app).get(`${api}/settings`)).status).toBe(401);
  });

  it("refuses a field that cannot be one, each with its own sentence", async () => {
    const s = await createSchool("Sunrise Public School");
    const bad = await putSettings(s.token, [
      { ...PAN, label: "P" },
      { ...BLOOD, key: "c_blood002", label: "Mobile" },
      { ...HOUSE, key: "c_house002", label: "Designation" },
      { ...KIDS, key: "c_kids0002", label: "Houses", mode: "sometimes" },
      { ...SINCE, key: "c_since002", type: "choice", options: [] },
      { ...HOUSE, key: "c_house003", label: "Duty", mode: "required" },
      { ...PAN, key: "bad key", label: "Other" },
      { ...PAN, key: "c_pan00007", label: "houses" },
    ]);
    expect(bad.status).toBe(400);
    const by = Object.fromEntries(details(bad).map((d) => [d.path, d.message]));
    expect(by["customFields.0.label"]).toContain("2 to 40 characters");
    expect(by["customFields.1.label"]).toBe("There is already a field called Mobile");
    expect(by["customFields.2.label"]).toBe("There is already a field called Designation");
    expect(by["customFields.3.mode"]).toContain("needed, optional or not asked");
    expect(by["customFields.4.options"]).toContain("Add the choices");
    expect(by["customFields.5.mode"]).toContain("cannot be needed");
    expect(by["customFields.6.key"]).toContain("add it again");
    expect(by["customFields.7.label"]).toBe("Two fields cannot have the same name");
    expect((await getSettings(s.token)).body.data.customFields).toEqual([]);
  });

  it("takes up to 20 fields, and a field keeps its kind", async () => {
    const s = await createSchool("Sunrise Public School");
    const many = Array.from({ length: 21 }, (_, i) => ({ ...PAN, key: `c_many${String(1000 + i)}`, label: `Field number ${i}` }));
    expect((await putSettings(s.token, many)).status).toBe(400);
    expect((await putSettings(s.token, many.slice(0, 20))).status).toBe(200);
    await putSettings(s.token, [KIDS]);
    const changed = await putSettings(s.token, [{ ...KIDS, type: "date" }]);
    expect(changed.status).toBe(400);
    expect(details(changed)[0]).toMatchObject({ path: "customFields.0.type", message: "A field keeps its kind: add a new field for another kind" });
    // A name, a mode and the choices can change.
    const renamed = await putSettings(s.token, [{ ...KIDS, label: "Number of children", mode: "required" }]);
    expect(renamed.body.data.customFields[0]).toMatchObject({ label: "Number of children", mode: "required" });
  });

  it("is each school's own", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    await putSettings(a.token, [PAN]);
    expect((await getSettings(b.token)).body.data.customFields).toEqual([]);
    await putSettings(b.token, [BLOOD]);
    expect((await getSettings(a.token)).body.data.customFields).toEqual([PAN]);
  });
});

describe("a teacher's answers to the school's own fields", () => {
  it("are kept with the teacher, as typed in the form's words (tidy text, a day, a yes or no, a number, a choice)", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, [PAN, BLOOD, HOUSE, SINCE, KIDS]);
    const res = await add(s.token, {
      name: "Meena Singh",
      mobile: "9876543210",
      custom: { c_pan00001: "  ABCDE1234F ", c_blood001: "B+", c_house001: true, c_since001: "2015-06-01", c_kids0001: 2 },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.custom).toEqual({ c_pan00001: "ABCDE1234F", c_blood001: "B+", c_house001: true, c_since001: "2015-06-01", c_kids0001: 2 });
    expect((await request(app).get(`${api}/${res.body.data.id}`).set(auth(s.token))).body.data.custom).toEqual(res.body.data.custom);
    const listed = (await request(app).get(api).set(auth(s.token))).body.data.items[0];
    expect(listed.custom.c_pan00001).toBe("ABCDE1234F");
  });

  it("must answer a needed field when a teacher is added, and cannot clear it later", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, [NEEDED, PAN]);
    const missing = await add(s.token, { name: "Meena Singh", mobile: "9876543210" });
    expect(missing.status).toBe(400);
    expect(details(missing)).toEqual([{ path: "custom.c_aadhaar1", message: "Enter the Aadhaar Number" }]);
    const made = await add(s.token, { name: "Meena Singh", mobile: "9876543210", custom: { c_aadhaar1: "1234 5678 9012" } });
    expect(made.status).toBe(201);
    const id = made.body.data.id;
    const cleared = await request(app).patch(`${api}/${id}`).set(auth(s.token)).send({ custom: { c_aadhaar1: null } });
    expect(cleared.status).toBe(400);
    expect(details(cleared)[0].path).toBe("custom.c_aadhaar1");
    // A change that does not touch it is fine.
    expect((await request(app).patch(`${api}/${id}`).set(auth(s.token)).send({ designation: "PGT" })).status).toBe(200);
  });

  it("are changed one at a time (null clears an optional one), and a wrong answer says which field", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, [PAN, BLOOD, KIDS, SINCE, HOUSE]);
    const made = await add(s.token, { name: "Meena Singh", mobile: "9876543210", custom: { c_pan00001: "ABCDE1234F", c_blood001: "B+" } });
    const id = made.body.data.id;
    const patch = (custom: object) => request(app).patch(`${api}/${id}`).set(auth(s.token)).send({ custom });
    const changed = await patch({ c_blood001: "O+", c_pan00001: null, c_kids0001: 3 });
    expect(changed.status).toBe(200);
    expect(changed.body.data.custom).toEqual({ c_blood001: "O+", c_kids0001: 3 });

    const wrong = await patch({ c_blood001: "Z+", c_kids0001: "many", c_since001: "31-02-2015", c_house001: "yes", c_unknown01: "x" });
    expect(wrong.status).toBe(400);
    const by = Object.fromEntries(details(wrong).map((d) => [d.path, d.message]));
    expect(by["custom.c_blood001"]).toBe("Choose the Blood Group from the list");
    expect(by["custom.c_kids0001"]).toBe("Enter a number for Children");
    expect(by["custom.c_since001"]).toBe("Choose a valid date for Member Since");
    expect(by["custom.c_house001"]).toBe("Say yes or no");
    expect(by["custom.c_unknown01"]).toBe("This is not one of your school's fields");
    // Nothing of a refused change was kept.
    expect((await request(app).get(`${api}/${id}`).set(auth(s.token))).body.data.custom).toEqual({ c_blood001: "O+", c_kids0001: 3 });
  });

  it("a teacher reading the list sees a colleague's name and subjects, never the answers", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, [PAN]);
    await add(s.token, { name: "Meena Singh", mobile: "9876543210", custom: { c_pan00001: "ABCDE1234F" } });
    const teacher = await addColleague(s.tenantId, "teacher");
    const item = (await request(app).get(api).set(auth(teacher))).body.data.items[0];
    expect(item).not.toHaveProperty("custom");
  });
});

describe("the school's own fields in a bulk upload, an export and the sample file", () => {
  it("a bulk upload row carries its answers: checked for what it gives, never refused for what it lacks", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, [NEEDED, PAN, BLOOD]);
    const res = await request(app)
      .post(`${api}/import`)
      .set(auth(s.token))
      .send({
        rows: [
          { row: 3, teacher: { name: "Meena Singh", mobile: "9876543210", custom: { c_pan00001: "ABCDE1234F", c_blood001: "B+" } } },
          { row: 4, teacher: { name: "Dev Patel", mobile: "9876500000", custom: { c_blood001: "Z+" } } },
          { row: 5, teacher: { name: "Asha Rao", mobile: "9876500011" } },
        ],
      });
    const [a, b, c] = res.body.data.results;
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, errors: [{ path: "custom.c_blood001", message: "Choose the Blood Group from the list" }] });
    // The needed Aadhaar Number is in neither row: a school brings in the teachers it has, as an old register has them.
    expect(c.ok).toBe(true);
    const saved = (await request(app).get(`${api}/${a.teacher.id}`).set(auth(s.token))).body.data;
    expect(saved.custom).toEqual({ c_pan00001: "ABCDE1234F", c_blood001: "B+" });
  });

  it("the export has a column for each field (not asked ones left out), with the answers as the school reads them", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, [PAN, HOUSE, SINCE, KIDS, { ...BLOOD, mode: "hidden" }]);
    await add(s.token, { name: "Meena Singh", mobile: "9876543210", custom: { c_pan00001: "ABCDE1234F", c_house001: true, c_since001: "2015-06-01", c_kids0001: 2 } });
    await add(s.token, { name: "Dev Patel", mobile: "9876500000", custom: { c_house001: false } });
    const sheet = await sheetOf((await download(s.token, "/export")).body);
    const titles = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    // After the sample file's columns, before the extras that only say more.
    expect(titles.slice(16)).toEqual(["Username", "PAN Number", "House Duty", "Member Since", "Children", "Status", "Class teacher of", "Classes given"]);
    const row = (n: number) => Object.fromEntries(titles.map((t, i) => [t, String(sheet.getRow(n).getCell(i + 1).value ?? "")]));
    expect(row(3)).toMatchObject({ Name: "Meena Singh", "PAN Number": "ABCDE1234F", "House Duty": "Yes", "Member Since": "01-06-2015", Children: "2" });
    expect(row(2)).toMatchObject({ Name: "Dev Patel", "PAN Number": "", "House Duty": "No", "Member Since": "", Children: "" });
  });

  it("the sample file has a yellow column for each field (a dropdown for a list and a yes / no), after Password", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, [BLOOD, HOUSE, SINCE, { ...PAN, mode: "hidden" }]);
    const sheet = await sheetOf((await download(s.token, "/import/template")).body);
    const titles = (sheet.getRow(2).values as unknown[]).slice(1).map(String);
    expect(titles.slice(18)).toEqual(["Blood Group", "House Duty", "Member Since"]);
    expect(sheet.getCell("S3").dataValidation).toMatchObject({ type: "list", formulae: ['"A+,B+,O+"'] });
    expect(sheet.getCell("T3").dataValidation).toMatchObject({ type: "list", formulae: ['"Yes,No"'] });
    expect(sheet.getColumn("U").numFmt).toBe("@");
    const fill = (cell: string) => (sheet.getCell(cell).fill as ExcelJS.FillPattern).fgColor?.argb;
    expect(fill("S2")).toBe(fill("R2"));
    expect(String(sheet.getCell("S2").note)).toContain("Your own field");
  });

  it("the sample file's own fields are read back by their titles (a file the school made from it)", async () => {
    const s = await createSchool("Sunrise Public School");
    await putSettings(s.token, [PAN]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await download(s.token, "/import/template")).body as unknown as ArrayBuffer);
    workbook.getWorksheet("Teachers")!.getRow(3).values = ["", "Meena Singh", "9876543210"];
    workbook.getWorksheet("Teachers")!.getCell("S3").value = "ABCDE1234F";
    const read = await request(app).post(`${api}/import/read`).set(auth(s.token)).attach("file", Buffer.from(await workbook.xlsx.writeBuffer()), "t.xlsx");
    expect(read.body.data.headers[18]).toBe("PAN Number");
    expect(read.body.data.rows[0].cells[18]).toBe("ABCDE1234F");
  });
});
