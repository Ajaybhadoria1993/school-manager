import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow } from "../../../utils/clock";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { TeacherAttendance } from "../../attendance/models/TeacherAttendance";
import { CalendarService } from "../../classroom/services/calendar.service";
import { Notify } from "../../notifications/services/events";
import { Substitution } from "../models/Substitution";
import type { ArrangementInput } from "../schemas/timetable.schemas";
import { minutesToClock } from "../time";
import { periodsOf, resolveSchedule } from "./scheduleRules";
import { SpecialDayService } from "./specialDay.service";
import { labelOf, loadWorld, unitKey } from "./world";

/**
 * The day's arrangement (2026-11-22, user: "teacher absent ho to arrangement: alag tab mein kaun nahi aaya, fir kaun kaun se teacher free hain, to
 * us period mein us teacher ko assign kar paye"). For one date: the teachers who are away (marked Absent or Leave in the teachers' attendance, and
 * today also the ones who have not checked in yet), each with the lessons they have that day in the published timetables, and for each lesson the
 * teachers who are free then (they come that weekday, are not away, teach nothing else at that time in any class or medium, and are not already
 * put in somewhere else then), the ones with the fewest periods that day first. A special day's periods are the day's (a half day has fewer).
 * Putting a teacher in is for that day only (`Substitution`); the timetable stays as it is. Made for today; another day is only read.
 */

export type AwayStatus = "absent" | "leave" | "not_in";

export interface FreeTeacher {
  id: string;
  name: string;
  /** Periods they have that day already (their lessons and the lessons they were put in for). */
  today: number;
  /** They have as many periods that day as they can take (their most in a day). */
  full: boolean;
  /** They marked themselves present (or the school did) that day. */
  in: boolean;
}

export interface ArrangementLesson {
  classId: string;
  sectionId: string | null;
  label: string;
  period: number;
  start: string;
  end: string;
  subjectId: string;
  subjectName: string;
  substitute: { id: string; name: string } | null;
  free: FreeTeacher[];
}

export interface ArrangementDay {
  date: string;
  /** The date is today: only today's arrangement can be changed. */
  today: boolean;
  /** No school that day for everyone: a holiday, or a special day without classes. */
  holiday: string | null;
  away: { teacher: { id: string; name: string }; status: AwayStatus; lessons: ArrangementLesson[] }[];
}

interface DayLesson {
  classId: string;
  sectionId: string | null;
  label: string;
  period: number;
  start: number;
  end: number;
  subjectId: string;
  subjectName: string;
  teacherId: string | null;
}

const lessonKey = (classId: string, sectionId: string | null, period: number, teacherId: string) => `${unitKey(classId, sectionId)}:${period}:${teacherId}`;
const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
const STATUS_ORDER: Record<AwayStatus, number> = { absent: 0, leave: 1, not_in: 2 };

