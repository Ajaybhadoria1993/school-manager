import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth, saveAllotments } from "../../../test/timetable";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { Syllabus } from "../models/ClassWork";

/**
 * The plan of a subject's chapters (docs/teaching-progress.md): a day by which each chapter is to be finished, "behind schedule" once that
 * day is gone and it is not finished, and copying a list of chapters from another section or an earlier year.
 */

const API = "/api/v1/classroom";
const today = todayInIndia();
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Days of the test school's session (2026-04-01 to 2027-03-31): long gone, and still to come. */
const gone = "2026-04-10";
const coming = "2027-03-20";

type Unit = { classId: string; sectionId: string | null };
interface Chapter {
  id: string;
  name: string;
  done: boolean;
  plannedOn: string | null;
  late: boolean;
}
const saveChapters = (token: string, u: Unit, subjectId: string, chapters: object[]) => request(app).put(`${API}/syllabus`).set(auth(token)).send({ ...u, subjectId, chapters });
const chaptersOf = async (token: string, u: Unit, subjectId: string) => {
  const res = await request(app).get(`${API}/diary?classId=${u.classId}&sectionId=${u.sectionId ?? "none"}&date=${today}`).set(auth(token));
  return res.body.data.subjects.find((x: { subjectId: string }) => x.subjectId === subjectId).chapters as Chapter[];
};
const sources = (token: string, u: Unit, subjectId: string) => request(app).get(`${API}/syllabus/sources`).query({ classId: u.classId, sectionId: u.sectionId ?? "none", subjectId }).set(auth(token));

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the planned day of a chapter", () => {
  it("is saved with the chapter; one whose day is gone and is not finished is late", async () => {
    const s = await classroomSchool();
    const saved = await saveChapters(s.tokens.meena, s.a, s.maths, [
      { name: "Numbers", plannedOn: gone },
      { name: "Fractions", plannedOn: gone, done: true },
      { name: "Shapes", plannedOn: coming },
      { name: "Angles", plannedOn: today },
      { name: "Data" },
    ]);
    expect(saved.status).toBe(200);
    const list = await chaptersOf(s.tokens.meena, s.a, s.maths);
    expect(list.map((c) => [c.name, c.plannedOn, c.late])).toEqual([
      ["Numbers", gone, true],
      ["Fractions", gone, false],
      ["Shapes", coming, false],
      ["Angles", today, false],
      ["Data", null, false],
    ]);
  });

  it("left out, the chapter keeps its day; null takes it away", async () => {
    const s = await classroomSchool();
    await saveChapters(s.tokens.meena, s.a, s.maths, [{ name: "Numbers", plannedOn: gone }]);
    const [numbers] = await chaptersOf(s.tokens.meena, s.a, s.maths);
    await saveChapters(s.tokens.meena, s.a, s.maths, [{ id: numbers.id, name: "Numbers" }]);
    expect((await chaptersOf(s.tokens.meena, s.a, s.maths))[0].plannedOn).toBe(gone);
    await saveChapters(s.tokens.meena, s.a, s.maths, [{ id: numbers.id, name: "Numbers", plannedOn: null }]);
    expect((await chaptersOf(s.tokens.meena, s.a, s.maths))[0]).toMatchObject({ plannedOn: null, late: false });
  });

  it("is a day of the session", async () => {
    const s = await classroomSchool();
    const res = await saveChapters(s.tokens.meena, s.a, s.maths, [{ name: "Numbers" }, { name: "Fractions", plannedOn: "2025-06-01" }]);
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: "chapters.1.plannedOn", message: "Choose a day of the 2026-2027 session" }]);
    expect((await saveChapters(s.tokens.meena, s.a, s.maths, [{ name: "Numbers", plannedOn: "31-01-2027" }])).status).toBe(400);
    expect(await chaptersOf(s.tokens.meena, s.a, s.maths)).toEqual([]);
  });

  it("teaching progress counts the late chapters, and the subjects that are behind", async () => {
    const s = await classroomSchool();
    await saveChapters(s.tokens.meena, s.a, s.maths, [{ name: "Numbers", plannedOn: gone }, { name: "Fractions", plannedOn: gone }, { name: "Shapes", plannedOn: coming }]);
    await saveChapters(s.tokens.dev, s.a, s.english, [{ name: "The Kite", plannedOn: coming }]);
    const data = (await request(app).get(`${API}/progress?from=${shift(today, -7)}&to=${today}`).set(auth(s.token))).body.data;
    expect(data.summary.behind).toBe(1);
    expect(data.rows.map((r: { subjectName: string; late: number }) => [r.subjectName, r.late])).toEqual([
      ["English", 0],
      ["Mathematics", 2],
    ]);
    expect(data.rows[1].chapters[0]).toMatchObject({ plannedOn: gone, late: true });
  });
});

