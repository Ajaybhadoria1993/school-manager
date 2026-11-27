import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { todayInIndia } from "../../students/schemas/students.schemas";

/** Teaching progress as an Excel file (docs/teaching-progress.md): the days and the filters asked, and only what the caller may see. */

const API = "/api/v1/classroom";
const today = todayInIndia();
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const yesterday = shift(today, -1);
const written = (day: string) => `${day.slice(8, 10)}-${day.slice(5, 7)}-${day.slice(0, 4)}`;

const fileOf = (token: string, query: Record<string, string> = {}) =>
  request(app)
    .get(`${API}/progress/export`)
    .query({ from: shift(today, -7), to: today, ...query })
    .set(auth(token))
    .buffer(true)
    .parse((res, done) => {
      const parts: Buffer[] = [];
      res.on("data", (part: Buffer) => parts.push(part));
      res.on("end", () => done(null, Buffer.concat(parts)));
    });

/** Every sheet as rows of text, headings first. */
async function sheetsOf(buffer: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return Object.fromEntries(
    book.worksheets.map((sheet) => {
      const rows: string[][] = [];
      sheet.eachRow((row) => rows.push(Array.from({ length: sheet.columnCount }, (_, i) => String(row.getCell(i + 1).value ?? ""))));
      return [sheet.name, rows];
    })
  );
}

async function taughtSchool() {
  const s = await classroomSchool();
  const put = (token: string, path: string, body: object) => request(app).put(`${API}${path}`).set(auth(token)).send({ ...s.a, ...body });
  const saved = await put(s.tokens.meena, "/syllabus", { subjectId: s.maths, chapters: [{ name: "Numbers", plannedOn: "2026-04-10" }, { name: "Fractions", plannedOn: "2027-03-20" }, { name: "Shapes" }] });
  const [, fractions] = saved.body.data.chapters as { id: string }[];
  await put(s.tokens.meena, "/diary", { subjectId: s.maths, date: yesterday, chapterId: fractions.id, taught: "Halves", homework: "=2+2" });
  await put(s.tokens.meena, "/diary", { subjectId: s.maths, date: today, chapterId: fractions.id, taught: "Adding fractions" });
  await put(s.tokens.dev, "/diary", { subjectId: s.english, date: today, taught: "Poem: The Kite" });
  return s;
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the Excel of teaching progress", () => {
  it("has the daily updates, the subjects, every chapter and the teachers", async () => {
    const s = await taughtSchool();
    const res = await fileOf(s.token);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain(`teaching-progress-sunrise-public-school-${today}.xlsx`);
    const sheets = await sheetsOf(res.body as Buffer);
    expect(Object.keys(sheets)).toEqual(["Daily updates", "Subjects", "Chapters", "Teachers"]);

    const [heads, ...updates] = sheets["Daily updates"];
    expect(heads).toEqual(["Day", "Class", "Subject", "Teacher", "Written by", "Chapter", "Taught", "Homework"]);
    expect(updates).toHaveLength(3);
    // Newest first; what a teacher typed stays text, even when it looks like a sum.
    expect(updates[2]).toEqual([written(yesterday), "Class 5", "Mathematics", "Meena Singh", "Meena Singh", "2. Fractions", "Halves", "=2+2"]);

    expect(sheets.Subjects[0]).toEqual(["Class", "Subject", "Teacher", "Chapters done", "Total chapters", "Chapters late", "Running chapter", "Updates", "Homework", "Last update"]);
    expect(sheets.Subjects[2]).toEqual(["Class 5", "Mathematics", "Meena Singh", "0", "3", "1", "2. Fractions", "2", "1", written(today)]);

    expect(sheets.Chapters[0]).toEqual(["Class", "Subject", "Teacher", "No.", "Chapter", "Finish by", "Finished on", "Days taught", "Status"]);
    expect(sheets.Chapters.slice(1)).toEqual([
      ["Class 5", "Mathematics", "Meena Singh", "1", "Numbers", "10-04-2026", "", "0", "Late"],
      ["Class 5", "Mathematics", "Meena Singh", "2", "Fractions", "20-03-2027", "", "2", "Running"],
      ["Class 5", "Mathematics", "Meena Singh", "3", "Shapes", "", "", "0", "Not started"],
    ]);

    expect(sheets.Teachers[0]).toEqual(["Teacher", "Class subjects", "Updates", "Homework", "Chapters done", "Total chapters", "Chapters late", "Without an update"]);
    expect(sheets.Teachers.slice(1)).toEqual([
      ["Dev Patel", "1", "1", "0", "0", "0", "0", "0"],
      ["Meena Singh", "1", "2", "1", "0", "3", "1", "0"],
    ]);
  });

  it("is of the days and filters asked", async () => {
    const s = await taughtSchool();
    const sheets = await sheetsOf((await fileOf(s.token, { from: today, to: today, subjectId: s.english })).body as Buffer);
    expect(sheets["Daily updates"].slice(1).map((r) => r[6])).toEqual(["Poem: The Kite"]);
    expect(sheets.Subjects.slice(1).map((r) => r[1])).toEqual(["English"]);
    expect(sheets.Chapters).toHaveLength(1);
  });

  it("holds only what the caller may see", async () => {
    const s = await taughtSchool();
    const dev = await sheetsOf((await fileOf(s.tokens.dev)).body as Buffer);
    expect(dev.Subjects.slice(1).map((r) => r[1])).toEqual(["English"]);
    expect(dev["Daily updates"].slice(1).map((r) => r[2])).toEqual(["English"]);
    expect((await fileOf(s.tokens.ravi)).status).toBe(403);
  });

  it("asks for real days", async () => {
    const s = await classroomSchool();
    expect((await request(app).get(`${API}/progress/export?from=2026-01-01&to=2027-06-01`).set(auth(s.token))).status).toBe(400);
    expect((await request(app).get(`${API}/progress/export`).set(auth(s.token))).status).toBe(400);
  });
});
