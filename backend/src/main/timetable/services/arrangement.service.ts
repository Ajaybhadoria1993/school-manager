import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow } from "../../../utils/clock";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { TeacherAttendance } from "../../attendance/models/TeacherAttendance";
import { CalendarService, fromDay } from "../../classroom/services/calendar.service";
import { StaffLeaveService } from "../../attendance/services/staffLeave.service";
import { Notify } from "../../notifications/services/events";
import { AttendanceDay } from "../../classroom/models/AttendanceDay";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Teacher } from "../../staff/models/Teacher";
import { AttendanceCover } from "../models/AttendanceCover";
import { Substitution } from "../models/Substitution";
import type { ArrangementInput, AttendanceCoverInput, HandBackInput } from "../schemas/timetable.schemas";
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
 * Putting a teacher in is for that day only (`Substitution`); the timetable stays as it is. A teacher with an **approved leave** (2026-11-24: they
 * applied from their login) is away on every day of it, so the arrangement can be made for days to come too: today and any day after it can be changed,
 * a day that is over is only read.
 *
 * A teacher who is the **class teacher** of a class (2026-11-24, user: "class teacher absent ho to us class ki student attendance koi nahi le sakta: kisi aur
 * teacher ko assign kar do jo pehla period le") also has, for each of her classes, the class's student attendance of that day: the school names one other
 * teacher who takes a period of that class that day (the one with the earliest period first; one who has a login, since they must sign in) and that teacher
 * takes the class's attendance on that day (`AttendanceCover`, one record a day). When she is on an approved leave of several days (2026-11-24, user: "jab tak teacher
 * leave par hai tab tak dusra teacher hi attendance lega") one Assign gives it from that day to the last day of the leave: a record for each day, so a change or
 * a removal from a later day leaves the days before as they were.
 */

export type AwayStatus = "absent" | "leave" | "not_in" | "arrived";

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
  /**
   * Who had the class and for how long, when the teacher who was away has come (2026-11-24, user: "dikhe bhi ki kis teacher ne kitne min class li"): the substitute
   * for the whole period, or for the part before the teacher took the rest back, and the teacher for the rest. Empty while the period is still going on.
   */
  taken: { name: string; minutes: number }[];
  /** The teacher has come while the substitute is taking this period: the school may let her take the rest (the substitute is free then). */
  canTakeBack: boolean;
}

/** A class the away teacher is the class teacher of: who takes its student attendance that day, and who may (a teacher with a period in it that day). */
export interface ArrangementAttendance {
  classId: string;
  sectionId: string | null;
  label: string;
  /** Who takes it; `until` is the last day when it runs on through her leave (null: that day only). */
  cover: { id: string; name: string; until: string | null } | null;
  /** The last day of her approved leave, when the leave goes on beyond this day (an Assign here covers up to it); null otherwise. */
  leaveUntil: string | null;
  /** The teachers who can take it: the ones who take a period of this class that day, the earliest period first; `period` is their first one there. */
  options: { id: string; name: string; period: number }[];
}

