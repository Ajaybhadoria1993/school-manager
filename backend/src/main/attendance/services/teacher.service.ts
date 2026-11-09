import { Types } from "mongoose";
import { pushTo } from "../../../realtime/socket";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow, instantAt } from "../../../utils/clock";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { RUNNER_ROLES } from "../../classroom/services/access";
import { Notify } from "../../notifications/services/events";
import { Teacher } from "../../staff/models/Teacher";
import { clockToMinutes, minutesToClock } from "../../timetable/time";
import { User } from "../../users/models/User";
import type { TeacherDayStatus } from "../constants";
import { TeacherAttendance, type ITeacherAttendance } from "../models/TeacherAttendance";
import type { MonthQuery, MyDayQuery, RangeQuery, SetTeacherDayInput } from "../schemas/attendance.schemas";
import { schoolDays, type SchoolDay } from "./schoolDays";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const fromDay = (day: string) => new Date(`${day}T00:00:00.000Z`);
/** The Indian calendar day a moment falls on. */
const indianDay = (at: Date) => new Date(at.getTime() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);
const indiaMinutes = (at: Date) => {
  const local = new Date(at.getTime() + (5 * 60 + 30) * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};
const clockOf = (minutes: number | null) => (minutes === null ? null : minutesToClock(minutes));

/** One line of a day's history: when, what, who. */
export interface LogLineDto {
  time: string;
  at: string;
  action: "checked_in" | "marked_by_school";
  /** What the line set the day to. */
  status: "present" | "absent" | "leave";
  by: { name: string; role: string };
  note: string | null;
}

export interface TeacherRecordDto {
  date: string;
  status: TeacherDayStatus;
  checkedInTime: string | null;
  lateByMinutes: number | null;
  /** The school's latest note on the day, and who made the mark (null when there is no mark). */
  note: string | null;
  source: "self" | "school" | null;
  log: LogLineDto[];
}

export interface MyDayDto extends TeacherRecordDto {
  school: { start: string | null; end: string | null };
  /** The teacher may mark themselves present now. */
  canCheckIn: boolean;
  /** Why not, in words ("Holiday: Diwali"), when they cannot and it is today. */
  why: string | null;
}

export interface TeacherTally {
  present: number;
  late: number;
  absent: number;
  /** Days on approved leave: not counted against the teacher, nor for them. */
  leave: number;
  /** The days that count: the ones the teacher came, or was absent. */
  days: number;
  percent: number | null;
}

type TeacherLike = { _id: Types.ObjectId; offDays?: number[]; joiningDate?: Date | null; createdAt: Date; userId?: Types.ObjectId | null };

/** The first day that counts for a teacher: the day they joined, or when they were added when the school did not say. */
const startOf = (t: TeacherLike) => (t.joiningDate ? dayOf(t.joiningDate) : indianDay(t.createdAt));

const logOf = (record: ITeacherAttendance): LogLineDto[] =>
  record.log.map((l) => ({ time: minutesToClock(indiaMinutes(l.at)), at: l.at.toISOString(), action: l.action, status: l.status ?? "present", by: { name: l.by.name, role: l.by.role }, note: l.note ?? null }));

/**
 * What a teacher's day is: a mark wins (Present, Late when it was after school started, Absent or Leave as the school put it); otherwise a
 * day before they joined does not count, a holiday and a day off are not absences, nor is a working day of a teacher with no login (they
 * cannot mark), a day that has passed is Absent, and today is Absent once school has ended (Not yet until then).
 */
export function dayStatus(args: { date: string; today: string; nowMinutes: number; school: SchoolDay; teacher: TeacherLike; record?: Pick<ITeacherAttendance, "lateByMinutes" | "mark"> | null }): TeacherDayStatus {
  const { date, today, nowMinutes, school, teacher, record } = args;
  if (record) return record.mark === "absent" ? "absent" : record.mark === "leave" ? "leave" : (record.lateByMinutes ?? 0) > 0 ? "late" : "present";
  if (date < startOf(teacher)) return "before";
  if (school.holiday) return "holiday";
  if (!school.working || (teacher.offDays ?? []).includes(school.weekday)) return "off";
  if (!teacher.userId) return "no_login";
  if (date < today) return "absent";
  if (date === today) return school.end !== null && nowMinutes >= school.end ? "absent" : "pending";
  return "upcoming";
}

const tallyOf = (statuses: TeacherDayStatus[]): TeacherTally => {
  const count = (s: TeacherDayStatus) => statuses.filter((x) => x === s).length;
  const present = count("present");
  const late = count("late");
  const absent = count("absent");
  const days = present + late + absent;
  return { present, late, absent, leave: count("leave"), days, percent: days === 0 ? null : Math.round(((present + late) / days) * 100) };
};

function dayDto(date: string, status: TeacherDayStatus, record: ITeacherAttendance | null): TeacherRecordDto {
  return {
    date,
    status,
    checkedInTime: record && record.checkedInAt ? minutesToClock(indiaMinutes(record.checkedInAt)) : null,
    lateByMinutes: record ? record.lateByMinutes : null,
    note: record ? (record.note ?? null) : null,
    source: record ? record.source : null,
    log: record ? logOf(record) : [],
  };
}

/** One teacher's row of a sheet: every day of the range, and the counts. */
function rowFor(teacher: TeacherLike & { _id: Types.ObjectId; name: string; employeeCode?: string | null; designation?: string | null }, days: SchoolDay[], byKey: Map<string, ITeacherAttendance>, now: { date: string; minutes: number }) {
  const records = days.map((school) => {
    const record = byKey.get(`${teacher._id.toString()}:${school.date}`) ?? null;
    return dayDto(school.date, dayStatus({ date: school.date, today: now.date, nowMinutes: now.minutes, school, teacher, record }), record);
  });
  return { id: teacher._id.toString(), name: teacher.name, employeeCode: teacher.employeeCode ?? null, designation: teacher.designation ?? null, records, tally: tallyOf(records.map((r) => r.status)) };
}

const monthLast = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Teachers' own attendance (2026-11-06): mark myself present, my day and month, the school's sheet of every teacher, and the school's own marks. */
export class TeacherAttendanceService {
  private static async teacherOf(tenantId: string, userId: string) {
    const teacher = await Teacher.findOne({ tenantId: asId(tenantId), userId: asId(userId), isActive: true }).lean();
    if (!teacher) throw ApiError.forbidden("This login is not a teacher's", "FORBIDDEN");
    return teacher;
  }

  private static recordOf(tenantId: string, teacherId: Types.ObjectId, date: string) {
    return TeacherAttendance.findOne({ tenantId: asId(tenantId), teacherId, date: fromDay(date) }).lean() as Promise<ITeacherAttendance | null>;
  }

  /** The teacher's own day (today when none is asked) and whether they can mark themselves present now. */
  static async myDay(tenantId: string, userId: string, query: MyDayQuery): Promise<MyDayDto> {
    const teacher = await TeacherAttendanceService.teacherOf(tenantId, userId);
    const now = indiaNow();
    const date = query.date ?? now.date;
    const [school] = await schoolDays(tenantId, date, date);
    const record = await TeacherAttendanceService.recordOf(tenantId, teacher._id, date);
    const status = dayStatus({ date, today: now.date, nowMinutes: now.minutes, school, teacher, record });
    const isToday = date === now.date;
    const marked = record ? (record.note ? `: ${record.note}` : "") : "";
    const why =
      record && record.source === "school" && record.mark === "leave"
        ? `On leave${marked}`
        : record && record.source === "school" && record.mark === "absent"
          ? `Marked absent by the school${marked}`
          : !isToday || record
            ? null
            : status === "holiday"
              ? `Holiday: ${school.holiday}`
              : status === "off"
                ? "Not a working day"
                : status === "absent"
                  ? "School time is over"
                  : null;
    return { ...dayDto(date, status, record), school: { start: clockOf(school.start), end: clockOf(school.end) }, canCheckIn: isToday && status === "pending", why };
  }

  /** The teacher marks themselves present now. A second mark is the first one (even the school's: they ask the school to change it). */
  static async checkIn(tenantId: string, userId: string): Promise<MyDayDto & { alreadyMarked: boolean }> {
    const teacher = await TeacherAttendanceService.teacherOf(tenantId, userId);
    const now = indiaNow();
    const [school] = await schoolDays(tenantId, now.date, now.date);
    const existing = await TeacherAttendanceService.recordOf(tenantId, teacher._id, now.date);
    if (existing) return { ...(await TeacherAttendanceService.myDay(tenantId, userId, {})), alreadyMarked: true };

    if (school.holiday) throw ApiError.conflict(`Today is a holiday (${school.holiday}): there is no attendance.`, "NOT_A_WORKING_DAY");
    if (!school.working || (teacher.offDays ?? []).includes(school.weekday)) throw ApiError.conflict("Today is not a working day for you: there is no attendance.", "NOT_A_WORKING_DAY");
    if (school.end !== null && now.minutes >= school.end) throw ApiError.conflict("School time is over for today: you are marked absent.", "SCHOOL_TIME_OVER");
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACADEMIC_YEAR");

    const user = await User.findById(userId).select("name").lean();
    const by = { name: user?.name ?? teacher.name, role: "teacher" };
    const late = school.start === null ? null : Math.max(0, now.minutes - school.start);
    const made = await TeacherAttendance.findOneAndUpdate(
      { tenantId: asId(tenantId), teacherId: teacher._id, date: fromDay(now.date) },
      { $setOnInsert: { academicYearId: yearId, mark: "present", source: "self", checkedInAt: now.at, lateByMinutes: late, log: [{ at: now.at, action: "checked_in", status: "present", by, note: null }] } },
      { upsert: true, new: true, includeResultMetadata: true }
    );
    // Two taps at the same moment: the one that did not make the mark is told it was already there.
    const alreadyMarked = made.lastErrorObject?.updatedExisting === true;
    if (!alreadyMarked) void TeacherAttendanceService.tellTheSchool(tenantId, now.date, teacher._id.toString(), userId);
    return { ...(await TeacherAttendanceService.myDay(tenantId, userId, {})), alreadyMarked };
  }

  /** The school marks or corrects a teacher's day: Present (with the time), Absent or Leave, with a note; the teacher is told. */
  static async setDay(tenantId: string, actor: { userId: string; role: string }, teacherId: string, input: SetTeacherDayInput): Promise<TeacherRecordDto> {
    const teacher = await Teacher.findOne({ _id: teacherId, tenantId: asId(tenantId) }).lean();
    if (!teacher) throw ApiError.notFound("Teacher not found", "TEACHER_NOT_FOUND");
    if (!teacher.isActive) throw ApiError.conflict("This teacher has left: their attendance is not marked.", "TEACHER_INACTIVE");
    const now = indiaNow();
    if (input.date > now.date) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "Attendance cannot be marked for a day still to come" }]);
    const [school] = await schoolDays(tenantId, input.date, input.date);
    // A teacher who came on a holiday can be marked Present; Absent and Leave need a day they were asked to come.
    if (input.status !== "present" && (school.holiday || !school.working || (teacher.offDays ?? []).includes(school.weekday))) {
      throw ApiError.conflict(school.holiday ? `${input.date} is a holiday (${school.holiday}): a teacher cannot be absent or on leave.` : `${input.date} is not a working day for this teacher.`, "NOT_A_WORKING_DAY");
    }
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACADEMIC_YEAR");

    let checkedInAt: Date | null = null;
    let late: number | null = null;
    if (input.status === "present") {
      const minutes = input.time ? clockToMinutes(input.time)! : input.date === now.date ? now.minutes : (school.start ?? 9 * 60);
      checkedInAt = input.time || input.date !== now.date ? instantAt(input.date, minutes) : now.at;
      late = school.start === null ? null : Math.max(0, minutes - school.start);
    }
    const user = await User.findById(actor.userId).select("name").lean();
    const by = { name: user?.name ?? "The school", role: actor.role };
    const note = input.note ?? null;
    const saved = await TeacherAttendance.findOneAndUpdate(
      { tenantId: asId(tenantId), teacherId: teacher._id, date: fromDay(input.date) },
      {
        $set: { academicYearId: yearId, mark: input.status, checkedInAt, lateByMinutes: late, source: "school", note },
        $push: { log: { at: now.at, action: "marked_by_school", status: input.status, by, note } },
      },
      { upsert: true, new: true }
    ).lean();
    const dto = dayDto(input.date, dayStatus({ date: input.date, today: now.date, nowMinutes: now.minutes, school, teacher, record: saved }), saved as ITeacherAttendance);
    Notify.teacherAttendanceChanged(tenantId, actor.userId, { teacherId: teacher._id.toString(), date: input.date, status: input.status, note, by: by.name });
    void TeacherAttendanceService.tellTheSchool(tenantId, input.date, teacher._id.toString(), actor.userId);
    return dto;
  }

  /** The people who run the school have the sheet open: it reads again (a quiet push, not a bell line: fifty teachers a day would flood it). */
  private static async tellTheSchool(tenantId: string, date: string, teacherId: string, exceptUserId?: string): Promise<void> {
    try {
      const admins = await User.find({ tenantId: asId(tenantId), role: { $in: RUNNER_ROLES }, isActive: true }).select("_id").lean();
      for (const admin of admins) if (admin._id.toString() !== exceptUserId) pushTo(admin._id.toString(), "attendance:teacher", { date, teacherId });
    } catch {
      // The mark is made; a missed push is only a sheet that reads again when it is opened.
    }
  }

  private static async recordsBetween(tenantId: string, from: string, to: string, teacherIds?: Types.ObjectId[]) {
    const records = await TeacherAttendance.find({ tenantId: asId(tenantId), ...(teacherIds ? { teacherId: { $in: teacherIds } } : {}), date: { $gte: fromDay(from), $lte: fromDay(to) } }).lean();
    return new Map(records.map((r) => [`${r.teacherId.toString()}:${dayOf(r.date)}`, r as ITeacherAttendance]));
  }

  /** Every active teacher, every day of the range (to today at most), with who came and when. */
  static async sheet(tenantId: string, query: RangeQuery) {
    const now = indiaNow();
    const to = query.to > now.date ? now.date : query.to;
    const days = query.from > to ? [] : await schoolDays(tenantId, query.from, to);
    const teachers = await Teacher.find({ tenantId: asId(tenantId), isActive: true }).lean();
    const byKey = days.length === 0 ? new Map<string, ITeacherAttendance>() : await TeacherAttendanceService.recordsBetween(tenantId, query.from, to);
    const rows = teachers.sort((a, b) => a.name.localeCompare(b.name)).map((t) => rowFor(t, days, byKey, now));
    return {
      from: query.from,
      to,
      days: days.map((d) => ({ date: d.date, weekday: d.weekday, working: d.working, holiday: d.holiday, start: clockOf(d.start), end: clockOf(d.end) })),
      teachers: rows,
      summary: {
        teachers: rows.length,
        present: rows.reduce((n, r) => n + r.tally.present, 0),
        late: rows.reduce((n, r) => n + r.tally.late, 0),
        absent: rows.reduce((n, r) => n + r.tally.absent, 0),
      },
    };
  }

  /** A teacher's own month (this month when none is asked), up to today. */
  static async myMonth(tenantId: string, userId: string, query: MonthQuery) {
    const teacher = await TeacherAttendanceService.teacherOf(tenantId, userId);
    const now = indiaNow();
    const month = query.month ?? now.date.slice(0, 7);
    const from = `${month}-01`;
    const last = monthLast(month);
    const to = last > now.date ? now.date : last;
    const days = from > to ? [] : await schoolDays(tenantId, from, to);
    const byKey = days.length === 0 ? new Map<string, ITeacherAttendance>() : await TeacherAttendanceService.recordsBetween(tenantId, from, to, [teacher._id]);
    return { month, from, to, row: rowFor(teacher, days, byKey, now) };
  }
}
