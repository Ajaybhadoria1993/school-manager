import { Types } from "mongoose";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { Teacher } from "../../staff/models/Teacher";
import { Allotment } from "../../subjects/models/Allotment";
import { Subject } from "../../subjects/models/Subject";
import { sidesOfSchool } from "../../tenants/services/schoolSides";
import { Timetable, type ICell } from "../models/Timetable";
import { unitLabel } from "./unit";
import type { AllotmentInfo, Busy, TeacherInfo } from "./checker";
import { loadRules } from "./schedule.service";
import { periodsOf, resolveSchedule, type PeriodSpan, type ScheduleRule } from "./scheduleRules";

/** "classId:sectionId", or "classId:-" for a class that has no sections: one key per unit. */
export const unitKey = (classId: string, sectionId: string | null) => `${classId}:${sectionId ?? "-"}`;

export interface StoredTimetable {
  id: string;
  classId: string;
  sectionId: string | null;
  cells: { day: number; period: number; lessons: { subjectId: string; teacherId: string | null; room: string | null }[] }[];
  status: "draft" | "published";
}

/**
 * Everything about one school's year that the timetable's rules need, read once: the timings, the names, the teachers, what each unit
 * studies and every timetable made so far. A request reads it, decides, and writes; it is never kept between requests.
 */
export interface World {
  tenantId: string;
  yearId: Types.ObjectId;
  rules: ScheduleRule[];
  classNames: Map<string, string>;
  sectionNames: Map<string, string>;
  subjects: Map<string, { name: string; code: string | null; category: "academic" | "activity"; isActive: boolean }>;
  teachers: Map<string, WorldTeacher>;
  allotments: Map<string, Map<string, AllotmentInfo>>;
  timetables: Map<string, StoredTimetable>;
  /**
   * What the same people already teach on the school's OTHER mediums at the same time (2026-11-18): a teacher of both English and Hindi medium is one
   * person with one login and a record on each side, and a medium is run on its own, so each side only saw its own timetables and could put the
   * teacher in two places. These are the other sides' lessons of the teachers this side shares with them, as busy time of THIS side's teacher
   * records. Empty for a school with one medium.
   */
  outsideBusy: Busy[];
}

/** A teacher as the rules read them, with the subjects they can teach (to suggest them first). */
export interface WorldTeacher extends TeacherInfo {
  subjectIds: string[];
}

const toCells = (cells: ICell[]): StoredTimetable["cells"] =>
  cells.map((c) => ({
    day: c.day,
    period: c.period,
    lessons: c.lessons.map((l) => ({ subjectId: l.subjectId.toString(), teacherId: l.teacherId ? l.teacherId.toString() : null, room: l.room ?? null })),
  }));

/**
 * Reads the world of one school's year. `outside: false` leaves out the other mediums' lessons (reading the OTHER side's world to find them must not
 * read back again).
 */
export async function loadWorld(tenantId: string, yearId: Types.ObjectId, options: { outside?: boolean } = {}): Promise<World> {
  const school = new Types.ObjectId(tenantId);
  const [rules, classes, sections, subjects, teachers, allotments, timetables] = await Promise.all([
    loadRules(tenantId),
    SchoolClass.find({ tenantId: school }).select("name").lean(),
    Section.find({ tenantId: school, academicYearId: yearId }).select("name").lean(),
    Subject.find({ tenantId: school }).select("name code category isActive").lean(),
    Teacher.find({ tenantId: school }).lean(),
    Allotment.find({ tenantId: school, academicYearId: yearId }).sort({ position: 1, _id: 1 }).lean(),
    Timetable.find({ tenantId: school, academicYearId: yearId }).lean(),
  ]);

  const subjectMap = new Map(subjects.map((s) => [s._id.toString(), { name: s.name, code: s.code ?? null, category: s.category, isActive: s.isActive !== false }]));
  const allotmentMap = new Map<string, Map<string, AllotmentInfo>>();
  for (const a of allotments) {
    const key = unitKey(a.classId.toString(), a.sectionId ? a.sectionId.toString() : null);
    const unit = allotmentMap.get(key) ?? new Map<string, AllotmentInfo>();
    unit.set(a.subjectId.toString(), {
      subjectId: a.subjectId.toString(),
      subjectName: subjectMap.get(a.subjectId.toString())?.name ?? "A subject",
      periodsPerWeek: a.periodsPerWeek,
      blockSize: a.blockSize,
      teacherId: a.teacherId ? a.teacherId.toString() : null,
      group: a.group ?? null,
    });
    allotmentMap.set(key, unit);
  }

  const world: World = {
    tenantId,
    yearId,
    rules,
    classNames: new Map(classes.map((c) => [c._id.toString(), c.name])),
    sectionNames: new Map(sections.map((s) => [s._id.toString(), s.name])),
    subjects: subjectMap,
    teachers: new Map(
      teachers.map((t) => [
        t._id.toString(),
        {
          id: t._id.toString(),
          name: t.name,
          isActive: t.isActive,
          offDays: t.offDays ?? [],
          maxPerDay: t.maxPeriodsPerDay ?? null,
          maxPerWeek: t.maxPeriodsPerWeek ?? null,
          subjectIds: (t.subjectIds ?? []).map((s) => s.toString()),
        },
      ])
    ),
    allotments: allotmentMap,
    timetables: new Map(
      timetables.map((t) => {
        const classId = t.classId.toString();
        const sectionId = t.sectionId ? t.sectionId.toString() : null;
        return [unitKey(classId, sectionId), { id: t._id.toString(), classId, sectionId, cells: toCells(t.cells), status: t.status }];
      })
    ),
    outsideBusy: [],
  };
  if (options.outside !== false) world.outsideBusy = await otherSidesBusy(tenantId, yearId, teachers);
  return world;
}

