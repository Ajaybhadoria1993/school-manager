import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { generatePassword, PASSWORD_POLICY_REGEX } from "../../../utils/authUtils";
import { Subject } from "../../subjects/models/Subject";
import { Teacher } from "../models/Teacher";
import { usernameBase } from "../services/usernames.service";

const api = "/api/v1/staff/teachers";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
const importRows = (token: string, rows: object[]) => request(app).post(`${api}/import`).set(auth(token)).send({ rows });
const subject = async (token: string, name: string) => (await request(app).post("/api/v1/subjects").set(auth(token)).send({ name })).body.data.id as string;
const signIn = (identifier: string, password: string) => request(app).post("/api/v1/auth/login").send({ identifier, password });

/** One row of an import: what the screen sends for a teacher (the boxes as Add teacher sends them, without the login). */
const row = (n: number, teacher: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ row: n, teacher, ...more });
const meena = { name: "Meena Singh", mobile: "9876543210", gender: "Female" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("what the import makes up for a teacher", () => {
  it("makes a password that follows the platform's rule, different each time, easy to read out", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const password = generatePassword();
      expect(password).toMatch(PASSWORD_POLICY_REGEX);
      expect(password).toHaveLength(10);
      expect(password).not.toMatch(/[0O1lI]/);
      seen.add(password);
    }
    expect(seen.size).toBeGreaterThan(290);
  });

  it("makes the username from the name like Add teacher does: first.last, no titles, nothing for a name with no a-z letters", () => {
    expect(usernameBase("Meena Singh")).toBe("meena.singh");
    expect(usernameBase("Dr. Meena  Kumari Singh")).toBe("meena.singh");
    expect(usernameBase("Asha")).toBe("asha");
    expect(usernameBase("Al")).toBe("al.teacher");
    expect(usernameBase("Zoë Müller")).toBe("zoe.muller");
    expect(usernameBase("मीना सिंह")).toBe("");
    expect(usernameBase("1234 Raj")).toBe("raj");
  });
});

describe("the sample template", () => {
  it("is a spreadsheet for this school: coloured titles with notes, dropdowns, its subjects, how to fill it", async () => {
    const s = await createSchool("Sunrise Public School");
    await subject(s.token, "Mathematics");
    await subject(s.token, "Hindi");
    const res = await download(s.token, "/import/template");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("teachers-template-sunrise-public-school.xlsx");

    const workbook = await workbookOf(res.body);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Teachers", "Subjects", "Lists", "How to fill"]);
    const sheet = workbook.getWorksheet("Teachers")!;
    expect(String(sheet.getCell("A1").value)).toContain("Dates as DD-MM-YYYY");
    const titles = (sheet.getRow(2).values as unknown[]).slice(1).map(String);
    expect(titles).toEqual([
      "Name *",
      "Mobile *",
      "Gender",
      "Date of Birth",
      "Email",
      "Address",
      "City",
      "State",
      "PIN Code",
      "Employee Code",
      "Designation",
      "Qualification",
      "Experience (years)",
      "Joining Date",
      "Employment Type",
      "Subjects",
      "Username",
      "Password",
    ]);
    expect(sheet.getCell("A2").note).toBeTruthy();
    // Only the name and the mobile number (the login needs it) are green; the rest is yellow.
    const fill = (cell: string) => (sheet.getCell(cell).fill as ExcelJS.FillPattern).fgColor?.argb;
    expect(fill("A2")).toBe(fill("B2"));
    expect(fill("A2")).not.toBe(fill("C2"));
    expect(fill("C2")).toBe(fill("R2"));
    expect(sheet.getCell("C3").dataValidation).toMatchObject({ type: "list", formulae: ['"Male,Female,Other"'] });
    expect(sheet.getCell("O3").dataValidation).toMatchObject({ type: "list", formulae: ['"Full time,Part time,Contract"'] });
    expect(sheet.getCell("H3").dataValidation).toMatchObject({ type: "list" });
    // A mobile number, a PIN code, a code and a day keep their digits as typed.
    for (const column of ["B", "I", "J", "D", "N"]) expect(sheet.getColumn(column).numFmt).toBe("@");

    const subjects = workbook.getWorksheet("Subjects")!;
    expect([subjects.getCell("A2").value, subjects.getCell("A3").value]).toEqual(["Hindi", "Mathematics"]);
    const help = (workbook.getWorksheet("How to fill")!.getColumn(1).values as unknown[]).map(String);
    expect(help.some((line) => line.includes("Green columns are the only ones every teacher needs: Name, Mobile"))).toBe(true);
    expect(help.some((line) => line.includes("Username and Password"))).toBe(true);
  });

  it("is for the people who run the school only", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["accountant", "teacher", "parent"] as const) {
      expect((await download(await addColleague(s.tenantId, role), "/import/template")).status).toBe(403);
    }
    expect((await request(app).get(`${api}/import/template`)).status).toBe(401);
  });
});