describe("copying chapters", () => {
  /** Class 5 gets a second section, B, which studies Mathematics too; A has two chapters, one planned. */
  async function twoSections() {
    const s = await classroomSchool();
    const made = await request(app).post(`/api/v1/academics/classes/${s.a.classId}/sections`).set(auth(s.token)).send({ name: "B" });
    expect(made.status).toBe(201);
    const b = { classId: s.a.classId, sectionId: made.body.data.id as string };
    expect((await saveAllotments(s.token, b, [{ subjectId: s.maths, periodsPerWeek: 6, teacherId: s.dev }])).status).toBe(200);
    await saveChapters(s.tokens.meena, s.a, s.maths, [{ name: "Numbers", plannedOn: coming, done: true }, { name: "Fractions" }]);
    return { s, b };
  }

  it("lists the same subject's chapters of the class's other sections, with their planned days, never the ones finished", async () => {
    const { s, b } = await twoSections();
    const res = await sources(s.token, b, s.maths);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: expect.any(String),
        label: "Class 5 - A",
        chapters: [
          { name: "Numbers", plannedOn: coming },
          { name: "Fractions", plannedOn: null },
        ],
      },
    ]);
    // The section asked for is not its own source, and a subject with nothing written has none.
    expect((await sources(s.token, s.a, s.maths)).body.data).toEqual([]);
    expect((await sources(s.token, s.a, s.english)).body.data).toEqual([]);
  });

  it("lists an earlier year's chapters too, named with the year and without the old days", async () => {
    const { s, b } = await twoSections();
    const mine = await Syllabus.findOne({ tenantId: s.tenantId, sectionId: s.a.sectionId }).lean();
    const old = await AcademicYear.create({ tenantId: s.tenantId, name: "2025-2026", nameKey: "2025-2026", startDate: new Date("2025-04-01"), endDate: new Date("2026-03-31"), status: "closed", source: "school" });
    await Syllabus.create({ ...mine!, _id: undefined, academicYearId: old._id });
    const found = (await sources(s.token, b, s.maths)).body.data as { label: string; chapters: { name: string; plannedOn: string | null }[] }[];
    expect(found.map((f) => f.label)).toEqual(["Class 5 - A", "Class 5 - A, 2025-2026"]);
    expect(found[1].chapters).toEqual([
      { name: "Numbers", plannedOn: null },
      { name: "Fractions", plannedOn: null },
    ]);
    // For the section it was copied from, last year's list is there to bring back.
    expect(((await sources(s.token, s.a, s.maths)).body.data as { label: string }[]).map((f) => f.label)).toEqual(["Class 5 - A, 2025-2026"]);
  });

  it("only for someone who may write that subject there", async () => {
    const { s, b } = await twoSections();
    expect((await sources(s.tokens.dev, b, s.maths)).status).toBe(200);
    expect((await sources(s.tokens.meena, b, s.maths)).status).toBe(403);
    expect((await sources(s.tokens.dev, s.a, s.maths)).body.code).toBe("NOT_THEIR_SUBJECT");
    expect((await sources(s.tokens.ravi, b, s.maths)).status).toBe(403);
  });
});
