import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Guardian } from "../models/Guardian";
import { Student } from "../models/Student";
import { todayInIndia } from "../schemas/students.schemas";
import { parseCsv } from "../services/sheetReader";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

/** Reads a binary answer (a spreadsheet) into a Buffer. */
const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};
const download = (token: string, path: string) => request(app).get(`${api}${path}`).set(auth(token)).buffer(true).parse(binary);
const workbookOf = async (buffer: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
};
const upload = (token: string, name: string, content: Buffer) => request(app).post(`${api}/import/read`).set(auth(token)).attach("file", content, name);
const importRows = (token: string, body: object) => request(app).post(`${api}/import`).set(auth(token)).send(body);

async function school(name = "Sunrise Public School") {
  const s = await createSchool(name);
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  const class5 = (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: "Class 5", sectionCount: 0 })).body.data;
  const a = (await request(app).post(`${academics}/classes/${class5.id}/sections`).set(auth(s.token)).send({ name: "A", capacity: 40, room: "5A" })).body.data;
  const b = (await request(app).post(`${academics}/classes/${class5.id}/sections`).set(auth(s.token)).send({ name: "B", capacity: 1, room: "5B" })).body.data;
  const class1 = (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: "Class 1", sectionCount: 0 })).body.data;
  return { ...s, class5: class5.id as string, a: a.id as string, b: b.id as string, class1: class1.id as string };
}

/** One row of an import: an admission body (like POST /students) and its row number in the file. */
const row = (n: number, student: Record<string, unknown>, admissionNumber?: string) => ({ row: n, ...(admissionNumber ? { admissionNumber } : {}), student });
const studentBody = (classId: string, sectionId: string | null, over: Record<string, unknown> = {}) => ({
  firstName: "Asha",
  lastName: "Verma",
  gender: "Female",
  dateOfBirth: "2016-05-14",
  admissionDate: "2026-06-01",
  address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  // Needed from Class 1 to 12 (a row into Nursery may leave it out).
  previousSchool: { name: "Little Flower School" },
  classId,
  sectionId,
  guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210" }],
  ...over,
});
const family = (name: string, mobile: string) => ({ guardians: [{ name, relation: "Father", isPrimary: true, mobile }] });

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the sample template", () => {
  it("is a spreadsheet made for this school: coloured titles with notes, dropdowns, its classes, how to fill it", async () => {
    const s = await school();
    const res = await download(s.token, "/import/template");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("students-template-sunrise-public-school.xlsx");

    const workbook = await workbookOf(res.body);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Students", "Classes", "Lists", "How to fill"]);
    const sheet = workbook.getWorksheet("Students")!;
    expect(String(sheet.getCell("A1").value)).toContain("Dates as DD-MM-YYYY");
    expect(sheet.getCell("A2").value).toBe("Admission No.");
    expect(sheet.getCell("B2").value).toBe("First Name *");
    expect(sheet.getCell("B2").note).toBeTruthy();
    expect(sheet.getCell("D3").dataValidation).toMatchObject({ type: "list", formulae: ['"Male,Female,Other"'] });
    expect(sheet.getCell("F3").dataValidation).toMatchObject({ type: "list", formulae: ["'Classes'!$A$2:$A$3"] });

    // Only the five basics are green: an old register seldom holds the rest, so the address and the previous school are optional here
    // (Add student is the one that asks for them), and the sheet says so.
    const header = (title: string) => {
      const cell = (sheet.getRow(2).values as unknown[]).findIndex((v) => String(v).replace(" *", "") === title);
      return sheet.getRow(2).getCell(cell);
    };
    for (const title of ["First Name", "Last Name", "Gender", "Date of Birth", "Class"]) expect(String(header(title).value)).toBe(`${title} *`);
    for (const title of ["Address", "City", "State", "PIN Code", "Previous School", "Last Class", "TC No.", "Category", "Aadhaar No."]) {
      expect(String(header(title).value), title).toBe(title);
    }
    expect(String(header("Previous School").note)).not.toContain("Needed");
    const help = workbook.getWorksheet("How to fill")!;
    const lines = help.getColumn(1).values as unknown[];
    expect(lines.some((line) => String(line).includes("Green columns are the only ones every student needs: First Name, Last Name, Gender, Date of Birth, Class"))).toBe(true);
    expect(lines.some((line) => String(line).includes("Everything else is optional"))).toBe(true);
    expect(lines.some((line) => String(line).includes("needed for Class 1 to 12"))).toBe(false);

    const classes = workbook.getWorksheet("Classes")!;
    // Class 1 sits before Class 5 in teaching order.
    expect([classes.getCell("A2").value, classes.getCell("B2").value]).toEqual(["Class 1", "No sections: leave Section empty"]);
    expect([classes.getCell("A3").value, classes.getCell("B3").value, classes.getCell("C3").value]).toEqual(["Class 5", "A, B", 41]);
  });

  it("does not turn a column green because the school made it mandatory on Add student (the upload never insists on it)", async () => {
    const s = await school();
    const saved = await request(app).put(`${api}/settings`).set(auth(s.token)).send({ fields: { aadhaarNumber: "required", category: "required" } });
    expect(saved.status).toBe(200);
    const sheet = (await workbookOf((await download(s.token, "/import/template")).body)).getWorksheet("Students")!;
    const titles = (sheet.getRow(2).values as unknown[]).map(String);
    expect(titles).toContain("Aadhaar No.");
    expect(titles).toContain("Category");
    expect(titles.filter((t) => t.endsWith(" *"))).toEqual(["First Name *", "Last Name *", "Gender *", "Date of Birth *", "Class *"]);
  });

  it("is for the people who admit students only", async () => {
    const s = await school();
    for (const role of ["accountant", "teacher", "parent"] as const) {
      expect((await download(await addColleague(s.tenantId, role), "/import/template")).status).toBe(403);
    }
  });
});

