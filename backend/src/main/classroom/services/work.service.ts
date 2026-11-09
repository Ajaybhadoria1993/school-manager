import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { ParentService } from "../../parents/services/parent.service";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { placesOf } from "../../students/services/shared";
import { Subject } from "../../subjects/models/Subject";
import { resolveUnit } from "../../timetable/services/unit";
import { Notify } from "../../notifications/services/events";
import { User } from "../../users/models/User";
import { ClassTest, DiaryEntry, type IClassTest } from "../models/ClassWork";
import type { AddTestInput, SaveDiaryInput, SaveMarksInput, UnitDayQuery, UnitQuery } from "../schemas/classroom.schemas";
import { accessTo, unitFilter } from "./access";
import { childrenOf } from "./children";
import { fromDay, toDay } from "./calendar.service";
import type { Caller } from "./leave.service";

const NOT_THEIRS = () => ApiError.forbidden("Only this subject's teacher, the class teacher or the school writes it.", "NOT_THEIR_SUBJECT");
const TEST_NOT_FOUND = () => ApiError.notFound("Test not found", "TEST_NOT_FOUND");

async function subjectNames(tenantId: string, ids: (Types.ObjectId | string)[]) {
  const subjects = await Subject.find({ tenantId: new Types.ObjectId(tenantId), _id: { $in: ids.map((id) => new Types.ObjectId(String(id))) } }).select("name").lean();
  return new Map(subjects.map((s) => [s._id.toString(), s.name]));
}

const percentOf = (marks: number | null, max: number) => (marks === null ? null : Math.round((marks / max) * 100));
const averageOf = (values: (number | null)[]) => {
  const real = values.filter((v): v is number => v !== null);
  return real.length === 0 ? null : Math.round(real.reduce((a, b) => a + b, 0) / real.length);
};
const isEntered = (m: { marks: number | null; absent: boolean }) => m.absent || m.marks !== null;

function testDto(t: IClassTest, names: Map<string, string>, canWrite: boolean) {
  const entered = t.marks.filter(isEntered);
  return {
    id: t._id.toString(),
    subjectId: t.subjectId.toString(),
    subjectName: names.get(t.subjectId.toString()) ?? "A subject",
    date: toDay(t.date),
    topic: t.topic,
    maxMarks: t.maxMarks,
    marked: entered.length,
    average: averageOf(entered.filter((m) => !m.absent).map((m) => percentOf(m.marks, t.maxMarks))),
    canWrite,
  };
}

/** The diary and the tests of a class (docs/parent-teacher-flow.md, phases 4 and 5). */
export class WorkService {
  // ---- Diary -------------------------------------------------------------------------------------------------------------------------
  static async diaryDay(tenantId: string, caller: Caller, query: UnitDayQuery) {
    const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
    const access = await accessTo(tenantId, caller, unit);
    const [entries, names] = await Promise.all([
      DiaryEntry.find({ ...unitFilter(tenantId, unit), date: fromDay(query.date) }).lean(),
      subjectNames(tenantId, access.allotments.map((a) => a.subjectId)),
    ]);
    const bySubject = new Map(entries.map((e) => [e.subjectId.toString(), e]));
    const subjects = access.allotments
      .map((a) => {
        const e = bySubject.get(a.subjectId.toString());
        return {
          subjectId: a.subjectId.toString(),
          subjectName: names.get(a.subjectId.toString()) ?? "A subject",
          canWrite: access.subjects.has(a.subjectId.toString()),
          entry: e ? { taught: e.taught, homework: e.homework, writtenBy: { name: e.writtenBy.name, role: e.writtenBy.role } } : null,
        };
      })
      .sort((x, y) => x.subjectName.localeCompare(y.subjectName));
    return { classId: unit.classId, sectionId: unit.sectionId, label: unit.label, date: query.date, subjects };
  }