describe("reading an uploaded file", () => {
  it("reads the school's own template back: titles with their stars, rows with their numbers, every digit of a mobile number", async () => {
    const s = await createSchool("Sunrise Public School");
    const workbook = await workbookOf((await download(s.token, "/import/template")).body);
    const sheet = workbook.getWorksheet("Teachers")!;
    sheet.getRow(3).values = ["", "Meena Singh", "9876543210", "Female", "14-05-1988"];
    sheet.getRow(5).values = ["", "Dev Patel", 9876500000];
    const res = await upload(s.token, "staff.xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(res.status).toBe(200);
    expect(res.body.data.headerRow).toBe(2);
    expect(res.body.data.headers.slice(0, 4)).toEqual(["Name *", "Mobile *", "Gender", "Date of Birth"]);
    expect(res.body.data.rows).toEqual([
      { row: 3, cells: expect.arrayContaining(["Meena Singh", "9876543210", "Female", "14-05-1988"]) },
      { row: 5, cells: expect.arrayContaining(["Dev Patel", "9876500000"]) },
    ]);
  });

  it("reads a school's own sheet (a csv) as it is written", async () => {
    const s = await createSchool("Sunrise Public School");
    const csv = 'Teacher Name,Phone,Subject\r\n"Singh, Meena",98765 43210,"Maths, Science"\r\n';
    const res = await upload(s.token, "staff.csv", Buffer.from(csv, "utf8"));
    expect(res.status).toBe(200);
    expect(res.body.data.headers).toEqual(["Teacher Name", "Phone", "Subject"]);
    expect(res.body.data.rows).toEqual([{ row: 2, cells: ["Singh, Meena", "98765 43210", "Maths, Science"] }]);
  });

  it("refuses what it cannot read, with a sentence that speaks of teachers", async () => {
    const s = await createSchool("Sunrise Public School");
    const cases: [string, Buffer, string, RegExp?][] = [
      ["old.xls", Buffer.from("x"), "IMPORT_FILE_TYPE"],
      ["broken.xlsx", Buffer.from("this is not a zip"), "IMPORT_FILE_UNREADABLE"],
      ["titles.csv", Buffer.from("Name,Mobile,Gender\n"), "IMPORT_EMPTY", /no teachers/],
      ["one-column.csv", Buffer.from("Name\nAsha\n"), "IMPORT_NO_HEADER", /Name, Mobile/],
      ["big.csv", Buffer.from(`Name,Mobile,Gender\n${"Asha,9876543210,Female\n".repeat(301)}`), "IMPORT_TOO_MANY_ROWS", /301 teachers/],
      ["huge.csv", Buffer.alloc(6 * 1024 * 1024, 65), "IMPORT_FILE_TOO_BIG"],
    ];
    for (const [name, content, code, words] of cases) {
      const res = await upload(s.token, name, content);
      expect(res.status, name).toBe(400);
      expect(res.body.code, name).toBe(code);
      expect(res.body.details[0]).toMatchObject({ path: "file" });
      if (words) expect(res.body.message, name).toMatch(words);
    }
    const none = await request(app).post(`${api}/import/read`).set(auth(s.token)).field("note", "no file");
    expect(none.body.code).toBe("IMPORT_FILE_MISSING");
  });

  it("is for the people who run the school only", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["teacher", "accountant", "parent"] as const) {
      expect((await upload(await addColleague(s.tenantId, role), "x.csv", Buffer.from("a,b,c\n1,2,3"))).status).toBe(403);
    }
    expect((await request(app).post(`${api}/import/read`).attach("file", Buffer.from("a,b,c"), "x.csv")).status).toBe(401);
  });
});