/** Everything the day is made of, read once: what the page shows and what a change is checked against. */
async function readDay(tenantId: string, date: string, yearId: Types.ObjectId) {
  const school = new Types.ObjectId(tenantId);
  const weekday = weekdayOf(date);
  const [world, marks, specials, holidays, subs] = await Promise.all([
    loadWorld(tenantId, yearId),
    TeacherAttendance.find({ tenantId: school, date: new Date(`${date}T00:00:00.000Z`) }).select("teacherId mark").lean(),
    SpecialDayService.between(tenantId, date, date),
    CalendarService.holidaysBetween(school, date, date),
    Substitution.find({ tenantId: school, date }).lean(),
  ]);
  const mark = new Map(marks.map((m) => [m.teacherId.toString(), m.mark]));
  const wholeSchool = specials.find((s) => s.classIds.length === 0);
  const holiday = holidays[0]?.title ?? (wholeSchool && wholeSchool.slots.length === 0 ? wholeSchool.title : null);

  // The periods each class has that day: a special day's for its classes, else the timing it follows that weekday.
  const periodsCache = new Map<string, Map<number, { start: number; end: number }>>();
  const periodsFor = (classId: string) => {
    let found = periodsCache.get(classId);
    if (!found) {
      const special = specials.find((s) => s.classIds.length === 0 || s.classIds.some((c) => c.toString() === classId));
      const rule = special ? { slots: special.slots } : resolveSchedule(world.rules, classId, weekday);
      found = new Map((rule ? periodsOf(rule) : []).map((p) => [p.period, { start: p.start, end: p.end }]));
      periodsCache.set(classId, found);
    }
    return found;
  };

  const lessons: DayLesson[] = [];
  if (!holiday) {
    for (const [key, timetable] of world.timetables) {
      // A draft is not in force.
      if (timetable.status !== "published") continue;
      const allotments = world.allotments.get(key);
      for (const cell of timetable.cells) {
        if (cell.day !== weekday) continue;
        const span = periodsFor(timetable.classId).get(cell.period);
        if (!span) continue;
        for (const lesson of cell.lessons) {
          lessons.push({
            classId: timetable.classId,
            sectionId: timetable.sectionId,
            label: labelOf(world, timetable.classId, timetable.sectionId),
            period: cell.period,
            start: span.start,
            end: span.end,
            subjectId: lesson.subjectId,
            subjectName: world.subjects.get(lesson.subjectId)?.name ?? "A subject",
            teacherId: lesson.teacherId ?? allotments?.get(lesson.subjectId)?.teacherId ?? null,
          });
        }
      }
    }
  }
  lessons.sort((a, b) => a.start - b.start || a.label.localeCompare(b.label));
  return { world, weekday, mark, holiday, lessons, subs, periodsFor };
}

type Day = Awaited<ReturnType<typeof readDay>>;

/** Who is away that day: marked Absent or Leave; today also the ones who come that weekday, have lessons and have not checked in yet. */
function awayTeachers(day: Day, isToday: boolean): { id: string; status: AwayStatus }[] {
  const found: { id: string; status: AwayStatus }[] = [];
  for (const t of day.world.teachers.values()) {
    if (!t.isActive) continue;
    const m = day.mark.get(t.id);
    if (m === "absent" || m === "leave") found.push({ id: t.id, status: m });
    else if (!m && isToday && !day.holiday && !t.offDays.includes(day.weekday) && day.lessons.some((l) => l.teacherId === t.id)) found.push({ id: t.id, status: "not_in" });
  }
  return found;
}

/**
 * The teachers free for a lesson: everyone who comes that weekday, is not marked Absent or Leave and has nothing else at that time (`exceptSub`: this
 * lesson's own substitute). One who has not checked in yet is offered too (`in` false, after the ones who are in): they may only have forgotten.
 */
function freeFor(day: Day, lesson: DayLesson, exceptSub: string | null): FreeTeacher[] {
  const subSpans = day.subs
    .filter((s) => s._id.toString() !== exceptSub)
    .map((s) => ({ teacherId: s.substituteTeacherId.toString(), span: day.periodsFor(s.classId.toString()).get(s.period) }))
    .filter((s): s is { teacherId: string; span: { start: number; end: number } } => Boolean(s.span));
  const outside = day.world.outsideBusy.filter((b) => b.day === day.weekday);
  const found: FreeTeacher[] = [];
  for (const t of day.world.teachers.values()) {
    if (!t.isActive || t.id === lesson.teacherId || t.offDays.includes(day.weekday)) continue;
    const m = day.mark.get(t.id);
    if (m === "absent" || m === "leave") continue;
    const own = day.lessons.filter((l) => l.teacherId === t.id);
    const covering = subSpans.filter((s) => s.teacherId === t.id);
    if (own.some((l) => overlaps(l, lesson)) || covering.some((s) => overlaps(s.span, lesson)) || outside.some((b) => b.teacherId === t.id && overlaps(b, lesson))) continue;
    const today = own.length + covering.length;
    found.push({ id: t.id, name: t.name, today, full: t.maxPerDay !== null && today >= t.maxPerDay, in: m === "present" });
  }
  return found.sort((a, b) => Number(a.full) - Number(b.full) || Number(b.in) - Number(a.in) || a.today - b.today || a.name.localeCompare(b.name));
}