describe("reading an uploaded file", () => {
  async function xlsx(build: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    build(workbook.addWorksheet("Pupils"));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it("finds the title row under a heading, keeps every digit and turns Excel dates into days", async () => {
    const s = await school();
    const file = await xlsx((sheet) => {
      sheet.mergeCells("A1:E1");
      sheet.getCell("A1").value = "Sunrise School - students 2026";
      sheet.addRow(["Student Name", "Class", "DOB", "Father Mobile", "Section"]);
      sheet.addRow(["Asha Verma", "V", new Date(Date.UTC(2016, 4, 14)), 9876543210, "A"]);
      sheet.addRow([]);
      sheet.addRow(["Kabir Khan", "5-B", "03/02/2015", "+91 98765 43211", { richText: [{ text: "B" }] }]);
    });
    const res = await upload(s.token, "pupils.xlsx", file);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      fileName: "pupils.xlsx",
      sheetName: "Pupils",
      headerRow: 2,
      headers: ["Student Name", "Class", "DOB", "Father Mobile", "Section"],
      rows: [
        { row: 3, cells: ["Asha Verma", "V", "2016-05-14", "9876543210", "A"] },
        { row: 5, cells: ["Kabir Khan", "5-B", "03/02/2015", "+91 98765 43211", "B"] },
      ],
    });
  });

  it("reads a CSV as written (no date guessing), with quotes, commas inside quotes and a byte-order mark", async () => {
    const s = await school();
    const csv = '﻿Name,Class,DOB,Address\r\n"Verma, Asha",5,05-04-2016,"12 ""MG"" Road"\r\n';
    const res = await upload(s.token, "list.csv", Buffer.from(csv, "utf8"));
    expect(res.status).toBe(200);
    expect(res.body.data.headers).toEqual(["Name", "Class", "DOB", "Address"]);
    expect(res.body.data.rows).toEqual([{ row: 2, cells: ["Verma, Asha", "5", "05-04-2016", '12 "MG" Road'] }]);
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("reads back the school's own template and export", async () => {
    const s = await school();
    const template = (await download(s.token, "/import/template")).body as Buffer;
    const workbook = await workbookOf(template);
    const sheet = workbook.getWorksheet("Students")!;
    sheet.getRow(3).values = ["", "Asha", "Verma", "Female", "14-05-2016", "Class 5", "A"];
    const res = await upload(s.token, "filled.xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(res.status).toBe(200);
    expect(res.body.data.headerRow).toBe(2);
    expect(res.body.data.headers.slice(0, 3)).toEqual(["Admission No.", "First Name *", "Last Name *"]);
    expect(res.body.data.rows).toEqual([{ row: 3, cells: expect.arrayContaining(["Asha", "Verma", "Female", "14-05-2016", "Class 5", "A"]) }]);
  });

  it("refuses what it cannot read, with a sentence for the person", async () => {
    const s = await school();
    const cases: [string, Buffer, string][] = [
      ["old.xls", Buffer.from("x"), "IMPORT_FILE_TYPE"],
      ["notes.txt", Buffer.from("a,b,c"), "IMPORT_FILE_TYPE"],
      ["broken.xlsx", Buffer.from("this is not a zip"), "IMPORT_FILE_UNREADABLE"],
      ["titles.csv", Buffer.from("Name,Class,DOB\n"), "IMPORT_EMPTY"],
      ["one-column.csv", Buffer.from("Name\nAsha\n"), "IMPORT_NO_HEADER"],
      ["big.csv", Buffer.from(`Name,Class,DOB\n${"Asha,5,2016-01-01\n".repeat(1001)}`), "IMPORT_TOO_MANY_ROWS"],
      ["huge.csv", Buffer.alloc(6 * 1024 * 1024, 65), "IMPORT_FILE_TOO_BIG"],
    ];
    for (const [name, content, code] of cases) {
      const res = await upload(s.token, name, content);
      expect(res.status, name).toBe(400);
      expect(res.body.code, name).toBe(code);
      expect(res.body.details[0]).toMatchObject({ path: "file" });
    }
    const none = await request(app).post(`${api}/import/read`).set(auth(s.token)).field("note", "no file");
    expect(none.body.code).toBe("IMPORT_FILE_MISSING");
    expect((await upload(await addColleague(s.tenantId, "teacher"), "x.csv", Buffer.from("a,b,c\n1,2,3"))).status).toBe(403);
  });
});

describe("checking the rows (dry run)", () => {
  it("judges each row like an admission, says what is wrong by box, and writes nothing", async () => {
    const s = await school();
    await request(app).post(api).set(auth(s.token)).send(studentBody(s.class5, s.a));
    const res = await importRows(s.token, {
      dryRun: true,
      rows: [
        row(3, studentBody(s.class5, s.a, { firstName: "Kabir", dateOfBirth: "2017-01-01" })),
        row(4, studentBody(s.class5, s.a, { gender: "Boy", ...family("Anil Rao", "9111111111") })),
        row(5, studentBody(s.class5, null, family("Anil Rao", "9111111112"))),
        row(6, studentBody(s.class5, s.a)),
        row(7, studentBody(s.class1, null, family("Mira Das", "9222222222")), "bad#number"),
        row(8, studentBody(s.class1, null, { ...family("Mira Das", "9222222223"), firstName: "Mira" }), "ADM-2026-0001"),
        row(9, studentBody(s.class1, null, { ...family("Sunil Das", "9333333333"), firstName: "Dev" }), "2019/45"),
      ],
    });
    expect(res.status).toBe(200);
    const byRow = Object.fromEntries(res.body.data.results.map((r: { row: number }) => [r.row, r]));
    // A brother through the same parent's number: linked, with a warning that says so.
    expect(byRow[3]).toMatchObject({ ok: true, errors: [] });
    expect(byRow[3].warnings[0]).toContain("Ravi Verma (9876543210) is already in your school: linked as saved.");
    expect(byRow[4]).toMatchObject({ ok: false, errors: [{ path: "gender", message: "Choose the gender" }] });
    expect(byRow[5]).toMatchObject({ ok: false, errors: [{ path: "sectionId", message: "Choose the section" }] });
    expect(byRow[6].ok).toBe(false);
    expect(byRow[6].errors[0].message).toContain("Asha Verma, born on 2016-05-14, is already in your school");
    expect(byRow[7]).toMatchObject({ ok: false, errors: [{ path: "admissionNumber", message: "Use letters, digits and / - . _ in the admission number (up to 30)" }] });
    expect(byRow[8]).toMatchObject({ ok: false, errors: [{ path: "admissionNumber", message: "Admission number ADM-2026-0001 is already Asha Verma's" }] });
    expect(byRow[9]).toMatchObject({ ok: true });
    expect(res.body.data).toMatchObject({ dryRun: true, ok: 2, failed: 5 });

    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect(await Guardian.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it("refuses a row that gives a child two fathers or two mothers, naming the second one, and admits the same family written right", async () => {
    const s = await school();
    const parents = (...relations: string[]) => ({ guardians: relations.map((relation, i) => ({ name: `Parent ${i}`, relation, isPrimary: i === 0, mobile: `98000000${i}0` })) });
    const res = await importRows(s.token, {
      dryRun: false,
      rows: [
        row(3, studentBody(s.class1, null, { firstName: "Aman", ...parents("Father", "Father") })),
        row(4, studentBody(s.class1, null, { firstName: "Bani", ...parents("Mother", "Father", "Mother") })),
        row(5, studentBody(s.class1, null, { firstName: "Chirag", ...parents("Father", "Mother", "Guardian") })),
      ],
    });
    const byRow = Object.fromEntries(res.body.data.results.map((r: { row: number }) => [r.row, r]));
    expect(byRow[3]).toMatchObject({ ok: false, errors: [{ path: "guardians.1.relation", message: "A child has only one father: choose Guardian or Other for this one" }] });
    expect(byRow[4]).toMatchObject({ ok: false, errors: [{ path: "guardians.2.relation", message: "A child has only one mother: choose Guardian or Other for this one" }] });
    expect(byRow[5].ok).toBe(true);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it("is refused as a whole for a school with no academic year, and for anyone who may not admit", async () => {
    const old = await createSchool("Old Public School");
    const res = await importRows(old.token, { dryRun: true, rows: [row(3, {})] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_ACTIVE_YEAR");
    const s = await school();
    expect((await importRows(await addColleague(s.tenantId, "accountant"), { dryRun: true, rows: [row(3, {})] })).status).toBe(403);
    const tooMany = await importRows(s.token, { dryRun: true, rows: Array.from({ length: 101 }, (_, i) => row(i + 3, {})) });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.details).toEqual([{ path: "rows", message: "Send up to 100 rows at a time" }]);
  });
});

describe("importing the rows", () => {
  it("admits every good row, keeps the school's own numbers, links brothers and sisters to one parent, and reports the rest", async () => {
    const s = await school();
    const res = await importRows(s.token, {
      dryRun: false,
      rows: [
        row(3, studentBody(s.class5, s.a, { firstName: "Asha" }), "2019/45"),
        // A sister later in the same file, through the same (new) mobile number.
        row(4, studentBody(s.class1, null, { firstName: "Kabir", dateOfBirth: "2020-08-01" })),
        row(5, studentBody(s.class5, s.a, { firstName: "Zoya", ...family("Imran Ali", "9111111111") }), "ADM-2026-0450"),
        row(6, studentBody(s.class5, s.a, { firstName: "", ...family("Anil Rao", "9222222222") })),
        row(7, studentBody(s.class5, s.a, { firstName: "Neel", ...family("Anil Rao", "9222222223") })),
      ],
    });
    expect(res.status).toBe(200);
    const results = res.body.data.results as { row: number; ok: boolean; student?: { admissionNumber: string } }[];
    expect(results.map((r) => [r.row, r.ok, r.student?.admissionNumber ?? null])).toEqual([
      [3, true, "2019/45"],
      [4, true, "ADM-2026-0001"],
      [5, true, "ADM-2026-0450"],
      [6, false, null],
      // The counter moved past the school's ADM-2026-0450.
      [7, true, "ADM-2026-0451"],
    ]);
    expect(res.body.data).toMatchObject({ dryRun: false, ok: 4, failed: 1 });
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(4);
    // Ravi Verma once, for Asha and Kabir.
    expect(await Guardian.countDocuments({ tenantId: s.tenantId, mobile: "9876543210" })).toBe(1);
    const lookup = await request(app).post(`${api}/guardians/lookup`).set(auth(s.token)).send({ mobile: "9876543210" });
    expect(lookup.body.data.guardian.children.map((c: { name: string }) => c.name)).toEqual(["Asha Verma", "Kabir Verma"]);

    // The same file again: everyone is already there, nobody is admitted twice.
    const again = await importRows(s.token, { dryRun: false, rows: [row(3, studentBody(s.class5, s.a, { firstName: "Asha" }), "2019/45")] });
    expect(again.body.data.results[0]).toMatchObject({ ok: false });
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(4);
  });

  it("keeps a full section full unless the person said to go over, and then goes over", async () => {
    const s = await school();
    const rows = [1, 2, 3].map((i) => row(i + 2, studentBody(s.class5, s.b, { firstName: `Kid${String.fromCharCode(64 + i)}`, ...family(`Parent ${i}`, `900000000${i}`) })));
    const strict = await importRows(s.token, { dryRun: false, rows });
    expect(strict.body.data.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false, false]);
    expect(strict.body.data.results[1].errors).toEqual([{ path: "sectionId", message: "Class 5 - B is full (1 of 1 seats taken)" }]);
    // The refusal's code, so the screen can offer "admit them anyway" for exactly these rows.
    expect(strict.body.data.results[1].code).toBe("SECTION_FULL");

    const anyway = await importRows(s.token, { dryRun: false, allowOverCapacity: true, rows: rows.slice(1) });
    expect(anyway.body.data.ok).toBe(2);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(3);
  });
});

describe("the details every school has, in a bulk upload", () => {
  const nursery = async (token: string) => (await request(app).post(`${academics}/classes`).set(auth(token)).send({ name: "Nursery", sectionCount: 0 })).body.data.id as string;

  it("a row without an address, or into Class 1 to 12 without a previous school, is still admitted (an old register seldom holds them) and says what the school still needs", async () => {
    const s = await school();
    const small = await nursery(s.token);
    const rows = [
      row(3, studentBody(s.class1, null, { previousSchool: undefined, ...family("Anil Rao", "9111111111") })),
      row(4, studentBody(small, null, { previousSchool: undefined, firstName: "Mira", ...family("Imran Ali", "9222222222") })),
      row(5, studentBody(small, null, { address: undefined, firstName: "Tara", ...family("Sunil Das", "9333333333") })),
      row(6, studentBody(s.class1, null, { firstName: "Kabir", ...family("Anil Mishra", "9444444444") })),
    ];
    // A check says the same as the import.
    const check = await importRows(s.token, { dryRun: true, rows });
    expect(check.body.data.ok).toBe(4);

    const res = await importRows(s.token, { dryRun: false, rows });
    const byRow = Object.fromEntries(res.body.data.results.map((r: { row: number }) => [r.row, r])) as Record<number, { ok: boolean; warnings: string[] }>;
    expect(res.body.data.ok).toBe(4);
    // Class 1: the school needs a previous school; Nursery does not; the address is needed for everyone.
    expect(byRow[3].warnings.join(" ")).toContain("Previous school");
    expect(byRow[4].warnings.join(" ")).not.toContain("Previous school");
    expect(byRow[5].warnings.join(" ")).toContain("House and street");
    expect(byRow[5].warnings.join(" ")).toContain("PIN code");
    expect(byRow[6].warnings).toEqual([]);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(4);
  });

  it("an address that is given is still checked: a PIN code of 5 digits is refused", async () => {
    const s = await school();
    const res = await importRows(s.token, { dryRun: false, rows: [row(3, studentBody(s.class1, null, { address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "4620" } }))] });
    expect(res.body.data.results[0]).toMatchObject({ ok: false, errors: [{ path: "address.pincode" }] });
  });
});

describe("the school's own fields in a bulk upload", () => {
  const settingsOf = async (token: string) => (await request(app).get(`${api}/settings`).set(auth(token))).body.data;  const putSettings = (token: string, body: object) => request(app).put(`${api}/settings`).set(auth(token)).send(body);
  const OWN = [
    { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" },
    { key: "c_bus001", label: "Bus pass no.", type: "text", options: [], mode: "optional" },
    { key: "c_fee001", label: "Fee paid", type: "yesNo", options: [], mode: "optional" },
    { key: "c_hgt001", label: "Height (cm)", type: "number", options: [], mode: "optional" },
    { key: "c_join01", label: "Hostel from", type: "date", options: [], mode: "optional" },
  ];

  it("a field made from the upload's table is saved in one request, at the end of the file, and the rows' answers to it are admitted", async () => {
    const s = await school();
    const before = await settingsOf(s.token);
    // What the table's "Create a new field" sends: the school's fields plus the new one, and its column after the layout's last.
    const saved = await putSettings(s.token, { customFields: [...before.customFields, OWN[0]], exportColumns: [...before.exportColumns, { key: "c_house1", heading: "House" }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.customFields).toEqual([OWN[0]]);
    expect(saved.body.data.exportColumns).toEqual([...before.exportColumns, { key: "c_house1", heading: "House" }]);
    // Nothing else about the school's fields changes.
    expect(saved.body.data.fields).toEqual(before.fields);

    const res = await importRows(s.token, {
      dryRun: false,
      rows: [
        row(3, studentBody(s.class5, s.a, { custom: { c_house1: "Red" } })),
        row(4, studentBody(s.class5, s.a, { firstName: "Kabir", ...family("Anil Rao", "9111111111"), custom: { c_house1: "Green" } })),
      ],
    });
    expect(res.body.data.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
    expect(res.body.data.results[1].errors).toEqual([{ path: "custom.c_house1", message: "Choose the House from the list" }]);
    const asha = await request(app).get(`${api}/${res.body.data.results[0].student.id}`).set(auth(s.token));
    expect(asha.body.data.custom).toEqual({ c_house1: "Red" });

    const sheet = (await workbookOf((await download(s.token, "/export")).body)).getWorksheet("Students")!;
    const headings = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(headings.at(-1)).toBe("House");
    expect((sheet.getRow(2).values as unknown[]).slice(1).at(-1)).toBe("Red");
  });

  it("keeps every kind of answer as its kind, and its export is read back with the same headings and values", async () => {
    const s = await school();
    // The columns every export has (the details every school keeps), then the school's own fields.
    const fixed = (await settingsOf(s.token)).exportColumns as { key: string; heading: string }[];
    const layout = [...fixed, ...OWN.map((f) => ({ key: f.key, heading: f.label }))];
    expect((await putSettings(s.token, { customFields: OWN, exportColumns: layout })).status).toBe(200);
    const res = await importRows(s.token, {
      dryRun: false,
      rows: [row(3, studentBody(s.class5, s.a, { custom: { c_house1: "Blue", c_bus001: "  BP   12 ", c_fee001: true, c_hgt001: 132, c_join01: "2026-04-01" } }))],
    });
    expect(res.body.data.results[0], JSON.stringify(res.body.data.results[0])).toMatchObject({ ok: true });
    const student = await request(app).get(`${api}/${res.body.data.results[0].student.id}`).set(auth(s.token));
    expect(student.body.data.custom).toEqual({ c_house1: "Blue", c_bus001: "BP 12", c_fee001: true, c_hgt001: 132, c_join01: "2026-04-01" });

    const file = (await download(s.token, "/export")).body as Buffer;
    const sheet = (await workbookOf(file)).getWorksheet("Students")!;
    const exported = Object.fromEntries(layout.map((c, i) => [c.heading, (sheet.getRow(2).values as unknown[])[i + 1]]));
    expect(exported).toMatchObject({ "Student Name": "Asha Verma", Class: "Class 5", Section: "A", House: "Blue", "Bus pass no.": "BP 12", "Fee paid": "Yes", "Height (cm)": 132, "Hostel from": "01-04-2026" });

    // The same file uploaded back: the school's headings and the values as text, for the table to read them again.
    const read = await upload(s.token, "export.xlsx", file);
    expect(read.status).toBe(200);
    expect(read.body.data.headers).toEqual(layout.map((c) => c.heading));
    const cells = Object.fromEntries(layout.map((c, i) => [c.heading, read.body.data.rows[0].cells[i]]));
    expect(cells).toMatchObject({ "Student Name": "Asha Verma", Class: "Class 5", Section: "A", House: "Blue", "Bus pass no.": "BP 12", "Fee paid": "Yes", "Height (cm)": "132", "Hostel from": "01-04-2026" });
    expect(read.body.data.rows).toHaveLength(1);
  });

  it("refuses an answer to a field that is another school's, and admits nobody for it", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    expect((await putSettings(a.token, { customFields: [OWN[0]] })).status).toBe(200);
    const res = await importRows(b.token, { dryRun: false, rows: [row(3, studentBody(b.class5, b.a, { custom: { c_house1: "Red" } }))] });
    expect(res.body.data.results[0]).toMatchObject({ ok: false, errors: [{ path: "custom.c_house1", message: "This is not one of your school's fields" }] });
    expect(await Student.countDocuments({ tenantId: b.tenantId })).toBe(0);
  });

  it("refuses values outside the form's lists that a sheet can carry (gender, state, blood group, category), with the form's words", async () => {
    const s = await school();
    const res = await importRows(s.token, {
      dryRun: true,
      rows: [
        row(3, studentBody(s.class5, s.a, { gender: "Robot" })),
        row(4, studentBody(s.class5, s.a, { address: { line1: "12 MG Road", city: "Bhopal", state: "Narnia", pincode: "462001" } })),
        row(5, studentBody(s.class5, s.a, { bloodGroup: "Z+", category: "Rich" })),
      ],
    });
    const byRow = Object.fromEntries(res.body.data.results.map((r: { row: number }) => [r.row, r]));
    expect(byRow[3].errors).toEqual([{ path: "gender", message: "Choose the gender" }]);
    expect(byRow[4].errors).toEqual([{ path: "address.state", message: "Choose the state" }]);
    expect(byRow[5].errors).toEqual(
      expect.arrayContaining([
        { path: "bloodGroup", message: "Choose a blood group from the list" },
        { path: "category", message: "Choose a category from the list" },
      ])
    );
  });
});

describe("the export", () => {
  it("is every student of this year in the template's columns, in class order, with the list's filters", async () => {
    const s = await school();
    await request(app)
      .post(api)
      .set(auth(s.token))
      .send(
        studentBody(s.class5, s.a, {
          guardians: [
            { name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210", email: "ravi@example.com" },
            { name: "Sita Verma", relation: "Mother", isPrimary: false, mobile: "9876543211" },
          ],
          rollNumber: 7,
          bloodGroup: "B+",
        })
      );
    await request(app).post(api).set(auth(s.token)).send(studentBody(s.class1, null, { firstName: "Kabir", dateOfBirth: "2020-08-01", ...family("Anil Rao", "9111111111") }));

    const res = await download(s.token, "/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/students-sunrise-public-school-\d{4}-\d{2}-\d{2}\.xlsx/);
    const sheet = (await workbookOf(res.body)).getWorksheet("Students")!;
    // A new school's layout: the details schools ask for most, in this order.
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([
      "Admission No.", "Student Name", "Gender", "Date of Birth", "Age", "Category", "Class", "Section", "Father's Name", "Father's Mobile",
      "Father's Occupation", "Mother's Name", "Mother's Mobile", "Mother's Occupation", "Address", "Area or Landmark", "City or Village",
      "State", "PIN Code", "Previous School", "Last Class", "TC No.", "TC Date", "Blood Group", "Aadhaar No.",
    ]);
    const values = (n: number) => (sheet.getRow(n).values as unknown[]).slice(1);
    const age = (dob: string) => {
      const [y, m, d] = dob.split("-").map(Number);
      const [ty, tm, td] = todayInIndia().split("-").map(Number);
      return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
    };
    // Class 1 first (teaching order).
    expect(values(2).slice(0, 8)).toEqual(["ADM-2026-0002", "Kabir Verma", "Female", "01-08-2020", age("2020-08-01"), "", "Class 1", ""]);
    expect(values(3)).toEqual([
      "ADM-2026-0001", "Asha Verma", "Female", "14-05-2016", age("2016-05-14"), "", "Class 5", "A", "Ravi Verma", "9876543210", "",
      "Sita Verma", "9876543211", "", "12 MG Road", "", "Bhopal", "Madhya Pradesh", "462001", "Little Flower School", "", "", "", "B+", "",
    ]);

    const filtered = await workbookOf((await download(s.token, `/export?classId=${s.class1}`)).body);
    expect(filtered.getWorksheet("Students")!.rowCount).toBe(2);
    const searched = await workbookOf((await download(s.token, "/export?q=kabir")).body);
    expect(searched.getWorksheet("Students")!.getRow(2).getCell(2).value).toBe("Kabir Verma");

    expect((await download(await addColleague(s.tenantId, "accountant"), "/export")).status).toBe(200);
    expect((await download(await addColleague(s.tenantId, "teacher"), "/export")).status).toBe(403);
  });

  it("holds only the caller's school", async () => {
    const a = await school("Sunrise Public School");
    const b = await school("Moonrise Public School");
    await request(app).post(api).set(auth(a.token)).send(studentBody(a.class5, a.a));
    const theirs = await workbookOf((await download(b.token, "/export")).body);
    expect(theirs.getWorksheet("Students")!.rowCount).toBe(1);

    // School B cannot put a student into school A's class through an import either.
    const res = await importRows(b.token, { dryRun: false, rows: [row(3, studentBody(a.class5, a.a, family("Anil Rao", "9111111111")))] });
    expect(res.body.data.results[0]).toMatchObject({ ok: false, errors: [{ path: "classId" }] });
    expect(await Student.countDocuments({ tenantId: b.tenantId })).toBe(0);
  });
});
