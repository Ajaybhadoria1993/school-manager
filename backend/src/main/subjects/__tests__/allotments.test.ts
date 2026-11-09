import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague } from "../../../test/schools";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { Allotment } from "../models/Allotment";

const api = "/api/v1/subjects/allotments";
const get = (token: string, classId: string, sectionId: string | null = null) =>
  request(app).get(`${api}?classId=${classId}&sectionId=${sectionId ?? "none"}`).set(auth(token));
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const rowsOf = (res: request.Response) => res.body.data.rows as { subjectName: string; periodsPerWeek: number; blockSize: number; teacherName: string | null; group: string | null }[];

/** A school with Class 5 (A and B), Class 1 (no sections), five subjects, a teacher and the usual day Monday to Friday (40 periods a week). */
async function ready() {
  const s = await timetableSchool();
  const class5 = await addClass(s.token, "Class 5", ["A", "B"]);
  const class1 = await addClass(s.token, "Class 1");
  await addTiming(s.token);
  const subjects = {
    maths: await addSubject(s.token, "Mathematics"),
    english: await addSubject(s.token, "English"),
    hindi: await addSubject(s.token, "Hindi"),
    sanskrit: await addSubject(s.token, "Sanskrit"),
    french: await addSubject(s.token, "French"),
  };
  const meena = await addTeacher(s.token, "Meena Singh");
  const dev = await addTeacher(s.token, "Dev Patel");
  return { ...s, class5, class1, a: { classId: class5.id, sectionId: class5.sections[0].id }, b: { classId: class5.id, sectionId: class5.sections[1].id }, one: { classId: class1.id, sectionId: null }, subjects, meena, dev };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("what a class studies: who may use it", () => {
  it("needs a signed-in user; a teacher may look but not change", async () => {
    const r = await ready();
    expect((await request(app).get(`${api}?classId=${r.class5.id}&sectionId=${r.a.sectionId}`)).status).toBe(401);
    const teacher = await addColleague(r.tenantId, "teacher");
    expect((await get(teacher, r.class5.id, r.a.sectionId)).status).toBe(200);
    expect((await saveAllotments(teacher, r.a, [])).status).toBe(403);
    const accountant = await addColleague(r.tenantId, "accountant");
    expect((await get(accountant, r.class5.id, r.a.sectionId)).status).toBe(403);
  });
});

describe("saving what a section studies", () => {
  it("keeps the subjects in the order given, with their periods, blocks, teachers and choices, and reads them back", async () => {
    const r = await ready();
    const res = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.maths, periodsPerWeek: 6, teacherId: r.meena },
      { subjectId: r.subjects.english, periodsPerWeek: 5 },
      { subjectId: r.subjects.sanskrit, periodsPerWeek: 4, blockSize: 2, group: "Third language", teacherId: r.dev },
      { subjectId: r.subjects.french, periodsPerWeek: 4, blockSize: 2, group: "third  language" },
    ]);
    expect(res.status).toBe(200);
    expect(rowsOf(res).map((x) => `${x.subjectName} ${x.periodsPerWeek} ${x.blockSize} ${x.teacherName ?? "-"} ${x.group ?? "-"}`)).toEqual([
      "Mathematics 6 1 Meena Singh -",
      "English 5 1 - -",
      "Sanskrit 4 2 Dev Patel Third language",
      "French 4 2 - third language",
    ]);
    // Maths 6 + English 5 + the choice once (4) = 15 periods of the 40 the week has.
    expect(res.body.data.totals).toEqual({ periods: 15, available: 40 });
    expect(res.body.data.unit).toMatchObject({ label: "Class 5 - A", className: "Class 5", sectionName: "A" });
    expect(res.body.data.siblings).toEqual([{ id: r.class5.sections[1].id, name: "B" }]);
    expect(rowsOf(await get(r.token, r.class5.id, r.a.sectionId))).toHaveLength(4);
  });

  it("replaces the list: a subject left out is taken off, and another section's list is not touched", async () => {
    const r = await ready();
    await saveAllotments(r.token, r.a, [{ subjectId: r.subjects.maths, periodsPerWeek: 6 }, { subjectId: r.subjects.hindi, periodsPerWeek: 5 }]);
    await saveAllotments(r.token, r.b, [{ subjectId: r.subjects.maths, periodsPerWeek: 4 }]);
    const again = await saveAllotments(r.token, r.a, [{ subjectId: r.subjects.maths, periodsPerWeek: 7 }]);
    expect(rowsOf(again).map((x) => `${x.subjectName} ${x.periodsPerWeek}`)).toEqual(["Mathematics 7"]);
    expect(rowsOf(await get(r.token, r.class5.id, r.b.sectionId)).map((x) => `${x.subjectName} ${x.periodsPerWeek}`)).toEqual(["Mathematics 4"]);
    expect(await Allotment.countDocuments({ tenantId: r.tenantId })).toBe(2);
  });

  it("is the same for a class that has no sections, kept for the class itself", async () => {
    const r = await ready();
    const res = await saveAllotments(r.token, r.one, [{ subjectId: r.subjects.maths, periodsPerWeek: 6 }]);
    expect(res.status).toBe(200);
    expect(res.body.data.unit).toMatchObject({ label: "Class 1", sectionId: null });
    expect(res.body.data.siblings).toEqual([]);
    expect(rowsOf(await get(r.token, r.class1.id, null))).toHaveLength(1);
  });

  it("can be emptied", async () => {
    const r = await ready();
    await saveAllotments(r.token, r.a, [{ subjectId: r.subjects.maths, periodsPerWeek: 6 }]);
    const res = await saveAllotments(r.token, r.a, []);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.totals.periods).toBe(0);
  });

  it("says nothing about the week's periods before the school has set its timing", async () => {
    const s = await timetableSchool();
    const klass = await addClass(s.token, "Class 5", ["A"]);
    const maths = await addSubject(s.token, "Mathematics");
    const res = await saveAllotments(s.token, { classId: klass.id, sectionId: klass.sections[0].id }, [{ subjectId: maths, periodsPerWeek: 20 }]);
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ periods: 20, available: null });
  });
});