  static async saveDiary(tenantId: string, caller: Caller, input: SaveDiaryInput) {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId ?? null);
    const access = await accessTo(tenantId, caller, unit);
    if (!access.subjects.has(input.subjectId)) throw NOT_THEIRS();
    if (input.date > todayInIndia()) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "The diary is written on the day or after it" }]);
    const user = await User.findById(caller.userId).select("name").lean();
    const before = await DiaryEntry.findOneAndUpdate(
      { ...unitFilter(tenantId, unit), date: fromDay(input.date), subjectId: new Types.ObjectId(input.subjectId) },
      { $set: { academicYearId: unit.yearId, taught: input.taught, homework: input.homework, writtenBy: { name: user?.name ?? "The school", role: caller.role } } },
      { upsert: true, new: false }
    ).lean();
    // Saved again with the same words: the parents are not told twice.
    if (!before || before.taught !== input.taught || before.homework !== input.homework) {
      const subjectName = (await subjectNames(tenantId, [input.subjectId])).get(input.subjectId) ?? "A subject";
      Notify.diarySaved(tenantId, caller.userId, { unit, date: input.date, subjectName, taught: input.taught, homework: input.homework, by: user?.name ?? "The school" });
    }
    return WorkService.diaryDay(tenantId, caller, { classId: unit.classId, sectionId: unit.sectionId ?? "none", date: input.date });
  }

  // ---- Tests -------------------------------------------------------------------------------------------------------------------------
  /** The class's tests: the coming ones first (soonest first), then the ones held (latest first). */
  static async tests(tenantId: string, caller: Caller, query: UnitQuery) {
    const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
    const access = await accessTo(tenantId, caller, unit);
    const tests = await ClassTest.find({ ...unitFilter(tenantId, unit), academicYearId: unit.yearId }).lean();
    const names = await subjectNames(tenantId, tests.map((t) => t.subjectId));
    const today = todayInIndia();
    const items = tests.map((t) => testDto(t, names, access.subjects.has(t.subjectId.toString())));
    const coming = items.filter((t) => t.date >= today && t.marked === 0).sort((a, b) => a.date.localeCompare(b.date));
    const held = items.filter((t) => !coming.includes(t)).sort((a, b) => b.date.localeCompare(a.date));
    return { label: unit.label, items: [...coming, ...held] };
  }

  static async addTest(tenantId: string, caller: Caller, input: AddTestInput) {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId ?? null);
    const access = await accessTo(tenantId, caller, unit);
    if (!access.subjects.has(input.subjectId)) throw NOT_THEIRS();
    const user = await User.findById(caller.userId).select("name").lean();
    const made = await ClassTest.create({
      ...unitFilter(tenantId, unit),
      academicYearId: unit.yearId,
      subjectId: new Types.ObjectId(input.subjectId),
      date: fromDay(input.date),
      topic: input.topic,
      maxMarks: input.maxMarks,
      createdBy: { name: user?.name ?? "The school", role: caller.role },
    });
    const names = await subjectNames(tenantId, [made.subjectId]);
    const dto = testDto(made.toObject(), names, true);
    Notify.testAdded(tenantId, caller.userId, { unit, subjectName: dto.subjectName, date: dto.date, topic: dto.topic, maxMarks: dto.maxMarks, by: user?.name ?? "The school" });
    return dto;
  }

  private static async testWithAccess(tenantId: string, caller: Caller, id: string) {
    const test = await ClassTest.findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) }).lean();
    if (!test) throw TEST_NOT_FOUND();
    const unit = await resolveUnit(tenantId, test.classId.toString(), test.sectionId?.toString() ?? null);
    const access = await accessTo(tenantId, caller, unit);
    return { test, unit, canWrite: access.subjects.has(test.subjectId.toString()) };
  }

  /** One test with each child of the class and their marks (empty until entered). */
  static async test(tenantId: string, caller: Caller, id: string) {
    const { test, unit, canWrite } = await WorkService.testWithAccess(tenantId, caller, id);
    const [children, names] = await Promise.all([childrenOf(tenantId, unit), subjectNames(tenantId, [test.subjectId])]);
    const marks = new Map(test.marks.map((m) => [m.studentId.toString(), m]));
    return {
      ...testDto(test, names, canWrite),
      label: unit.label,
      students: children.map((c) => ({ ...c, marks: marks.get(c.id)?.marks ?? null, absent: marks.get(c.id)?.absent ?? false })),
    };
  }

  static async saveMarks(tenantId: string, caller: Caller, id: string, input: SaveMarksInput) {
    const { test, unit, canWrite } = await WorkService.testWithAccess(tenantId, caller, id);
    if (!canWrite) throw NOT_THEIRS();
    if (toDay(test.date) > todayInIndia()) throw ApiError.conflict("The marks are entered once the test is held.", "TEST_NOT_HELD");
    const over = input.marks.find((m) => m.marks !== null && m.marks > test.maxMarks);
    if (over) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "marks", message: `Marks are out of ${test.maxMarks}` }]);
    const children = new Set((await childrenOf(tenantId, unit)).map((c) => c.id));
    if (input.marks.some((m) => !children.has(m.studentId))) throw ApiError.badRequest("A child in this list is not in this class.", "NOT_IN_CLASS");
    const given = new Map(input.marks.map((m) => [m.studentId, m]));
    const kept = test.marks.filter((m) => !given.has(m.studentId.toString()));
    const next = [...kept, ...input.marks.map((m) => ({ studentId: new Types.ObjectId(m.studentId), marks: m.absent ? null : m.marks, absent: m.absent }))];
    await ClassTest.updateOne({ _id: test._id, tenantId: new Types.ObjectId(tenantId) }, { $set: { marks: next } });
    const saved = await WorkService.test(tenantId, caller, id);
    // The parents of the children whose marks are new or different hear them; the others are not told again.
    const old = new Map(test.marks.map((m) => [m.studentId.toString(), m]));
    const nameOf = new Map(saved.students.map((c) => [c.id, c.name]));
    const changed = input.marks
      .map((m) => ({ id: m.studentId, name: nameOf.get(m.studentId) ?? "Your child", marks: m.absent ? null : m.marks, absent: m.absent }))
      .filter((m) => (m.absent || m.marks !== null) && ((old.get(m.id)?.marks ?? null) !== m.marks || (old.get(m.id)?.absent ?? false) !== m.absent));
    const user = await User.findById(caller.userId).select("name").lean();
    Notify.marksSaved(tenantId, caller.userId, {
      unit,
      subjectName: saved.subjectName,
      date: saved.date,
      topic: saved.topic,
      maxMarks: saved.maxMarks,
      average: saved.average,
      by: user?.name ?? "The school",
      changed,
    });
    return saved;
  }

  static async removeTest(tenantId: string, caller: Caller, id: string) {
    const { test, unit, canWrite } = await WorkService.testWithAccess(tenantId, caller, id);
    if (!canWrite) throw NOT_THEIRS();
    await ClassTest.deleteOne({ _id: test._id, tenantId: new Types.ObjectId(tenantId) });
    const subjectName = (await subjectNames(tenantId, [test.subjectId])).get(test.subjectId.toString()) ?? "A subject";
    Notify.testRemoved(tenantId, caller.userId, { unit, subjectName, date: toDay(test.date), topic: test.topic });
  }

  // ---- For a parent ------------------------------------------------------------------------------------------------------------------
  private static async childUnit(tenantId: string, userId: string, studentId: string) {
    const { student } = await ParentService.childOf(tenantId, userId, studentId);
    const school = new Types.ObjectId(tenantId);
    const yearId = await AcademicYearService.activeYearId(school);
    const place = (await placesOf(school, yearId, [student._id])).get(student._id.toString());
    return { student, place, school, yearId };
  }

  /** The child's class's diary of a day (today when none is asked). */
  static async childDiary(tenantId: string, userId: string, studentId: string, date?: string) {
    const day = date ?? todayInIndia();
    const { place, school } = await WorkService.childUnit(tenantId, userId, studentId);
    if (!place) return { date: day, entries: [] };
    const entries = await DiaryEntry.find({
      tenantId: school,
      classId: new Types.ObjectId(place.classId),
      sectionId: place.sectionId ? new Types.ObjectId(place.sectionId) : null,
      date: fromDay(day),
    }).lean();
    const names = await subjectNames(tenantId, entries.map((e) => e.subjectId));
    return {
      date: day,
      entries: entries
        .map((e) => ({ subjectName: names.get(e.subjectId.toString()) ?? "A subject", taught: e.taught, homework: e.homework, writtenBy: e.writtenBy.name }))
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    };
  }

  /** The child's coming tests and their results (marks, percentage), with the average of the results. */
  static async childTests(tenantId: string, userId: string, studentId: string) {
    const { student, place, school, yearId } = await WorkService.childUnit(tenantId, userId, studentId);
    if (!place || !yearId) return { upcoming: [], results: [], average: null };
    const tests = await ClassTest.find({
      tenantId: school,
      academicYearId: yearId,
      classId: new Types.ObjectId(place.classId),
      sectionId: place.sectionId ? new Types.ObjectId(place.sectionId) : null,
    }).lean();
    const names = await subjectNames(tenantId, tests.map((t) => t.subjectId));
    const today = todayInIndia();
    const upcoming: { id: string; subjectName: string; date: string; topic: string; maxMarks: number }[] = [];
    const results: { id: string; subjectName: string; date: string; topic: string; maxMarks: number; marks: number | null; absent: boolean; percent: number | null }[] = [];
    for (const t of tests) {
      const base = { id: t._id.toString(), subjectName: names.get(t.subjectId.toString()) ?? "A subject", date: toDay(t.date), topic: t.topic, maxMarks: t.maxMarks };
      const mine = t.marks.find((m) => m.studentId.equals(student._id));
      if (mine && isEntered(mine)) results.push({ ...base, marks: mine.absent ? null : mine.marks, absent: mine.absent, percent: mine.absent ? null : percentOf(mine.marks, t.maxMarks) });
      else if (base.date >= today) upcoming.push(base);
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    results.sort((a, b) => b.date.localeCompare(a.date));
    return { upcoming, results, average: averageOf(results.map((r) => r.percent)) };
  }
}
