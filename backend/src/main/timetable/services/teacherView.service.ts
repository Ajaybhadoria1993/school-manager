import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Teacher } from "../../staff/models/Teacher";
import { ClassTeacherService } from "../../staff/services/classTeacher.service";
import { TeacherLogin } from "../../staff/services/teacherLogin.service";
import { Allotment } from "../../subjects/models/Allotment";
import { openYearIds } from "../../subjects/services/subject.service";
import type { UserRole } from "../../users/models/User";
import { Timetable } from "../models/Timetable";
import type { ReplaceTeacherBody } from "../schemas/timetable.schemas";
import { minutesToClock } from "../time";
import { analyse, type AllotmentInfo, type CellIn } from "./checker";
import { busyFrom, labelOf, loadWorld, unitDays, type StoredTimetable, type World } from "./world";

export interface TeacherWeek {
  teacher: { id: string; name: string; isActive: boolean; offDays: number[]; maxPerDay: number | null; maxPerWeek: number | null };
  /** Every lesson the teacher has this year, by day and time. A draft timetable's lessons are marked (`published` false). */
  lessons: {
    day: number;
    period: number;
    start: string;
    end: string;
    classId: string;
    sectionId: string | null;
    label: string;
    subjectId: string;
    subjectName: string;
    room: string | null;
    published: boolean;
  }[];
  /** What they were given (class, subject, periods a week), whether or not it is in a timetable yet. */
  teaches: { classId: string; sectionId: string | null; label: string; subjectId: string; subjectName: string; periodsPerWeek: number }[];
  perDay: Record<string, number>;
  week: number;
}