describe("giving the same list to the other sections", () => {
  it("copies the subjects, the periods and the choices, but not the teachers unless asked", async () => {
    const r = await ready();
    // Section B already has Maths with Dev; Hindi is new there.
    await saveAllotments(r.token, r.b, [{ subjectId: r.subjects.maths, periodsPerWeek: 3, teacherId: r.dev }]);
    await saveAllotments(
      r.token,
      r.a,
      [
        { subjectId: r.subjects.maths, periodsPerWeek: 6, teacherId: r.meena },
        { subjectId: r.subjects.hindi, periodsPerWeek: 5, teacherId: r.meena },
      ],
      { alsoSections: [r.b.sectionId] }
    );
    const b = rowsOf(await get(r.token, r.class5.id, r.b.sectionId));
    expect(b.map((x) => `${x.subjectName} ${x.periodsPerWeek} ${x.teacherName ?? "-"}`)).toEqual(["Mathematics 6 Dev Patel", "Hindi 5 -"]);

    await saveAllotments(r.token, r.a, [{ subjectId: r.subjects.maths, periodsPerWeek: 6, teacherId: r.meena }], { alsoSections: [r.b.sectionId], withTeachers: true });
    expect(rowsOf(await get(r.token, r.class5.id, r.b.sectionId)).map((x) => `${x.subjectName} ${x.teacherName ?? "-"}`)).toEqual(["Mathematics Meena Singh"]);
  });

  it("refuses a section of another class, and a class without sections is given no other", async () => {
    const r = await ready();
    const other = await addClass(r.token, "Class 6", ["A"]);
    const foreign = await saveAllotments(r.token, r.a, [], { alsoSections: [other.sections[0].id] });
    expect(foreign.status).toBe(404);
    const none = await saveAllotments(r.token, r.one, [], { alsoSections: [r.a.sectionId] });
    expect(none.status).toBe(404);
  });
});