export interface ArrangementDay {
  date: string;
  /** The date is today (the teachers who have not checked in yet are listed only then). */
  today: boolean;
  /** Today or a day to come: the arrangement can be made; a day that is over is only read. */
  editable: boolean;
  /** No school that day for everyone: a holiday, or a special day without classes. */
  holiday: string | null;
  /** `arrived` (2026-11-24): the teacher came after a substitute was put in; her card stays with the lessons that have one, `arrivedAt` is when ("09:35"). */
  away: { teacher: { id: string; name: string }; status: AwayStatus; arrivedAt: string | null; lessons: ArrangementLesson[]; attendance: ArrangementAttendance[] }[];
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

const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** Every day from `from` to `to`, both included. */
function daysFrom(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) days.push(d);
  return days;
}
const lessonKey = (classId: string, sectionId: string | null, period: number, teacherId: string) => `${unitKey(classId, sectionId)}:${period}:${teacherId}`;
const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
const STATUS_ORDER: Record<AwayStatus, number> = { absent: 0, leave: 1, not_in: 2, arrived: 3 };
/** Minutes after midnight in India. */
const indiaMinutes = (at: Date) => {
  const local = new Date(at.getTime() + (5 * 60 + 30) * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

/** Everything the day is made of, read once: what the page shows and what a change is checked against. */
export async function readDay(tenantId: string, date: string, yearId: Types.ObjectId) {
  const school = new Types.ObjectId(tenantId);
  const weekday = weekdayOf(date);
  const [world, marks, specials, holidays, subs, leaveEnds, headRows, loginRows] = await Promise.all([
    loadWorld(tenantId, yearId),
    TeacherAttendance.find({ tenantId: school, date: new Date(`${date}T00:00:00.000Z`) }).select("teacherId mark checkedInAt").lean(),
    SpecialDayService.between(tenantId, date, date),
    CalendarService.holidaysBetween(school, date, date),
    Substitution.find({ tenantId: school, date }).lean(),
    StaffLeaveService.endsOn(tenantId, "teacher", date),
    ClassTeacher.find({ tenantId: school, academicYearId: yearId }).select("classId sectionId teacherId").lean(),
    Teacher.find({ tenantId: school, isActive: true, userId: { $ne: null } }).select("_id").lean(),
  ]);
  // The classes each teacher is the class teacher of, and the teachers who can sign in (a cover must).
  const heads = new Map<string, { classId: string; sectionId: string | null; label: string }[]>();
  for (const h of headRows) {
    const classId = h.classId.toString();
    const sectionId = h.sectionId ? h.sectionId.toString() : null;
    const key = h.teacherId.toString();
    heads.set(key, [...(heads.get(key) ?? []), { classId, sectionId, label: labelOf(world, classId, sectionId) }]);
  }
  const logins = new Set(loginRows.map((t) => t._id.toString()));
  // The teachers on an approved leave that day, and the covers of the day and of the days after it that a leave still runs through.
  const leave = new Set(leaveEnds.keys());
  const farthest = [...leaveEnds.values()].reduce((a, b) => (b > a ? b : a), date);
  const covers = await AttendanceCover.find({ tenantId: school, date: { $gte: date, $lte: farthest } }).lean();
  const mark = new Map(marks.map((m) => [m.teacherId.toString(), m.mark]));
  // When each teacher who is present came in (minutes after midnight, India).
  const arrivedAt = new Map<string, number>();
  for (const m of marks) if (m.mark === "present" && m.checkedInAt) arrivedAt.set(m.teacherId.toString(), indiaMinutes(m.checkedInAt));
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
  return { world, weekday, mark, arrivedAt, holiday, lessons, subs, periodsFor, leave, leaveEnds, heads, covers, logins };
}

type Day = Awaited<ReturnType<typeof readDay>>;

/**
 * Who is away that day: marked Absent or Leave; on an approved leave (and not marked present: they came after all) when they come that weekday and have
 * lessons; today also the ones who come that weekday, have lessons and have not checked in yet.
 */
function awayTeachers(day: Day, isToday: boolean): { id: string; status: AwayStatus }[] {
  const found: { id: string; status: AwayStatus }[] = [];
  for (const t of day.world.teachers.values()) {
    if (!t.isActive) continue;
    const m = day.mark.get(t.id);
    const works = !day.holiday && !t.offDays.includes(day.weekday);
    // A class teacher has work that day even with no period of her own: her class's attendance.
    const lessons = works && (day.lessons.some((l) => l.teacherId === t.id) || day.heads.has(t.id));
    if (m === "absent" || m === "leave") found.push({ id: t.id, status: m });
    else if (m !== "present" && lessons && day.leave.has(t.id)) found.push({ id: t.id, status: "leave" });
    else if (!m && isToday && lessons) found.push({ id: t.id, status: "not_in" });
  }
  // A teacher who came after a substitute was put in for her stays on the page with those lessons (2026-11-24): the school sees who had the class, and can
  // let her take the rest of a period.
  const put = new Set(day.subs.map((s) => s.absentTeacherId.toString()));
  for (const t of day.world.teachers.values()) if (day.mark.get(t.id) === "present" && put.has(t.id) && !found.some((f) => f.id === t.id)) found.push({ id: t.id, status: "arrived" });
  return found;
}

/**
 * The teachers free for a lesson: everyone who comes that weekday, is not marked Absent or Leave and has nothing else at that time (`exceptSub`: this
 * lesson's own substitute). One who has not checked in yet is offered too (`in` false, after the ones who are in): they may only have forgotten.
 */
function freeFor(day: Day, lesson: DayLesson, exceptSub: string | null): FreeTeacher[] {
  const subSpans = day.subs
    .filter((s) => s._id.toString() !== exceptSub)
    .map((s) => {
      const span = day.periodsFor(s.classId.toString()).get(s.period);
      // The teacher who was away took the rest of the period back: the substitute was only there until then.
      return { teacherId: s.substituteTeacherId.toString(), span: span && s.handedBackAt != null ? { start: span.start, end: Math.max(span.start, Math.min(span.end, s.handedBackAt)) } : span };
    })
    .filter((s): s is { teacherId: string; span: { start: number; end: number } } => Boolean(s.span));
  const outside = day.world.outsideBusy.filter((b) => b.day === day.weekday);
  const found: FreeTeacher[] = [];
  for (const t of day.world.teachers.values()) {
    if (!t.isActive || t.id === lesson.teacherId || t.offDays.includes(day.weekday)) continue;
    const m = day.mark.get(t.id);
    if (m === "absent" || m === "leave") continue;
    // On an approved leave that day (unless they came after all).
    if (m !== "present" && day.leave.has(t.id)) continue;
    const own = day.lessons.filter((l) => l.teacherId === t.id);
    const covering = subSpans.filter((s) => s.teacherId === t.id);
    if (own.some((l) => overlaps(l, lesson)) || covering.some((s) => overlaps(s.span, lesson)) || outside.some((b) => b.teacherId === t.id && overlaps(b, lesson))) continue;
    const today = own.length + covering.length;
    found.push({ id: t.id, name: t.name, today, full: t.maxPerDay !== null && today >= t.maxPerDay, in: m === "present" });
  }
  return found.sort((a, b) => Number(a.full) - Number(b.full) || Number(b.in) - Number(a.in) || a.today - b.today || a.name.localeCompare(b.name));
}

/** Whether a teacher can be counted on that day: they come that weekday, are not marked Absent or Leave, and have no approved leave (unless they came after all). */
function available(day: Day, id: string): boolean {
  const t = day.world.teachers.get(id);
  if (!t || !t.isActive || t.offDays.includes(day.weekday)) return false;
  const m = day.mark.get(id);
  if (m === "absent" || m === "leave") return false;
  return !(m !== "present" && day.leave.has(id));
}

/**
 * The teachers who can take a class's student attendance that day: the ones who take a period of it (their own lesson there, or one they were put in
 * for), who are there that day and can sign in; the one with the earliest period first (the one who is with the class when the day begins).
 */
function coverOptions(day: Day, unit: { classId: string; sectionId: string | null }, absentId: string): { id: string; name: string; period: number }[] {
  const first = new Map<string, number>();
  const take = (teacherId: string | null, period: number) => {
    if (!teacherId || teacherId === absentId || !day.logins.has(teacherId) || !available(day, teacherId)) return;
    first.set(teacherId, Math.min(first.get(teacherId) ?? period, period));
  };
  for (const l of day.lessons) if (l.classId === unit.classId && l.sectionId === unit.sectionId) take(l.teacherId, l.period);
  for (const s of day.subs) if (s.classId.toString() === unit.classId && (s.sectionId ? s.sectionId.toString() : null) === unit.sectionId) take(s.substituteTeacherId.toString(), s.period);
  return [...first.entries()]
    .map(([id, period]) => ({ id, name: day.world.teachers.get(id)?.name ?? "A teacher", period }))
    .sort((a, b) => a.period - b.period || a.name.localeCompare(b.name));
}

function build(day: Day, date: string, isToday: boolean, editable: boolean): ArrangementDay {
  const away = awayTeachers(day, isToday);
  const nowMinutes = indiaNow().minutes;
  const subOf = new Map(day.subs.map((s) => [lessonKey(s.classId.toString(), s.sectionId ? s.sectionId.toString() : null, s.period, s.absentTeacherId.toString()), s]));
  const nameOf = (id: string) => day.world.teachers.get(id)?.name ?? "A teacher";
  return {
    date,
    today: isToday,
    editable,
    holiday: day.holiday,
    away: away
      .map(({ id, status }) => ({
        teacher: { id, name: nameOf(id) },
        status,
        arrivedAt: status === "arrived" && day.arrivedAt.has(id) ? minutesToClock(day.arrivedAt.get(id)!) : null,
        lessons: day.lessons
          .filter((l) => l.teacherId === id && (status !== "arrived" || subOf.has(lessonKey(l.classId, l.sectionId, l.period, id))))
          .map((l) => {
            const sub = subOf.get(lessonKey(l.classId, l.sectionId, l.period, id));
            const substituteId = sub ? sub.substituteTeacherId.toString() : null;
            // Who had the class, once the teacher has come: the substitute for the part before she took the rest back (or the whole period), then she.
            const handed = sub?.handedBackAt ?? null;
            const over = !isToday || nowMinutes >= l.end;
            const taken =
              status !== "arrived" || !substituteId
                ? []
                : handed !== null
                  ? [
                      { name: nameOf(substituteId), minutes: Math.max(0, handed - l.start) },
                      { name: nameOf(id), minutes: Math.max(0, l.end - handed) },
                    ]
                  : over
                    ? [{ name: nameOf(substituteId), minutes: l.end - l.start }]
                    : [];
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
              free: status === "arrived" ? [] : freeFor(day, l, sub ? sub._id.toString() : null),
              taken,
              canTakeBack: status === "arrived" && isToday && !!substituteId && handed === null && l.start <= nowMinutes && nowMinutes < l.end,
            };
          }),
        attendance: (status === "arrived" ? [] : (day.heads.get(id) ?? [])).map((u) => {
          const at = (d: string) => day.covers.find((c) => c.date === d && c.classId.toString() === u.classId && (c.sectionId ? c.sectionId.toString() : null) === u.sectionId);
          const coverId = at(date)?.coverTeacherId.toString() ?? null;
          const end = day.leaveEnds.get(id);
          // The same teacher's cover runs on day after day to the end of her leave.
          let until: string | null = null;
          if (coverId) for (let d = nextDay(date); d <= (end ?? date); d = nextDay(d)) {
            if (at(d)?.coverTeacherId.toString() !== coverId) break;
            until = d;
          }
          return {
            classId: u.classId,
            sectionId: u.sectionId,
            label: u.label,
            cover: coverId ? { id: coverId, name: nameOf(coverId), until } : null,
            leaveUntil: end && end > date ? end : null,
            options: coverOptions(day, u, id),
          };
        }),
      }))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.teacher.name.localeCompare(b.teacher.name)),
  };
}

