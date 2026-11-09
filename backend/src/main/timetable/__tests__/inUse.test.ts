import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { Allotment } from "../../subjects/models/Allotment";
import { addClass, addSubject, addTeacher, addTiming, auth, REGULAR_DAY, saveAllotments, timetableSchool } from "../../../test/timetable";
import { BellSchedule } from "../models/BellSchedule";
import { Timetable } from "../models/Timetable";

const grid = "/api/v1/timetable/grid";
const put = (token: string, unit: { classId: string; sectionId: string | null }, cells: object[]) => request(app).put(grid).set(auth(token)).send({ ...unit, cells });
const lesson = (subjectId: string, over: object = {}) => ({ subjectId, ...over });
const cell = (day: number, period: number, ...lessons: object[]) => ({ day, period, lessons });
const details = (res: request.Response) => res.body.details as { path: string; message: string; code?: string }[];

async function ready() {
  const s = await timetableSchool();
  const class5 = await addClass(s.token, "Class 5", ["A", "B"]);
  const timing = await addTiming(s.token);
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const meena = await addTeacher(s.token, "Meena Singh");
  const dev = await addTeacher(s.token, "Dev Patel");
  const a = { classId: class5.id, sectionId: class5.sections[0].id };
  const b = { classId: class5.id, sectionId: class5.sections[1].id };
  await saveAllotments(s.token, a, [{ subjectId: maths, periodsPerWeek: 6, teacherId: meena }, { subjectId: english, periodsPerWeek: 5, teacherId: dev }]);
  await saveAllotments(s.token, b, [{ subjectId: maths, periodsPerWeek: 6, teacherId: dev }, { subjectId: english, periodsPerWeek: 5, teacherId: meena }]);
  return { ...s, class5, timing, a, b, maths, english, meena, dev };
}

const patchTiming = (token: string, id: string, body: object) => request(app).patch(`/api/v1/timetable/schedules/${id}`).set(auth(token)).send(body);

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a timing that a timetable uses", () => {
  it("can change its times freely (the periods are the same)", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 8, lesson(r.maths))]);
    const later = REGULAR_DAY.map((s) => ({ ...s }));
    later[0] = { kind: "period", start: "08:45", end: "09:10" };
    expect((await patchTiming(r.token, r.timing, { slots: later })).status).toBe(200);
  });

  it("cannot lose a period that has lessons, and says where", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 8, lesson(r.maths)), cell(2, 8, lesson(r.maths))]);
    const res = await patchTiming(r.token, r.timing, { slots: REGULAR_DAY.slice(0, 8) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHEDULE_IN_USE");
    expect(res.body.message).toBe("This change would leave 2 periods with lessons in 1 class without a place in the day (for example Class 5 - A, Monday period 8). Take those lessons out of the timetable first.");
    // Taking out the unused periods is fine.
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    expect((await patchTiming(r.token, r.timing, { slots: REGULAR_DAY.slice(0, 8) })).status).toBe(200);
  });

  it("cannot lose a day that has lessons, or be deleted", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(5, 1, lesson(r.maths))]);
    expect((await patchTiming(r.token, r.timing, { days: [1, 2, 3, 4] })).status).toBe(409);
    const del = await request(app).delete(`/api/v1/timetable/schedules/${r.timing}`).set(auth(r.token));
    expect(del.status).toBe(409);
    expect(del.body.code).toBe("SCHEDULE_IN_USE");
    await put(r.token, r.a, []);
    expect((await request(app).delete(`/api/v1/timetable/schedules/${r.timing}`).set(auth(r.token))).status).toBe(200);
  });

  it("cannot be given to a class whose own timing has fewer periods than the class's lessons use", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 8, lesson(r.maths))]);
    const short = [{ kind: "period", start: "08:30", end: "09:10" }, { kind: "period", start: "09:10", end: "09:50" }];
    const res = await request(app)
      .post("/api/v1/timetable/schedules")
      .set(auth(r.token))
      .send({ name: "Class 5 short", scope: "only", classIds: [r.a.classId], days: [1, 2, 3, 4, 5], slots: short });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCHEDULE_IN_USE");
  });
});

