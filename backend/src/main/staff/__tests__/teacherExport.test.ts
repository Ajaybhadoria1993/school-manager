import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { todayInIndia } from "../../students/schemas/students.schemas";

const api = "/api/v1/staff/teachers";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};
const exportOf = (token: string, query = "") => request(app).get(`${api}/export${query}`).set(auth(token)).buffer(true).parse(binary);
const sheetOf = async (buffer: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.getWorksheet("Teachers")!;
};
/** The rows under the titles, as text, by title. */
const tableOf = (sheet: ExcelJS.Worksheet) => {
  const titles = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    rows.push(Object.fromEntries(titles.map((t, i) => [t, String(row.getCell(i + 1).value ?? "")])));
  });
  return { titles, rows };
};
const subject = async (token: string, name: string) => (await request(app).post("/api/v1/subjects").set(auth(token)).send({ name })).body.data.id as string;
const add = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("exporting the teachers", () => {
  it("is one Excel file of the teachers (those who teach here, as the list shows them), with the template's columns first and the extras after", async () => {
    const s = await createSchool("Sunrise Public School");
    const maths = await subject(s.token, "Mathematics");
    const hindi = await subject(s.token, "Hindi");
    await add(s.token, {
      name: "Meena Singh",
      mobile: "9876543210",
      gender: "Female",
      dateOfBirth: "1988-07-14",
      email: "meena@school.example",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      employeeCode: "emp-014",
      designation: "PGT (Post graduate teacher)",
      qualification: "M.Sc., B.Ed.",
      experienceYears: 12,
      joiningDate: "2015-06-01",
      employmentType: "full_time",
      subjectIds: [maths, hindi],
      login: { username: "meena.singh_41", password: "Sch00l@Teach1" },
    });
    await add(s.token, { name: "Dev Patel", mobile: "9876500000" });

    const res = await exportOf(s.token);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain(`teachers-sunrise-public-school-${todayInIndia()}.xlsx`);

    const { titles, rows } = tableOf(await sheetOf(res.body));
    // The first columns are those of the sample file, so the file can be uploaded back; a password is never in it (only a hash is kept).
    expect(titles).toEqual([
      "Name", "Mobile", "Gender", "Date of Birth", "Email", "Address", "City", "State", "PIN Code", "Employee Code", "Designation", "Qualification",
      "Experience (years)", "Joining Date", "Employment Type", "Subjects", "Username", "Status", "Class teacher of", "Classes given",
    ]);
    expect(titles).not.toContain("Password");
    expect(rows.map((r) => r.Name)).toEqual(["Dev Patel", "Meena Singh"]);
    expect(rows[1]).toMatchObject({
      Mobile: "9876543210",
      Gender: "Female",
      "Date of Birth": "14-07-1988",
      Email: "meena@school.example",
      Address: "12 MG Road",
      City: "Bhopal",
      State: "Madhya Pradesh",
      "PIN Code": "462001",
      "Employee Code": "EMP-014",
      Designation: "PGT (Post graduate teacher)",
      Qualification: "M.Sc., B.Ed.",
      "Experience (years)": "12",
      "Joining Date": "01-06-2015",
      "Employment Type": "Full time",
      Subjects: "Hindi, Mathematics",
      Username: "meena.singh_41",
      Status: "Teaching",
    });
    // A teacher with nothing but a name and a mobile number: the boxes are empty, not "null".
    expect(rows[0]).toMatchObject({ Name: "Dev Patel", Gender: "", "Date of Birth": "", Subjects: "", Username: "", "Employment Type": "" });
  });

  it("keeps a mobile number, a PIN code and a code as text (their digits and zeros stay)", async () => {
    const s = await createSchool("Sunrise Public School");
    await add(s.token, { name: "Meena Singh", mobile: "9876543210", employeeCode: "007", address: { pincode: "012345" } });
    const sheet = await sheetOf((await exportOf(s.token)).body);
    for (const cell of ["B2", "I2", "J2"]) expect(typeof sheet.getCell(cell).value, cell).toBe("string");
    expect(sheet.getCell("J2").value).toBe("007");
    expect(sheet.getCell("I2").value).toBe("012345");
  });

  it("follows the list's tabs, search and filters, and says who has left and what they were given", async () => {
    const s = await createSchool("Sunrise Public School");
    const maths = await subject(s.token, "Mathematics");
    const a = await add(s.token, { name: "Meena Singh", mobile: "9876543210", subjectIds: [maths], designation: "PGT (Post graduate teacher)" });
    await add(s.token, { name: "Dev Patel", mobile: "9876500000" });
    const gone = await add(s.token, { name: "Old Teacher", mobile: "9876500011" });
    await request(app).patch(`${api}/${gone.body.data.id}`).set(auth(s.token)).send({ isActive: false });
    const names = async (query: string) => tableOf(await sheetOf((await exportOf(s.token, query)).body)).rows.map((r) => r.Name);

    expect(await names("")).toEqual(["Dev Patel", "Meena Singh"]);
    expect(await names("?status=inactive")).toEqual(["Old Teacher"]);
    expect(await names("?status=all")).toEqual(["Dev Patel", "Meena Singh", "Old Teacher"]);
    expect(await names("?search=meena")).toEqual(["Meena Singh"]);
    expect(await names(`?subjectId=${maths}`)).toEqual(["Meena Singh"]);
    expect(await names("?designation=PGT%20(Post%20graduate%20teacher)")).toEqual(["Meena Singh"]);
    expect(await names("?search=zzz")).toEqual([]);
    const left = tableOf(await sheetOf((await exportOf(s.token, "?status=inactive")).body)).rows[0];
    expect(left.Status).toBe("Left");
    expect(a.status).toBe(201);
  });

  it("is a file the bulk upload can read back: the same titles, the same rows", async () => {
    const s = await createSchool("Sunrise Public School");
    await add(s.token, { name: "Meena Singh", mobile: "9876543210", gender: "Female", dateOfBirth: "1988-07-14" });
    const file = (await exportOf(s.token)).body as Buffer;
    const read = await request(app).post(`${api}/import/read`).set(auth(s.token)).attach("file", file, "teachers.xlsx");
    expect(read.status).toBe(200);
    expect(read.body.data.headers.slice(0, 4)).toEqual(["Name", "Mobile", "Gender", "Date of Birth"]);
    expect(read.body.data.rows[0].cells.slice(0, 4)).toEqual(["Meena Singh", "9876543210", "Female", "14-07-1988"]);
    // Uploaded again, every teacher of it is one the school already has.
    const again = await request(app)
      .post(`${api}/import`)
      .set(auth(s.token))
      .send({ rows: [{ row: 2, teacher: { name: "Meena Singh", mobile: "9876543210" } }] });
    expect(again.body.data.results[0].code).toBe("TEACHER_MOBILE_EXISTS");
  });

  it("is for the people who run the school only: a teacher, the accountant and a parent are refused, a stranger is not let in", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["teacher", "accountant", "parent"] as const) {
      expect((await exportOf(await addColleague(s.tenantId, role))).status).toBe(403);
    }
    expect((await request(app).get(`${api}/export`)).status).toBe(401);
  });

  it("holds the caller's school only", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    await add(a.token, { name: "Meena Singh", mobile: "9876543210" });
    await add(b.token, { name: "Kabir Khan", mobile: "9876500022" });
    expect(tableOf(await sheetOf((await exportOf(a.token)).body)).rows.map((r) => r.Name)).toEqual(["Meena Singh"]);
    expect(tableOf(await sheetOf((await exportOf(b.token)).body)).rows.map((r) => r.Name)).toEqual(["Kabir Khan"]);
  });

  it("is a file with titles even when the school has no teacher", async () => {
    const s = await createSchool("Sunrise Public School");
    const { titles, rows } = tableOf(await sheetOf((await exportOf(s.token)).body));
    expect(titles[0]).toBe("Name");
    expect(rows).toEqual([]);
  });

  it("refuses a filter that could not be one", async () => {
    const s = await createSchool("Sunrise Public School");
    expect((await exportOf(s.token, "?status=everyone")).status).toBe(400);
    expect((await exportOf(s.token, "?subjectId=not-an-id")).status).toBe(400);
  });
});