export class ArrangementService {
  static async get(tenantId: string, date: string): Promise<ArrangementDay> {
    const today = indiaNow().date;
    const isToday = date === today;
    const yearId = await AcademicYearService.shownYearId(tenantId);
    if (!yearId) return { date, today: isToday, editable: date >= today, holiday: null, away: [] };
    return build(await readDay(tenantId, date, yearId), date, isToday, date >= today);
  }

  /**
   * Puts a free teacher in for an away teacher's lesson on a day (today or a day to come), or takes the one put in away (`substituteTeacherId` null).
   * Answers the day as it is now.
   */
  static async set(tenantId: string, actorId: string, input: ArrangementInput): Promise<ArrangementDay> {
    const today = indiaNow().date;
    if (input.date < today) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "Choose today or a day to come" }]);
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    const day = await readDay(tenantId, input.date, yearId);
    const shown = build(day, input.date, input.date === today, true);
    const entry = shown.away.find((a) => a.teacher.id === input.absentTeacherId);
    if (entry?.status === "arrived") throw ApiError.conflict(`${entry.teacher.name} has come: her lessons are not arranged any more.`, "ALREADY_ARRIVED");
    const lesson = entry?.lessons.find((l) => l.classId === input.classId && l.sectionId === input.sectionId && l.period === input.period);
    if (!lesson) throw ApiError.conflict("This teacher is not away for this lesson that day.", "NOT_AWAY");

    const school = new Types.ObjectId(tenantId);
    const where = { tenantId: school, date: input.date, classId: new Types.ObjectId(input.classId), sectionId: input.sectionId ? new Types.ObjectId(input.sectionId) : null, period: input.period, absentTeacherId: new Types.ObjectId(input.absentTeacherId) };
    const before = lesson.substitute?.id ?? null;
    const facts = { date: input.date, today: input.date === today, label: lesson.label, period: lesson.period, hours: `${lesson.start} to ${lesson.end}`, subjectName: lesson.subjectName, absentName: day.world.teachers.get(input.absentTeacherId)?.name ?? "the teacher" };

    if (input.substituteTeacherId === null) {
      await Substitution.deleteOne(where);
      if (before) Notify.substitute(tenantId, actorId, "removed", { ...facts, teacherId: before });
    } else {
      const chosen = input.substituteTeacherId;
      if (chosen !== before && !lesson.free.some((t) => t.id === chosen)) {
        throw ApiError.conflict(`${day.world.teachers.get(chosen)?.name ?? "This teacher"} is not free from ${lesson.start} to ${lesson.end} that day.`, "TEACHER_NOT_FREE");
      }
      await Substitution.findOneAndUpdate(where, { $set: { substituteTeacherId: new Types.ObjectId(chosen), subjectId: new Types.ObjectId(lesson.subjectId) }, $setOnInsert: { academicYearId: yearId } }, { upsert: true });
      if (chosen !== before) {
        Notify.substitute(tenantId, actorId, "added", { ...facts, teacherId: chosen });
        if (before) Notify.substitute(tenantId, actorId, "removed", { ...facts, teacherId: before });
      }
    }
    return ArrangementService.get(tenantId, input.date);
  }

  /**
   * Names the teacher who takes a class's student attendance from a day its class teacher is away (today or a day to come) to the last day of her approved leave
   * (that day only when she is away for one day), or takes the cover away from that day on (`coverTeacherId` null). The teacher must take a period of that class
   * on the day asked (the list on the page). Answers the day as it is now.
   */
  static async setAttendanceCover(tenantId: string, actorId: string, input: AttendanceCoverInput): Promise<ArrangementDay> {
    const today = indiaNow().date;
    if (input.date < today) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "Choose today or a day to come" }]);
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    const day = await readDay(tenantId, input.date, yearId);
    const shown = build(day, input.date, input.date === today, true);
    const row = shown.away.find((a) => a.teacher.id === input.absentTeacherId)?.attendance.find((a) => a.classId === input.classId && a.sectionId === input.sectionId);
    if (!row) throw ApiError.conflict("This teacher is not away that day, or is not the class teacher of this class.", "NOT_AWAY");

    const school = new Types.ObjectId(tenantId);
    // From the day asked to the last day of her leave: one record for each day, so the days before keep what they had.
    const end = day.leaveEnds.get(input.absentTeacherId);
    const till = end && end > input.date ? end : null;
    const dates = daysFrom(input.date, till ?? input.date);
    const where = { tenantId: school, classId: new Types.ObjectId(input.classId), sectionId: input.sectionId ? new Types.ObjectId(input.sectionId) : null };
    const before = row.cover?.id ?? null;
    const facts = { date: input.date, till, today: input.date === today, unit: { classId: input.classId, sectionId: input.sectionId, label: row.label }, absentName: day.world.teachers.get(input.absentTeacherId)?.name ?? "the class teacher" };

    if (input.coverTeacherId === null) {
      await AttendanceCover.deleteMany({ ...where, date: { $in: dates } });
      if (before) Notify.attendanceCover(tenantId, actorId, "removed", { ...facts, teacherId: before });
    } else {
      const chosen = input.coverTeacherId;
      if (chosen !== before && !row.options.some((o) => o.id === chosen)) {
        throw ApiError.conflict(`${day.world.teachers.get(chosen)?.name ?? "This teacher"} does not take a period of ${row.label} that day, or cannot sign in.`, "TEACHER_NOT_AVAILABLE");
      }
      await Promise.all(
        dates.map((date) =>
          AttendanceCover.updateOne({ ...where, date }, { $set: { coverTeacherId: new Types.ObjectId(chosen), absentTeacherId: new Types.ObjectId(input.absentTeacherId) }, $setOnInsert: { academicYearId: yearId } }, { upsert: true })
        )
      );
      if (chosen !== before) {
        Notify.attendanceCover(tenantId, actorId, "added", { ...facts, teacherId: chosen });
        if (before) Notify.attendanceCover(tenantId, actorId, "removed", { ...facts, teacherId: before });
      }
    }
    return ArrangementService.get(tenantId, input.date);
  }

  /**
   * A teacher who was away has come (she checked in, or the school marked her present; 2026-11-24, user: "teacher aate hi arrangement apne aap cancel ho aur
   * substitute ko bell jaye"). What was arranged for her **today** and has not begun is taken off (the substitute hears "X is back"); a period that is over stays
   * (the substitute took it); one going on now stays until the school lets her take the rest (`handBack`). The attendance of her class given to someone else is
   * taken off too, unless it was already taken. A correction of a day that is over changes nothing.
   */
  static async teacherArrived(tenantId: string, actorId: string, teacherId: string, date: string, arrivedMinutes: number): Promise<void> {
    const now = indiaNow();
    if (date !== now.date) return;
    const school = new Types.ObjectId(tenantId);
    const teacher = new Types.ObjectId(teacherId);
    const [subs, covers] = await Promise.all([
      Substitution.find({ tenantId: school, date, absentTeacherId: teacher }).lean(),
      AttendanceCover.find({ tenantId: school, date, absentTeacherId: teacher }).lean(),
    ]);
    if (subs.length === 0 && covers.length === 0) return;
    const day = await readDay(tenantId, date, (subs[0] ?? covers[0]).academicYearId);
    const absentName = day.world.teachers.get(teacherId)?.name ?? "The teacher";
    // Begun already (by the clock, or before she came in) is not taken off.
    const cutoff = Math.max(arrivedMinutes, now.minutes);
    for (const sub of subs) {
      const span = day.periodsFor(sub.classId.toString()).get(sub.period);
      if (!span || span.start < cutoff) continue;
      await Substitution.deleteOne({ _id: sub._id, tenantId: school });
      Notify.substitute(tenantId, actorId, "removed", {
        teacherId: sub.substituteTeacherId.toString(),
        date,
        today: true,
        label: labelOf(day.world, sub.classId.toString(), sub.sectionId ? sub.sectionId.toString() : null),
        period: sub.period,
        hours: `${minutesToClock(span.start)} to ${minutesToClock(span.end)}`,
        subjectName: day.world.subjects.get(sub.subjectId.toString())?.name ?? "A subject",
        absentName,
        back: true,
      });
    }
    for (const cover of covers) {
      const taken = await AttendanceDay.exists({ tenantId: school, classId: cover.classId, sectionId: cover.sectionId, date: fromDay(date), partial: { $ne: true } });
      if (taken) continue;
      await AttendanceCover.deleteOne({ _id: cover._id, tenantId: school });
      const classId = cover.classId.toString();
      const sectionId = cover.sectionId ? cover.sectionId.toString() : null;
      Notify.attendanceCover(tenantId, actorId, "removed", { teacherId: cover.coverTeacherId.toString(), date, till: null, today: true, unit: { classId, sectionId, label: labelOf(day.world, classId, sectionId) }, absentName, back: true });
    }
  }

  /**
   * The teacher who was away has come while a substitute is taking a period, and takes the rest of it (2026-11-24, user: "meena beech mein aa jaye to baaki time wo
   * class le, dev free ho; ye optional rahe"). From now the substitute is free, and the page shows how long each had the class. Only a period going on now.
   */
  static async handBack(tenantId: string, actorId: string, input: HandBackInput): Promise<ArrangementDay> {
    const now = indiaNow();
    if (input.date !== now.date) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "Only a period of today can be taken back" }]);
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    const day = await readDay(tenantId, input.date, yearId);
    const shown = build(day, input.date, true, true);
    const entry = shown.away.find((a) => a.teacher.id === input.absentTeacherId && a.status === "arrived");
    const lesson = entry?.lessons.find((l) => l.classId === input.classId && l.sectionId === input.sectionId && l.period === input.period);
    if (!entry || !lesson) throw ApiError.conflict("This teacher has not come, or no one was put in for this period.", "NOT_ARRIVED");
    if (!lesson.canTakeBack) throw ApiError.conflict("This period is over, not begun, or already handed back.", "NOT_IN_PROGRESS");

    const school = new Types.ObjectId(tenantId);
    const sub = day.subs.find((s) => s.classId.toString() === input.classId && (s.sectionId ? s.sectionId.toString() : null) === input.sectionId && s.period === input.period && s.absentTeacherId.toString() === input.absentTeacherId)!;
    const span = day.periodsFor(input.classId).get(input.period)!;
    // Atomic: two people pressing at once hand it back once.
    const done = await Substitution.updateOne({ _id: sub._id, tenantId: school, handedBackAt: null }, { $set: { handedBackAt: now.minutes } });
    if (done.modifiedCount === 1) {
      Notify.substituteHandedBack(tenantId, actorId, {
        teacherId: sub.substituteTeacherId.toString(),
        label: lesson.label,
        period: lesson.period,
        absentName: entry.teacher.name,
        tookMinutes: Math.max(0, now.minutes - span.start),
        ofMinutes: span.end - span.start,
      });
    }
    return ArrangementService.get(tenantId, input.date);
  }
}
