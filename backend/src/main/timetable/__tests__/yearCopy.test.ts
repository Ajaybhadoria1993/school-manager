import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { Allotment } from "../../subjects/models/Allotment";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { Timetable } from "../models/Timetable";

const academics = "/api/v1/academics";
const grid = "/api/v1/timetable/grid";
const NEXT = { name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" };

async function ready() {
  const s = await timetableSchool();
  const class5 = await addClass(s.token, "Class 5", ["A", "B"]);
  const class1 = await addClass(s.token, "Class 1");
  await addTiming(s.token);
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const meena = await addTeacher(s.token, "Meena Singh");
  const a = { classId: class5.id, sectionId: class5.sections[0].id };
  const one = { classId: class1.id, sectionId: null };
  await saveAllotments(s.token, a, [{ subjectId: maths, periodsPerWeek: 6, teacherId: meena }, { subjectId: english, periodsPerWeek: 5, group: null }]);
  await saveAllotments(s.token, one, [{ subjectId: maths, periodsPerWeek: 4 }]);
  await request(app).put(grid).set(auth(s.token)).send({ ...a, cells: [{ day: 1, period: 1, lessons: [{ subjectId: maths }] }] });
  await request(app).post(`${grid}/publish`).set(auth(s.token)).send(a);
  await request(app).put(grid).set(auth(s.token)).send({ ...one, cells: [{ day: 2, period: 1, lessons: [{ subjectId: maths }] }] });
  return { ...s, class5, class1, a, one, maths, english, meena };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the next year starts from this year's subjects and timetables, when asked", () => {
  it("copies what each section studies and its timetable into the next year's sections, as drafts, and leaves this year as it was", async () => {
    const r = await ready();
    const res = await request(app).post(`${academics}/academic-years`).set(auth(r.token)).send({ ...NEXT, copySections: true, copyTimetable: true });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ sectionsCopied: 2, allotmentsCopied: 3, timetablesCopied: 2 });

    // This year: untouched.
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, academicYearId: r.yearId })).toBe(3);
    expect(await Timetable.countDocuments({ tenantId: r.tenantId, academicYearId: r.yearId })).toBe(2);
    expect((await Timetable.findOne({ tenantId: r.tenantId, academicYearId: r.yearId, sectionId: r.a.sectionId }))!.status).toBe("published");

    // Next year: copies on the copied sections, drafts.
    const next = await Timetable.find({ tenantId: r.tenantId, academicYearId: { $ne: r.yearId } }).lean();
    expect(next).toHaveLength(2);
    expect(next.every((t) => t.status === "draft" && t.publishedAt === null)).toBe(true);
    expect(next.map((t) => t.cells.length)).toEqual([1, 1]);
    const copiedSection = next.find((t) => t.sectionId)!;
    expect(copiedSection.sectionId!.toString()).not.toBe(r.a.sectionId);
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, academicYearId: { $ne: r.yearId }, teacherId: r.meena })).toBe(1);
  });

  it("is not copied unless asked (the sections alone are what a promotion needs)", async () => {
    const r = await ready();
    const res = await request(app).post(`${academics}/academic-years`).set(auth(r.token)).send({ ...NEXT, copySections: true });
    expect(res.body.data).toMatchObject({ sectionsCopied: 2, allotmentsCopied: 0, timetablesCopied: 0 });
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, academicYearId: { $ne: r.yearId } })).toBe(0);
  });

  it("without the sections, only a class that has none carries its subjects and timetable over", async () => {
    const r = await ready();
    const res = await request(app).post(`${academics}/academic-years`).set(auth(r.token)).send({ ...NEXT, copySections: false, copyTimetable: true });
    expect(res.body.data).toMatchObject({ sectionsCopied: 0, allotmentsCopied: 1, timetablesCopied: 1 });
  });

  it("is what the school sees once the next year is switched on", async () => {
    const r = await ready();
    const next = (await request(app).post(`${academics}/academic-years`).set(auth(r.token)).send({ ...NEXT, copySections: true, copyTimetable: true })).body.data;
    expect((await request(app).post(`${academics}/academic-years/${next.id}/activate`).set(auth(r.token)).send({})).status).toBe(200);
    const structure = (await request(app).get(`${academics}/structure`).set(auth(r.token))).body.data;
    const section = structure.classes.find((c: { name: string }) => c.name === "Class 5").sections[0];
    const view = await request(app).get(`${grid}?classId=${section.classId}&sectionId=${section.id}`).set(auth(r.token));
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ status: "draft", unit: { academicYear: { name: "2027-2028" } } });
    expect(view.body.data.cells).toHaveLength(1);
    expect(view.body.data.allotments.map((x: { subjectName: string }) => x.subjectName)).toEqual(["Mathematics", "English"]);
    // The class that has no sections too.
    const one = await request(app).get(`${grid}?classId=${r.class1.id}&sectionId=none`).set(auth(r.token));
    expect(one.body.data.cells).toHaveLength(1);
  });
});