function build(day: Day, date: string, isToday: boolean): ArrangementDay {
  const away = awayTeachers(day, isToday);
  const subOf = new Map(day.subs.map((s) => [lessonKey(s.classId.toString(), s.sectionId ? s.sectionId.toString() : null, s.period, s.absentTeacherId.toString()), s]));
  const nameOf = (id: string) => day.world.teachers.get(id)?.name ?? "A teacher";
  return {
    date,
    today: isToday,
    holiday: day.holiday,
    away: away
      .map(({ id, status }) => ({
        teacher: { id, name: nameOf(id) },
        status,
        lessons: day.lessons
          .filter((l) => l.teacherId === id)
          .map((l) => {
            const sub = subOf.get(lessonKey(l.classId, l.sectionId, l.period, id));
            const substituteId = sub ? sub.substituteTeacherId.toString() : null;
            return {
              classId: l.classId,
              sectionId: l.sectionId,
              label: l.label,
              period: l.period,
              start: minutesToClock(l.start),
              end: minutesToClock(l.end),
              subjectId: l.subjectId,
              subjectName: l.subjectName,
              substitute: substituteId ? { id: substituteId, name: nameOf(substituteId) } : null,
              free: freeFor(day, l, sub ? sub._id.toString() : null),
            };
          }),
      }))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.teacher.name.localeCompare(b.teacher.name)),
  };
}

export class ArrangementService {
  static async get(tenantId: string, date: string): Promise<ArrangementDay> {
    const isToday = date === indiaNow().date;
    const yearId = await AcademicYearService.shownYearId(tenantId);
    if (!yearId) return { date, today: isToday, holiday: null, away: [] };
    return build(await readDay(tenantId, date, yearId), date, isToday);
  }

  /** Puts a free teacher in for an away teacher's lesson today, or takes the one put in away (`substituteTeacherId` null). Answers the day as it is now. */
  static async set(tenantId: string, actorId: string, input: ArrangementInput): Promise<ArrangementDay> {
    const today = indiaNow().date;
    if (input.date !== today) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "The arrangement is made for today" }]);
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    const day = await readDay(tenantId, today, yearId);
    const shown = build(day, today, true);
    const lesson = shown.away.find((a) => a.teacher.id === input.absentTeacherId)?.lessons.find((l) => l.classId === input.classId && l.sectionId === input.sectionId && l.period === input.period);
    if (!lesson) throw ApiError.conflict("This teacher is not away for this lesson today.", "NOT_AWAY");

    const school = new Types.ObjectId(tenantId);
    const where = { tenantId: school, date: today, classId: new Types.ObjectId(input.classId), sectionId: input.sectionId ? new Types.ObjectId(input.sectionId) : null, period: input.period, absentTeacherId: new Types.ObjectId(input.absentTeacherId) };
    const before = lesson.substitute?.id ?? null;
    const facts = { date: today, today: true, label: lesson.label, period: lesson.period, hours: `${lesson.start} to ${lesson.end}`, subjectName: lesson.subjectName, absentName: day.world.teachers.get(input.absentTeacherId)?.name ?? "the teacher" };

    if (input.substituteTeacherId === null) {
      await Substitution.deleteOne(where);
      if (before) Notify.substitute(tenantId, actorId, "removed", { ...facts, teacherId: before });
    } else {
      const chosen = input.substituteTeacherId;
      if (chosen !== before && !lesson.free.some((t) => t.id === chosen)) {
        throw ApiError.conflict(`${day.world.teachers.get(chosen)?.name ?? "This teacher"} is not free from ${lesson.start} to ${lesson.end} today.`, "TEACHER_NOT_FREE");
      }
      await Substitution.findOneAndUpdate(where, { $set: { substituteTeacherId: new Types.ObjectId(chosen), subjectId: new Types.ObjectId(lesson.subjectId) }, $setOnInsert: { academicYearId: yearId } }, { upsert: true });
      if (chosen !== before) {
        Notify.substitute(tenantId, actorId, "added", { ...facts, teacherId: chosen });
        if (before) Notify.substitute(tenantId, actorId, "removed", { ...facts, teacherId: before });
      }
    }
    return ArrangementService.get(tenantId, today);
  }
}