/**
 * The lessons the people of this side teach on the school's other mediums (see `World.outsideBusy`). A person is the same person when the two
 * teacher records point to the same login (`userId`); the other side's year is the one with the same name. Each lesson is put down against THIS
 * side's teacher record, with the other side's class and medium in its words ("Class 1 - A, English Medium").
 */
async function otherSidesBusy(tenantId: string, yearId: Types.ObjectId, teachers: { _id: Types.ObjectId; userId?: Types.ObjectId | null }[]): Promise<Busy[]> {
  const mine = new Map(teachers.flatMap((t) => (t.userId ? [[t.userId.toString(), t._id.toString()] as [string, string]] : [])));
  if (mine.size === 0) return [];
  const others = (await sidesOfSchool(tenantId)).filter((side) => side.id.toString() !== tenantId);
  if (others.length === 0) return [];
  const year = await AcademicYear.findOne({ _id: yearId, tenantId: new Types.ObjectId(tenantId) }).select("name").lean();
  if (!year) return [];
  const found: Busy[] = [];
  for (const side of others) {
    const theirYear = await AcademicYear.findOne({ tenantId: side.id, name: year.name }).select("_id").lean();
    if (!theirYear) continue;
    const theirTeachers = await Teacher.find({ tenantId: side.id, userId: { $in: [...mine.keys()] } }).select("userId").lean();
    if (theirTeachers.length === 0) continue;
    const asMine = new Map(theirTeachers.map((t) => [t._id.toString(), mine.get(t.userId!.toString())!]));
    const there = await loadWorld(side.id.toString(), theirYear._id, { outside: false });
    for (const busy of busyFrom(there, null)) {
      const local = busy.teacherId ? asMine.get(busy.teacherId) : undefined;
      if (local) found.push({ ...busy, teacherId: local, room: null, where: `${busy.where}, ${side.label}` });
    }
  }
  return found;
}

/** The periods a class has on each day it has school, from the timing it follows that day. */
export function unitDays(world: World, classId: string): { day: number; periods: PeriodSpan[] }[] {
  const days: { day: number; periods: PeriodSpan[] }[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const schedule = resolveSchedule(world.rules, classId, day);
    if (schedule) days.push({ day, periods: periodsOf(schedule) });
  }
  return days;
}

/** The name of a unit as the school writes it ("Class 5 - A"). */
export function labelOf(world: World, classId: string, sectionId: string | null): string {
  return unitLabel(world.classNames.get(classId) ?? "A class", sectionId ? (world.sectionNames.get(sectionId) ?? "?") : null);
}

/**
 * What every other unit already takes of the teachers' and rooms' time, as stretches of the clock: each lesson of every other timetable,
 * with the teacher who teaches it (the one it names, or the one the unit's subject list names). `only` narrows to the timetables a
 * caller may see (a teacher sees published ones).
 */
export function busyFrom(world: World, exceptKey: string | null, only?: (t: StoredTimetable) => boolean): Busy[] {
  const busy: Busy[] = [];
  for (const [key, timetable] of world.timetables) {
    if (key === exceptKey || (only && !only(timetable))) continue;
    const days = new Map(unitDays(world, timetable.classId).map((d) => [d.day, new Map(d.periods.map((p) => [p.period, p]))]));
    const allotments = world.allotments.get(key);
    const where = labelOf(world, timetable.classId, timetable.sectionId);
    for (const cell of timetable.cells) {
      const span = days.get(cell.day)?.get(cell.period);
      if (!span) continue; // a lesson in a period that no longer exists (the timing changed): it takes no time
      for (const lesson of cell.lessons) {
        busy.push({
          teacherId: lesson.teacherId ?? allotments?.get(lesson.subjectId)?.teacherId ?? null,
          room: lesson.room,
          day: cell.day,
          start: span.start,
          end: span.end,
          where,
          subjectName: world.subjects.get(lesson.subjectId)?.name ?? "A subject",
        });
      }
    }
  }
  // The other mediums' lessons of the same people, unless a caller narrowed to some timetables (a teacher sees the published ones of this side).
  if (!only) busy.push(...world.outsideBusy);
  return busy;
}