export class TeacherTimetableService {
  /** A teacher's week across every class. A teacher sees only what is published; the people who make the timetables see drafts too. */
  static async get(tenantId: string, role: UserRole, teacherId: string): Promise<TeacherWeek> {
    const teacher = await Teacher.findOne({ _id: teacherId, tenantId }).lean();
    if (!teacher) throw ApiError.notFound("Teacher not found", "TEACHER_NOT_FOUND");
    const year = await AcademicYear.findOne({ tenantId: new Types.ObjectId(tenantId), status: "active" }).select("_id").lean();
    const dto: TeacherWeek["teacher"] = { id: teacherId, name: teacher.name, isActive: teacher.isActive, offDays: [...(teacher.offDays ?? [])].sort((a, b) => a - b), maxPerDay: teacher.maxPeriodsPerDay ?? null, maxPerWeek: teacher.maxPeriodsPerWeek ?? null };
    if (!year) return { teacher: dto, lessons: [], teaches: [], perDay: {}, week: 0 };

    const world = await loadWorld(tenantId, year._id);
    const lessons: TeacherWeek["lessons"] = [];
    for (const [key, timetable] of world.timetables) {
      if (role === "teacher" && timetable.status !== "published") continue;
      const periods = new Map(unitDays(world, timetable.classId).map((d) => [d.day, new Map(d.periods.map((p) => [p.period, p]))]));
      const allotments = world.allotments.get(key);
      for (const cell of timetable.cells) {
        const span = periods.get(cell.day)?.get(cell.period);
        if (!span) continue;
        for (const lesson of cell.lessons) {
          if ((lesson.teacherId ?? allotments?.get(lesson.subjectId)?.teacherId ?? null) !== teacherId) continue;
          lessons.push({
            day: cell.day,
            period: cell.period,
            start: minutesToClock(span.start),
            end: minutesToClock(span.end),
            classId: timetable.classId,
            sectionId: timetable.sectionId,
            label: labelOf(world, timetable.classId, timetable.sectionId),
            subjectId: lesson.subjectId,
            subjectName: world.subjects.get(lesson.subjectId)?.name ?? "A subject",
            room: lesson.room,
            published: timetable.status === "published",
          });
        }
      }
    }
    lessons.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));

    const teaches: TeacherWeek["teaches"] = [];
    for (const [key, subjects] of world.allotments) {
      const [classId, section] = key.split(":");
      for (const a of subjects.values()) {
        if (a.teacherId !== teacherId) continue;
        const sectionId = section === "-" ? null : section;
        teaches.push({ classId, sectionId, label: labelOf(world, classId, sectionId), subjectId: a.subjectId, subjectName: a.subjectName, periodsPerWeek: a.periodsPerWeek });
      }
    }
    teaches.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));

    const perDay: Record<string, number> = {};
    for (const l of lessons) perDay[String(l.day)] = (perDay[String(l.day)] ?? 0) + 1;
    return { teacher: dto, lessons, teaches, perDay, week: lessons.length };
  }

  /**
   * Gives everything one teacher has (their classes' subjects, and the lessons that name them) to another, for a teacher who has left or
   * is away for good. Checked first: the new teacher must be free (and come) at every period they would take over; if not, nothing is
   * changed and the first clash is said. `deactivate` also makes the old teacher inactive.
   */
  static async replace(tenantId: string, teacherId: string, input: ReplaceTeacherBody): Promise<{ allotments: number; lessons: number }> {
    if (input.withTeacherId === teacherId) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "withTeacherId", message: "Choose another teacher" }]);
    }
    const school = new Types.ObjectId(tenantId);
    const replacement = await Teacher.findOne({ _id: input.withTeacherId, tenantId: school }).select("name isActive").lean();
    if (!replacement) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "withTeacherId", message: "Choose a teacher from your school's list" }]);
    if (!replacement.isActive) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "withTeacherId", message: `${replacement.name} is no longer teaching here` }]);

    const years = await openYearIds(tenantId);
    // Check every year first, then change.
    for (const yearId of years) {
      const problem = await TeacherTimetableService.firstClash(await loadWorld(tenantId, yearId), teacherId, input.withTeacherId);
      if (problem) {
        throw ApiError.conflict(problem.message, "TIMETABLE_CLASHES", [{ path: problem.path, message: problem.message, code: problem.code }]);
      }
    }

    const oldId = new Types.ObjectId(teacherId);
    const newId = new Types.ObjectId(input.withTeacherId);
    const changedAllotments = await Allotment.updateMany({ tenantId: school, academicYearId: { $in: years }, teacherId: oldId }, { $set: { teacherId: newId } });
    const named = await Timetable.find({ tenantId: school, academicYearId: { $in: years }, "cells.lessons.teacherId": oldId }).select("cells").lean();
    const lessons = named.reduce((sum, t) => sum + t.cells.reduce((s, c) => s + c.lessons.filter((l) => l.teacherId?.equals(oldId)).length, 0), 0);
    await Timetable.updateMany(
      { tenantId: school, academicYearId: { $in: years }, "cells.lessons.teacherId": oldId },
      { $set: { "cells.$[].lessons.$[l].teacherId": newId } },
      { arrayFilters: [{ "l.teacherId": oldId }] }
    );
    // Their class teacher posts go to the new teacher too.
    await ClassTeacherService.handOver(tenantId, years, oldId, newId);
    if (input.deactivate) {
      const left = await Teacher.findOneAndUpdate({ _id: oldId, tenantId: school }, { $set: { isActive: false } }).select("userId").lean();
      // A teacher who has left cannot sign in any more.
      await TeacherLogin.setActive(left?.userId, false);
    }
    return { allotments: changedAllotments.modifiedCount, lessons };
  }

  /** The first new clash if the new teacher took over, in a year's world: the old teacher's lessons moved to them, then every touched class checked. */
  private static async firstClash(world: World, oldId: string, newId: string): Promise<{ path: string; message: string; code: string } | null> {
    const swap = (id: string | null) => (id === oldId ? newId : id);
    const affected = new Set<string>();
    for (const [key, subjects] of world.allotments) if ([...subjects.values()].some((a) => a.teacherId === oldId)) affected.add(key);
    for (const [key, t] of world.timetables) if (t.cells.some((c) => c.lessons.some((l) => l.teacherId === oldId))) affected.add(key);
    if (affected.size === 0) return null;

    const errorsIn = (w: World, key: string): { code: string; message: string; day?: number; period?: number }[] => {
      const t = w.timetables.get(key);
      if (!t) return [];
      return analyse({ days: unitDays(w, t.classId), cells: t.cells as CellIn[], allotments: w.allotments.get(key) ?? new Map(), teachers: w.teachers, busy: busyFrom(w, key) }).issues.filter((i) => i.level === "error");
    };
    const before = new Map([...affected].map((key) => [key, new Set(errorsIn(world, key).map((e) => `${e.code}:${e.day}:${e.period}`))]));

    const after: World = {
      ...world,
      allotments: new Map([...world.allotments].map(([key, subjects]) => [key, new Map([...subjects].map(([id, a]): [string, AllotmentInfo] => [id, { ...a, teacherId: swap(a.teacherId) }]))])),
      timetables: new Map(
        [...world.timetables].map(([key, t]): [string, StoredTimetable] => [key, { ...t, cells: t.cells.map((c) => ({ ...c, lessons: c.lessons.map((l) => ({ ...l, teacherId: swap(l.teacherId) })) })) }])
      ),
    };
    for (const key of affected) {
      const known = before.get(key)!;
      const added = errorsIn(after, key).find((e) => !known.has(`${e.code}:${e.day}:${e.period}`));
      if (added) {
        const t = after.timetables.get(key) ?? world.timetables.get(key);
        const label = t ? labelOf(world, t.classId, t.sectionId) : "A class";
        return { path: `d${added.day}p${added.period}`, message: `${label}: ${added.message}`, code: added.code };
      }
    }
    return null;
  }
}