describe("bringing the teachers in", () => {
  it("makes each teacher with a login of their own: a username and a password made up, which sign in", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await importRows(s.token, [row(3, meena), row(4, { name: "Dev Patel", mobile: "9876500000", email: "Dev@School.Example", gender: "Male" })]);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: 2, failed: 0 });
    const [first, second] = res.body.data.results;
    expect(first).toMatchObject({ row: 3, ok: true, errors: [], teacher: { name: "Meena Singh" } });
    expect(first.login.username).toMatch(/^meena\.singh_\d{2,4}$/);
    expect(first.login.password).toMatch(PASSWORD_POLICY_REGEX);
    expect(second.login.username).toMatch(/^dev\.patel_\d{2,4}$/);

    // The login works for the person: with the username and with the made-up password.
    const signed = await signIn(first.login.username, first.login.password);
    expect(signed.status).toBe(200);
    expect(signed.body.data.user.role).toBe("teacher");
    expect((await signIn(first.login.username, "Wrong@Pass1")).status).toBe(401);

    const list = await request(app).get(`${api}?status=all`).set(auth(s.token));
    expect(list.body.data.items.map((t: { name: string }) => t.name)).toEqual(["Dev Patel", "Meena Singh"]);
    expect(list.body.data.items[1]).toMatchObject({ mobile: "9876543210", gender: "Female", login: { username: first.login.username, isActive: true } });
    expect(list.body.data.items[0].email).toBe("dev@school.example");
  });

  it("keeps the username and the password the file gives, and does not send the password back", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await importRows(s.token, [row(3, meena, { username: "Meena.S", password: "Sch00l@Teach1" })]);
    expect(res.body.data.results[0]).toMatchObject({ ok: true, login: { username: "meena.s", password: null } });
    expect((await signIn("meena.s", "Sch00l@Teach1")).status).toBe(200);
  });

  it("gives two teachers of the same name two different usernames", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await importRows(s.token, [row(3, meena), row(4, { ...meena, mobile: "9876543211" }), row(5, { ...meena, mobile: "9876543212" })]);
    expect(res.body.data.ok).toBe(3);
    const usernames = res.body.data.results.map((r: { login: { username: string } }) => r.login.username);
    expect(new Set(usernames).size).toBe(3);
  });

  it("keeps the details as Add teacher keeps them (tidy name, 10-digit mobile, upper-case code, the day, the address)", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await importRows(s.token, [
      row(3, {
        name: "  Meena   Singh ",
        mobile: "+91 98765 43210",
        gender: "Female",
        dateOfBirth: "1988-07-14",
        email: null,
        address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
        employeeCode: "emp-014",
        designation: "PGT (Post graduate teacher)",
        qualification: "M.Sc., B.Ed.",
        experienceYears: 12,
        joiningDate: "2015-06-01",
        employmentType: "full_time",
      }),
    ]);
    expect(res.body.data.results[0].ok).toBe(true);
    const saved = (await request(app).get(`${api}/${res.body.data.results[0].teacher.id}`).set(auth(s.token))).body.data;
    expect(saved).toMatchObject({
      name: "Meena Singh",
      mobile: "9876543210",
      employeeCode: "EMP-014",
      dateOfBirth: "1988-07-14",
      joiningDate: "2015-06-01",
      experienceYears: 12,
      employmentType: "full_time",
      designation: "PGT (Post graduate teacher)",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
    });
  });

  it("says what is wrong with a row by box, and the rows around it still go in", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await importRows(s.token, [
      row(3, { name: "Good One", mobile: "9876543210" }),
      row(4, { name: "", mobile: "12345" }),
      row(5, { name: "No Mobile" }),
      row(6, { name: "Bad Mail", mobile: "9876543211", email: "not-an-email" }),
      row(7, { name: "Too Young", mobile: "9876543212", dateOfBirth: "2015-01-01" }),
      row(8, { name: "Odd Gender", mobile: "9876543213", gender: "Boy" }),
      row(9, { name: "Far Joining", mobile: "9876543214", joiningDate: "2099-01-01" }),
      row(10, { name: "Bad Pin", mobile: "9876543215", address: { pincode: "46200" } }),
      row(11, { name: "Veteran", mobile: "9876543216", experienceYears: 99 }),
      row(12, { name: "Also Good", mobile: "9876543217" }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: 2, failed: 8 });
    const byRow = new Map<number, { ok: boolean; errors: { path: string; message: string }[] }>(res.body.data.results.map((r: { row: number }) => [r.row, r]));
    const paths = (n: number) => byRow.get(n)!.errors.map((e) => e.path);
    expect(byRow.get(3)!.ok).toBe(true);
    expect(byRow.get(12)!.ok).toBe(true);
    expect(paths(4).sort()).toEqual(["mobile", "name"]);
    expect(paths(5)).toEqual(["mobile"]);
    expect(byRow.get(5)!.errors[0].message).toContain("their login needs it");
    expect(paths(6)).toEqual(["email"]);
    expect(paths(7)).toEqual(["dateOfBirth"]);
    expect(paths(8)).toEqual(["gender"]);
    expect(paths(9)).toEqual(["joiningDate"]);
    expect(paths(10)).toEqual(["address.pincode"]);
    expect(paths(11)).toEqual(["experienceYears"]);
    // Nothing of a refused row was made.
    expect(await Teacher.countDocuments({ tenantId: s.tenantId })).toBe(2);
  });

  it("refuses a username or a password that cannot be one, and a taken username with free ones like it", async () => {
    const s = await createSchool("Sunrise Public School");
    await importRows(s.token, [row(3, { name: "Dev Patel", mobile: "9876500000" }, { username: "dev.patel", password: "Sch00l@Teach1" })]);
    const res = await importRows(s.token, [
      row(3, meena, { username: "9bad name" }),
      row(4, { ...meena, mobile: "9876543211" }, { password: "weak" }),
      row(5, { ...meena, mobile: "9876543212" }, { username: "dev.patel" }),
      row(6, { name: "मीना सिंह", mobile: "9876543213" }),
    ]);
    const results = res.body.data.results;
    expect(results[0].errors[0]).toMatchObject({ path: "username" });
    expect(results[1].errors[0]).toMatchObject({ path: "password" });
    expect(results[2]).toMatchObject({ ok: false, code: "USERNAME_TAKEN", errors: [{ path: "username" }] });
    expect(results[2].errors[0].message).toMatch(/for example dev\.patel_\d+/);
    // A name with no letters a-z gets no made-up username: the school types one.
    expect(results[3]).toMatchObject({ ok: false, errors: [{ path: "username" }] });
    expect(results[3].errors[0].message).toContain("username");
  });

  it("does not take a teacher twice: the mobile number, the employee code and the login's email are another person's", async () => {
    const s = await createSchool("Sunrise Public School");
    const first = await importRows(s.token, [row(3, { ...meena, employeeCode: "EMP-1", email: "meena@school.example" })]);
    expect(first.body.data.ok).toBe(1);
    const again = await importRows(s.token, [
      row(3, { ...meena, employeeCode: "EMP-1", email: "meena@school.example" }),
      row(4, { name: "Another", mobile: "9876543299", employeeCode: "emp-1" }),
      row(5, { name: "Mail Twin", mobile: "9876543298", email: "meena@school.example" }),
      row(6, { name: "Same Mobile Again", mobile: "9876543210" }),
    ]);
    const [a, b, c, d] = again.body.data.results;
    expect(a).toMatchObject({ ok: false, code: "TEACHER_MOBILE_EXISTS", errors: [{ path: "mobile", message: "Meena Singh already has this mobile number" }] });
    expect(b).toMatchObject({ ok: false, code: "TEACHER_CODE_EXISTS", errors: [{ path: "employeeCode" }] });
    expect(c).toMatchObject({ ok: false, code: "LOGIN_EMAIL_TAKEN", errors: [{ path: "email" }] });
    expect(d.code).toBe("TEACHER_MOBILE_EXISTS");
    expect(await Teacher.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it("refuses the same mobile twice in one request: the second row meets the first", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await importRows(s.token, [row(3, meena), row(4, { ...meena, name: "Meena S." })]);
    expect(res.body.data).toMatchObject({ ok: 1, failed: 1 });
    expect(res.body.data.results[1]).toMatchObject({ ok: false, code: "TEACHER_MOBILE_EXISTS" });
  });

  it("reads the subjects by their names: the school's own (any capitals) and, for a name it has not got, a new subject", async () => {
    const s = await createSchool("Sunrise Public School");
    const maths = await subject(s.token, "Mathematics");
    const res = await importRows(s.token, [
      row(3, meena, { subjectNames: ["mathematics", "Sanskrit"] }),
      row(4, { name: "Dev Patel", mobile: "9876500000" }, { subjectNames: ["SANSKRIT", "  Mathematics  ", "Mathematics"] }),
    ]);
    expect(res.body.data.ok).toBe(2);
    const subjects = await Subject.find({ tenantId: s.tenantId }).sort({ name: 1 }).lean();
    // One Sanskrit, made once, however many teachers name it.
    expect(subjects.map((x) => x.name)).toEqual(["Mathematics", "Sanskrit"]);
    expect(subjects[1].category).toBe("academic");
    const sanskrit = subjects[1]._id.toString();
    const teacher = async (name: string) => (await Teacher.findOne({ tenantId: s.tenantId, name }).lean())!;
    expect((await teacher("Meena Singh")).subjectIds.map(String).sort()).toEqual([maths, sanskrit].sort());
    expect((await teacher("Dev Patel")).subjectIds.map(String).sort()).toEqual([maths, sanskrit].sort());
  });

  it("makes no new subject for a row that is refused, and refuses subjects that cannot be one", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await importRows(s.token, [
      row(3, { name: "No Mobile" }, { subjectNames: ["Robotics"] }),
      row(4, meena, { subjectNames: ["<b>Hack</b>"] }),
      row(5, { ...meena, mobile: "9876543211" }, { subjectNames: Array.from({ length: 31 }, (_, i) => `Subject ${i}`) }),
    ]);
    expect(res.body.data).toMatchObject({ ok: 0, failed: 3 });
    expect(res.body.data.results[1].errors[0]).toMatchObject({ path: "subjects" });
    expect(res.body.data.results[2].errors[0]).toMatchObject({ path: "subjects" });
    expect(await Subject.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("takes up to 10 rows in one request (each teacher's password is hashed, which is slow on purpose) and at least one", async () => {
    const s = await createSchool("Sunrise Public School");
    const many = Array.from({ length: 11 }, (_, i) => row(i + 3, { name: `Teacher ${i}`, mobile: `98765${String(10000 + i)}` }));
    const tooMany = await importRows(s.token, many);
    expect(tooMany.status).toBe(400);
    expect((await importRows(s.token, [])).status).toBe(400);
    const full = await importRows(s.token, many.slice(0, 10));
    expect(full.status).toBe(200);
    expect(full.body.data.ok).toBe(10);
  });

  it("is for the people who run the school only", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["teacher", "accountant", "parent"] as const) {
      expect((await importRows(await addColleague(s.tenantId, role), [row(3, meena)])).status).toBe(403);
    }
    expect((await request(app).post(`${api}/import`).send({ rows: [row(3, meena)] })).status).toBe(401);
    expect(await Teacher.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("keeps schools apart: the same mobile number may be a teacher of another school, and the teachers go to the caller's school only", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    expect((await importRows(a.token, [row(3, meena)])).body.data.ok).toBe(1);
    const res = await importRows(b.token, [row(3, meena)]);
    expect(res.body.data).toMatchObject({ ok: 1, failed: 0 });
    expect(await Teacher.countDocuments({ tenantId: a.tenantId })).toBe(1);
    expect(await Teacher.countDocuments({ tenantId: b.tenantId })).toBe(1);
    // A username is one on the whole platform: the second school's Meena got another one.
    const names = (await Promise.all([a, b].map(async (x) => (await request(app).get(api).set(auth(x.token))).body.data.items[0].login.username))) as string[];
    expect(new Set(names).size).toBe(2);
  });
});