describe("what a class studies, once its timetable is made", () => {
  it("a subject with lessons cannot be taken off; with none it can", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths)), cell(2, 1, lesson(r.maths)), cell(3, 1, lesson(r.english))]);
    const res = await saveAllotments(r.token, r.a, [{ subjectId: r.english, periodsPerWeek: 5, teacherId: r.dev }]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SUBJECT_IN_TIMETABLE");
    expect(res.body.message).toBe("Mathematics is in the timetable of Class 5 - A (2 periods). Take it out of the timetable first.");
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, sectionId: r.a.sectionId })).toBe(2);
    await put(r.token, r.a, [cell(3, 1, lesson(r.english))]);
    expect((await saveAllotments(r.token, r.a, [{ subjectId: r.english, periodsPerWeek: 5, teacherId: r.dev }])).status).toBe(200);
  });

  it("a new teacher for a subject takes its lessons with them, if they are free at those periods", async () => {
    const r = await ready();
    // Maths of 5-A is Meena's, on Monday period 1. Dev teaches Maths of 5-B on Monday period 1: he cannot take 5-A's Maths too.
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    await put(r.token, r.b, [cell(1, 1, lesson(r.maths))]);
    const clash = await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.dev }, { subjectId: r.english, periodsPerWeek: 5, teacherId: r.dev }]);
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("TIMETABLE_CLASHES");
    expect(clash.body.message).toBe("Dev Patel is teaching Class 5 - B (Mathematics) at the same time");
    // The list is as it was.
    const kept = await request(app).get(`/api/v1/subjects/allotments?classId=${r.a.classId}&sectionId=${r.a.sectionId}`).set(auth(r.token));
    expect(kept.body.data.rows[0].teacherName).toBe("Meena Singh");

    // Move 5-B's lesson away and the change goes through, and the lesson follows the new teacher.
    await put(r.token, r.b, [cell(1, 2, lesson(r.maths))]);
    expect((await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.dev }, { subjectId: r.english, periodsPerWeek: 5, teacherId: r.dev }])).status).toBe(200);
    const view = await request(app).get(`${grid}?classId=${r.b.classId}&sectionId=${r.b.sectionId}`).set(auth(r.token));
    expect(view.body.data.busy).toContainEqual({ day: 1, period: 1, teacherId: r.dev, room: null, where: "Class 5 - A", subjectName: "Mathematics" });
  });

  it("a teacher who does not come on a day cannot be given a subject that has a lesson that day", async () => {
    const r = await ready();
    await request(app).patch(`/api/v1/staff/teachers/${r.dev}`).set(auth(r.token)).send({ offDays: [3] });
    await put(r.token, r.a, [cell(3, 1, lesson(r.maths))]);
    const res = await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.dev }, { subjectId: r.english, periodsPerWeek: 5, teacherId: r.dev }]);
    expect(res.status).toBe(409);
    expect(details(res)[0]).toMatchObject({ path: "d3p1", code: "TEACHER_OFF" });
  });
});

describe("teachers named on lessons", () => {
  it("cannot be made inactive while a lesson names them", async () => {
    const r = await ready();
    const anil = await addTeacher(r.token, "Anil Rao");
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths, { teacherId: anil }))]);
    const res = await request(app).patch(`/api/v1/staff/teachers/${anil}`).set(auth(r.token)).send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEACHER_HAS_LESSONS");
    await put(r.token, r.a, []);
    expect((await request(app).patch(`/api/v1/staff/teachers/${anil}`).set(auth(r.token)).send({ isActive: false })).status).toBe(200);
  });
});

describe("when a section or a class is deleted", () => {
  it("its subject list and timetable go with the section, and no other section's", async () => {
    const r = await ready();
    await put(r.token, r.a, [cell(1, 1, lesson(r.maths))]);
    await put(r.token, r.b, [cell(1, 2, lesson(r.maths))]);
    const res = await request(app).delete(`/api/v1/academics/sections/${r.a.sectionId}`).set(auth(r.token));
    expect(res.status).toBe(200);
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, sectionId: r.a.sectionId })).toBe(0);
    expect(await Timetable.countDocuments({ tenantId: r.tenantId, sectionId: r.a.sectionId })).toBe(0);
    expect(await Timetable.countDocuments({ tenantId: r.tenantId, sectionId: r.b.sectionId })).toBe(1);
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, sectionId: r.b.sectionId })).toBe(2);
  });

  it("its lists, timetables and place in the timings go with the class: a timing made only for it goes, others just lose it", async () => {
    const r = await ready();
    const nursery = await addClass(r.token, "Nursery");
    const six = await addClass(r.token, "Class 6");
    await addTiming(r.token, { name: "Little ones", scope: "only", classIds: [nursery.id], days: [1] });
    await addTiming(r.token, { name: "Saturday", scope: "except", classIds: [nursery.id, six.id], days: [6] });
    await addTiming(r.token, { name: "Sunday", scope: "only", classIds: [nursery.id, six.id], days: [7] });
    await saveAllotments(r.token, { classId: nursery.id, sectionId: null }, [{ subjectId: r.maths, periodsPerWeek: 3 }]);
    expect((await request(app).delete(`/api/v1/academics/classes/${nursery.id}`).set(auth(r.token))).status).toBe(200);
    expect(await Allotment.countDocuments({ tenantId: r.tenantId, classId: nursery.id })).toBe(0);
    const names = (await BellSchedule.find({ tenantId: r.tenantId }).sort({ _id: 1 })).map((s) => `${s.name}:${s.scope}:${s.classIds.length}`);
    expect(names).toEqual(["Regular:all:0", "Saturday:except:1", "Sunday:only:1"]);

    // The last class of an "all but" timing: it becomes an "all" timing.
    expect((await request(app).delete(`/api/v1/academics/classes/${six.id}`).set(auth(r.token))).status).toBe(200);
    const after = (await BellSchedule.find({ tenantId: r.tenantId }).sort({ _id: 1 })).map((s) => `${s.name}:${s.scope}:${s.classIds.length}`);
    expect(after).toEqual(["Regular:all:0", "Saturday:all:0"]);
  });
});
