import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Section } from "../../academics/models/Section";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { resolveUnit, unitLabel } from "../../timetable/services/unit";
import { User } from "../../users/models/User";
import { DiaryEntry, Syllabus, type IChapter } from "../models/ClassWork";
import type { SaveSyllabusInput, SyllabusSourcesQuery } from "../schemas/classroom.schemas";
import { accessTo, NOT_THEIR_SUBJECT, unitFilter } from "./access";
import { fromDay, toDay } from "./calendar.service";
import { CHAPTER_NOT_FOUND, chapterDto, plannedDay } from "./chapters";
import type { Caller } from "./leave.service";

/** The chapters of one subject of a class (docs/teaching-progress.md), saved as one list. */
export class SyllabusService {
  static async save(tenantId: string, caller: Caller, input: SaveSyllabusInput) {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId ?? null);
    const access = await accessTo(tenantId, caller, unit);
    if (!access.subjects.has(input.subjectId)) throw NOT_THEIR_SUBJECT();
    const filter = { ...unitFilter(tenantId, unit), academicYearId: unit.yearId, subjectId: new Types.ObjectId(input.subjectId) };
    const plan = await Syllabus.findOne(filter).lean();
    const earlier = new Map((plan?.chapters ?? []).map((c) => [c._id.toString(), c]));
    if (input.chapters.some((c) => c.id && !earlier.has(c.id))) throw CHAPTER_NOT_FOUND();

    // A chapter that was taught stays: the diary of those days names it.
    const kept = new Set(input.chapters.flatMap((c) => c.id ?? []));
    const removed = [...earlier.values()].filter((c) => !kept.has(c._id.toString()));
    if (removed.length > 0) {
      const taught = await DiaryEntry.findOne({ ...filter, chapterId: { $in: removed.map((c) => c._id) } })
        .select("chapterId")
        .lean();
      if (taught) {
        const name = earlier.get(taught.chapterId!.toString())!.name;
        throw ApiError.conflict(`"${name}" was already taught, so it cannot be taken off.`, "CHAPTER_IN_USE");
      }
    }

    await SyllabusService.checkPlannedDays(tenantId, unit.yearId, input, earlier);

    const today = fromDay(todayInIndia());
    const chapters = input.chapters.map((c) => {
      const was = c.id ? earlier.get(c.id) : undefined;
      const done = c.done ?? !!was?.completedOn;
      const plannedOn = c.plannedOn === undefined ? (was?.plannedOn ?? null) : c.plannedOn ? fromDay(c.plannedOn) : null;
      // A new planned day is told about again when it goes; the same one is not.
      const lateToldOn = plannedOn?.getTime() === was?.plannedOn?.getTime() ? (was?.lateToldOn ?? null) : null;
      return { _id: was?._id ?? new Types.ObjectId(), name: c.name, completedOn: done ? (was?.completedOn ?? today) : null, plannedOn, lateToldOn };
    });
    const user = await User.findById(caller.userId).select("name").lean();
    await Syllabus.updateOne(filter, { $set: { chapters, updatedBy: { name: user?.name ?? "The school", role: caller.role } } }, { upsert: true });
    return { chapters: chapters.map(chapterDto) };
  }

  /** A planned day that is new or changed is a day of the session (one already saved stays, whatever happened to the year's dates). */
  private static async checkPlannedDays(tenantId: string, yearId: Types.ObjectId, input: SaveSyllabusInput, earlier: Map<string, IChapter>) {
    const changed = input.chapters
      .map((c, at) => {
        const was = c.id ? earlier.get(c.id) : undefined;
        return { at, day: c.plannedOn, was: was ? plannedDay(was) : null };
      })
      .filter((c) => c.day && c.day !== c.was);
    if (changed.length === 0) return;
    const year = await AcademicYear.findOne({ _id: yearId, tenantId: new Types.ObjectId(tenantId) }).select("name startDate endDate").lean();
    if (!year) return;
    const [from, to] = [toDay(year.startDate), toDay(year.endDate)];
    const wrong = changed.filter((c) => c.day! < from || c.day! > to);
    if (wrong.length === 0) return;
    const details = wrong.map((c) => ({ path: `chapters.${c.at}.plannedOn`, message: `Choose a day of the ${year.name} session` }));
    throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", details);
  }

  /**
   * The lists a class subject's chapters can be copied from: the same subject in this class's other sections, and in any section of it in an
   * earlier year (this section's own too), this year's first, then the newest year. Names only, with the planned days of this year's lists:
   * a day of an earlier year says nothing about this one, and what was finished is never copied.
   */
  static async sources(tenantId: string, caller: Caller, query: SyllabusSourcesQuery) {
    const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
    const access = await accessTo(tenantId, caller, unit);
    if (!access.subjects.has(query.subjectId)) throw NOT_THEIR_SUBJECT();
    const school = new Types.ObjectId(tenantId);
    const plans = await Syllabus.find({ tenantId: school, classId: new Types.ObjectId(unit.classId), subjectId: new Types.ObjectId(query.subjectId), "chapters.0": { $exists: true } }).lean();
    const others = plans.filter((p) => !(p.academicYearId.equals(unit.yearId) && String(p.sectionId ?? "") === (unit.sectionId ?? "")));
    if (others.length === 0) return [];
    const [years, sections] = await Promise.all([
      AcademicYear.find({ tenantId: school, _id: { $in: others.map((p) => p.academicYearId) } }).select("name startDate").lean(),
      Section.find({ tenantId: school, _id: { $in: others.flatMap((p) => p.sectionId ?? []) } }).select("name").lean(),
    ]);
    const yearOf = new Map(years.map((y) => [y._id.toString(), y]));
    const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));
    return others
      .map((p) => {
        const here = p.academicYearId.equals(unit.yearId);
        const year = yearOf.get(p.academicYearId.toString());
        const name = unitLabel(unit.className, p.sectionId ? (sectionName.get(p.sectionId.toString()) ?? "?") : null);
        return {
          id: p._id.toString(),
          label: here ? name : `${name}, ${year?.name ?? "an earlier year"}`,
          chapters: p.chapters.map((c) => ({ name: c.name, plannedOn: here ? plannedDay(c) : null })),
          order: here ? Number.MAX_SAFE_INTEGER : (year?.startDate.getTime() ?? 0),
        };
      })
      .sort((a, b) => b.order - a.order || a.label.localeCompare(b.label))
      .map(({ order: _order, ...source }) => source);
  }
}
