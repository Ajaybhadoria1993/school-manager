import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { Allotment } from "../../subjects/models/Allotment";
import { Timetable } from "../models/Timetable";

const grid = "/api/v1/timetable/grid";
const put = (token: string, unit: { classId: string; sectionId: string | null }, cells: object[]) => request(app).put(grid).set(auth(token)).send({ ...unit, cells });
const cell = (day: number, period: number, subjectId: string) => ({ day, period, lessons: [{ subjectId }] });
const allotments = (token: string, unit: { classId: string; sectionId: string | null }) =>
  request(app).get(`/api/v1/subjects/allotments?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}`).set(auth(token));

async function ready() {
  const s = await timetableSchool();
  const klass = await addClass(s.token, "Class 5", ["A"]);
  await addTiming(s.token);
  const maths = await addSubject(s.token, "Mathematics");
  const art = await addSubject(s.token, "Art & Craft");
  const meena = await addTeacher(s.token, "Meena Singh");
  const unit = { classId: klass.id, sectionId: klass.sections[0].id };
  await saveAllotments(s.token, unit, [{ subjectId: maths, periodsPerWeek: 6, teacherId: meena }]);
  return { ...s, unit, maths, art, meena };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a class's timetable: any subject of the school can be put in it", () => {
  it("adds a subject the class did not study to its list, with the periods it was given and no teacher, and keeps the lessons", async () => {
    const r = await ready();
    const res = await put(r.token, r.unit, [cell(1, 1, r.maths), cell(1, 2, r.art), cell(2, 2, r.art)]);
    expect(res.status).toBe(200);
    expect(res.body.data.cells).toHaveLength(3);
    expect(res.body.data.allotments.map((a: { subjectName: string; periodsPerWeek: number; teacherId: string | null }) => `${a.subjectName} ${a.periodsPerWeek} ${a.teacherId ?? "-"}`)).toEqual([
      `Mathematics 6 ${r.meena}`,
      "Art & Craft 2 -",
    ]);
    const list = (await allotments(r.token, r.unit)).body.data.rows as { subjectName: string; periodsPerWeek: number }[];
    expect(list.map((a) => `${a.subjectName} ${a.periodsPerWeek}`)).toEqual(["Mathematics 6", "Art & Craft 2"]);
  });

  it("does not change what the class already had for a subject", async () => {
    const r = await ready();
    await put(r.token, r.unit, [cell(1, 1, r.maths), cell(1, 2, r.maths)]);
    const row = await Allotment.findOne({ tenantId: r.tenantId, subjectId: r.maths }).lean();
    expect(row).toMatchObject({ periodsPerWeek: 6 });
  });

  it("refuses an archived subject, says which, and keeps nothing", async () => {
    const r = await ready();
    await request(app).patch(`/api/v1/subjects/${r.art}`).set(auth(r.token)).send({ isActive: false });
    const res = await put(r.token, r.unit, [cell(1, 1, r.maths), cell(1, 2, r.art)]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SUBJECT_NOT_AVAILABLE");
    expect(res.body.message).toBe("Art & Craft is archived. Bring it back on the Subjects page first.");
    expect(await Timetable.countDocuments({ tenantId: r.tenantId })).toBe(0);
    expect(await Allotment.countDocuments({ tenantId: r.tenantId })).toBe(1);
  });

  it("refuses a subject that is not the school's", async () => {
    const r = await ready();
    const other = await timetableSchool("Moonlight Academy");
    const theirs = await addSubject(other.token, "Robotics");
    const res = await put(r.token, r.unit, [cell(1, 1, theirs)]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SUBJECT_NOT_AVAILABLE");
    expect(await Allotment.countDocuments({ tenantId: r.tenantId })).toBe(1);
  });

  it("adds nothing when the timetable is refused for a clash", async () => {
    const r = await ready();
    const res = await put(r.token, r.unit, [cell(1, 9, r.art)]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TIMETABLE_CLASHES");
    expect(await Allotment.countDocuments({ tenantId: r.tenantId })).toBe(1);
  });
});