describe("what the rows must be", () => {
  it("each subject once, a subject of the school and not archived", async () => {
    const r = await ready();
    await request(app).patch(`/api/v1/subjects/${r.subjects.french}`).set(auth(r.token)).send({ isActive: false });
    const res = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.maths, periodsPerWeek: 6 },
      { subjectId: r.subjects.maths, periodsPerWeek: 2 },
      { subjectId: r.subjects.french, periodsPerWeek: 2 },
      { subjectId: new Types.ObjectId().toString(), periodsPerWeek: 2 },
    ]);
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([
      { path: "rows.1.subjectId", message: "Mathematics is in the list twice" },
      { path: "rows.2.subjectId", message: "French is archived. Bring it back first" },
      { path: "rows.3.subjectId", message: "Choose a subject from your school's list" },
    ]);
    expect(await Allotment.countDocuments({ tenantId: r.tenantId })).toBe(0);
  });

  it("a teacher of the school who is still teaching", async () => {
    const r = await ready();
    const other = await timetableSchool("Moonrise Public School");
    const foreign = await addTeacher(other.token, "Someone Else");
    const left = await addTeacher(r.token, "Anil Rao");
    await request(app).patch(`/api/v1/staff/teachers/${left}`).set(auth(r.token)).send({ isActive: false });
    const res = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.maths, periodsPerWeek: 6, teacherId: foreign },
      { subjectId: r.subjects.hindi, periodsPerWeek: 5, teacherId: left },
    ]);
    expect(details(res)).toEqual([
      { path: "rows.0.teacherId", message: "Choose a teacher from your school's list" },
      { path: "rows.1.teacherId", message: "Anil Rao is no longer teaching here" },
    ]);
  });

  it("periods a week from 1 to 20 and a block of 1 to 3", async () => {
    const r = await ready();
    const res = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.maths, periodsPerWeek: 0 },
      { subjectId: r.subjects.hindi, periodsPerWeek: 21 },
      { subjectId: r.subjects.english, periodsPerWeek: 4, blockSize: 4 },
    ]);
    expect(res.status).toBe(400);
    const by = Object.fromEntries(details(res).map((d) => [d.path, d.message]));
    expect(by["rows.0.periodsPerWeek"]).toBe("At least 1 period a week");
    expect(by["rows.1.periodsPerWeek"]).toBe("Up to 20 periods a week");
    expect(by["rows.2.blockSize"]).toBe("A block is 1 to 3 periods");
  });

  it("periods in whole blocks: 5 periods cannot be double periods", async () => {
    const r = await ready();
    const res = await saveAllotments(r.token, r.a, [{ subjectId: r.subjects.maths, periodsPerWeek: 5, blockSize: 2 }]);
    expect(details(res)).toEqual([{ path: "rows.0.periodsPerWeek", message: "5 periods cannot be given in blocks of 2: use a multiple of 2" }]);
    expect((await saveAllotments(r.token, r.a, [{ subjectId: r.subjects.maths, periodsPerWeek: 6, blockSize: 3 }])).status).toBe(200);
  });

  it("a choice has two or more subjects with the same periods and block, and no teacher twice", async () => {
    const r = await ready();
    const alone = await saveAllotments(r.token, r.a, [{ subjectId: r.subjects.sanskrit, periodsPerWeek: 4, group: "Third language" }]);
    expect(details(alone)).toEqual([{ path: "rows.0.group", message: "A choice needs at least two subjects" }]);

    const unequal = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.sanskrit, periodsPerWeek: 4, group: "Third language" },
      { subjectId: r.subjects.french, periodsPerWeek: 3, blockSize: 1, group: "Third language" },
    ]);
    expect(details(unequal)).toEqual([{ path: "rows.1.periodsPerWeek", message: "The subjects of one choice need the same periods a week" }]);

    const block = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.sanskrit, periodsPerWeek: 4, blockSize: 2, group: "Third language" },
      { subjectId: r.subjects.french, periodsPerWeek: 4, group: "Third language" },
    ]);
    expect(details(block)).toEqual([{ path: "rows.1.blockSize", message: "The subjects of one choice need the same block" }]);

    const same = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.sanskrit, periodsPerWeek: 4, group: "Third language", teacherId: r.meena },
      { subjectId: r.subjects.french, periodsPerWeek: 4, group: "Third language", teacherId: r.meena },
    ]);
    expect(details(same)).toEqual([{ path: "rows.1.teacherId", message: "Meena Singh cannot teach two subjects of one choice at the same time" }]);
  });

  it("no more periods than the class's timing has in a week, counting a choice once", async () => {
    const r = await ready();
    // 40 periods a week: Maths 20 + Hindi 20 fits, one more period does not.
    expect((await saveAllotments(r.token, r.a, [{ subjectId: r.subjects.maths, periodsPerWeek: 20 }, { subjectId: r.subjects.hindi, periodsPerWeek: 20 }])).status).toBe(200);
    const over = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.maths, periodsPerWeek: 20 },
      { subjectId: r.subjects.hindi, periodsPerWeek: 20 },
      { subjectId: r.subjects.english, periodsPerWeek: 1 },
    ]);
    expect(over.status).toBe(400);
    expect(over.body.code).toBe("PERIODS_DO_NOT_FIT");
    expect(over.body.message).toBe("Class 5 - A has 41 periods a week to place but its timing has only 40.");
    // The list that was there before is kept.
    expect(rowsOf(await get(r.token, r.class5.id, r.a.sectionId))).toHaveLength(2);
    // A choice shares its periods: three subjects of 10 are 10 periods, not 30.
    const choice = await saveAllotments(r.token, r.a, [
      { subjectId: r.subjects.maths, periodsPerWeek: 20 },
      { subjectId: r.subjects.hindi, periodsPerWeek: 10, group: "Choice" },
      { subjectId: r.subjects.sanskrit, periodsPerWeek: 10, group: "Choice" },
      { subjectId: r.subjects.french, periodsPerWeek: 10, group: "Choice" },
    ]);
    expect(choice.status).toBe(200);
    expect(choice.body.data.totals.periods).toBe(30);
  });
});

describe("which unit it is about", () => {
  it("is a 404 for a class or section that is not the school's, and a 409 for the wrong kind of unit", async () => {
    const r = await ready();
    const other = await timetableSchool("Moonrise Public School");
    const foreign = await addClass(other.token, "Class 5", ["A"]);
    expect((await get(r.token, foreign.id, null)).status).toBe(404);
    expect((await get(r.token, r.class5.id, foreign.sections[0].id)).status).toBe(404);
    // Class 5 has sections: its own list is per section.
    const needs = await get(r.token, r.class5.id, null);
    expect(needs.status).toBe(409);
    expect(needs.body.code).toBe("UNIT_NEEDS_SECTION");
    // A section of another class is not this class's.
    const six = await addClass(r.token, "Class 6", ["A"]);
    expect((await get(r.token, r.class5.id, six.sections[0].id)).status).toBe(404);
  });

  it("needs a class id", async () => {
    const r = await ready();
    expect((await request(app).get(api).set(auth(r.token))).status).toBe(400);
    expect((await request(app).get(`${api}?classId=nope`).set(auth(r.token))).status).toBe(400);
  });
});
