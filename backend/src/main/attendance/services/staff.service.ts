import { Types } from "mongoose";
import { pushTo } from "../../../realtime/socket";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow } from "../../../utils/clock";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { RUNNER_ROLES } from "../../classroom/services/access";
import { STAFF_MEMBER_ROLES, staffRoleLabel } from "../../staff/constants";
import { StaffMember, type IStaffMember } from "../../staff/models/StaffMember";
import { User } from "../../users/models/User";
import { StaffAttendance, type IStaffAttendance } from "../models/StaffAttendance";
import type { MonthQuery, MyDayQuery, StaffSheetQuery } from "../schemas/attendance.schemas";
import { schoolDays } from "./schoolDays";
import { clockOf, dayDto, dayStatus, finds, rowFor, searchWords, type MyDayDto } from "./teacher.service";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const fromDay = (day: string) => new Date(`${day}T00:00:00.000Z`);
const monthLast = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Who is on the staff's sheet: the active staff members (they have a login) who do not teach (one who also teaches is on the teachers' sheet). */
const ON_THE_SHEET = { status: "active", teacherId: null } as const;

/** A staff member's department: their role ("Receptionist", "Peon / attendant", the name the school wrote for Other). */
const departmentOf = (s: Pick<IStaffMember, "role" | "roleOther">) => ({ key: s.role, label: staffRoleLabel(s.role, s.roleOther) });

/**
 * The staff's attendance (2026-11-22): the people who work for the school without teaching, kept the same way as the teachers'
 * (`TeacherAttendanceService`, whose rules for a day it uses): they mark themselves present in the app (the time is kept; Late after school
 * starts), one who has not by the time school ends is Absent, a holiday or a day school is shut is not an absence. The school ONLY reads the sheet
 * for any days, by department (the role) and with a search: it never marks a staff day (2026-11-22, "staff apne login se present karega, admin
 * nahi lagayenge, bas dekhega").
 */
export class StaffAttendanceService {
  private static async staffOf(tenantId: string, userId: string) {
    const staff = await StaffMember.findOne({ tenantId: asId(tenantId), userId: asId(userId), ...ON_THE_SHEET }).lean();
    if (!staff) throw ApiError.forbidden("This login is not a staff member's", "NOT_STAFF_MEMBER");
    return staff;
  }

  private static recordOf(tenantId: string, staffMemberId: Types.ObjectId, date: string) {
    return StaffAttendance.findOne({ tenantId: asId(tenantId), staffMemberId, date: fromDay(date) }).lean() as Promise<IStaffAttendance | null>;
  }

  /** The staff member's own day (today when none is asked) and whether they can mark themselves present now. */
  static async myDay(tenantId: string, userId: string, query: MyDayQuery): Promise<MyDayDto> {
    const staff = await StaffAttendanceService.staffOf(tenantId, userId);
    const now = indiaNow();
    const date = query.date ?? now.date;
    const [school] = await schoolDays(tenantId, date, date);
    const record = await StaffAttendanceService.recordOf(tenantId, staff._id, date);
    const status = dayStatus({ date, today: now.date, nowMinutes: now.minutes, school, teacher: staff, record });
    const isToday = date === now.date;
    // Only they mark their day (the school looks): today's words say why there is no button.
    const why =
      !isToday || record ? null : status === "holiday" ? `Holiday: ${school.holiday}` : status === "off" ? "Not a working day" : status === "absent" ? "School time is over" : null;
    return { ...dayDto(date, status, record), school: { start: clockOf(school.start), end: clockOf(school.end) }, canCheckIn: isToday && status === "pending", why };
  }

  /** The staff member marks themselves present now. A second mark is the first one (even the school's). */
  static async checkIn(tenantId: string, userId: string): Promise<MyDayDto & { alreadyMarked: boolean }> {
    const staff = await StaffAttendanceService.staffOf(tenantId, userId);
    const now = indiaNow();
    const [school] = await schoolDays(tenantId, now.date, now.date);
    if (await StaffAttendanceService.recordOf(tenantId, staff._id, now.date)) return { ...(await StaffAttendanceService.myDay(tenantId, userId, {})), alreadyMarked: true };

    if (school.holiday) throw ApiError.conflict(`Today is a holiday (${school.holiday}): there is no attendance.`, "NOT_A_WORKING_DAY");
    if (!school.working) throw ApiError.conflict("Today is not a working day: there is no attendance.", "NOT_A_WORKING_DAY");
    if (school.end !== null && now.minutes >= school.end) throw ApiError.conflict("School time is over for today: you are marked absent.", "SCHOOL_TIME_OVER");
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACADEMIC_YEAR");

    const user = await User.findById(userId).select("name role").lean();
    const by = { name: user?.name ?? staff.name, role: user?.role ?? "staff" };
    const late = school.start === null ? null : Math.max(0, now.minutes - school.start);
    const made = await StaffAttendance.findOneAndUpdate(
      { tenantId: asId(tenantId), staffMemberId: staff._id, date: fromDay(now.date) },
      { $setOnInsert: { academicYearId: yearId, mark: "present", source: "self", checkedInAt: now.at, lateByMinutes: late, log: [{ at: now.at, action: "checked_in", status: "present", by, note: null }] } },
      { upsert: true, new: true, includeResultMetadata: true }
    );
    // Two taps at the same moment: the one that did not make the mark is told it was already there.
    const alreadyMarked = made.lastErrorObject?.updatedExisting === true;
    if (!alreadyMarked) void StaffAttendanceService.tellTheSchool(tenantId, now.date, staff._id.toString(), userId);
    return { ...(await StaffAttendanceService.myDay(tenantId, userId, {})), alreadyMarked };
  }

  /** The people who run the school have the sheet open: it reads again (a quiet push, not a bell line). */
  private static async tellTheSchool(tenantId: string, date: string, staffMemberId: string, exceptUserId?: string): Promise<void> {
    try {
      const admins = await User.find({ tenantId: asId(tenantId), role: { $in: RUNNER_ROLES }, isActive: true }).select("_id").lean();
      for (const admin of admins) if (admin._id.toString() !== exceptUserId) pushTo(admin._id.toString(), "attendance:staff", { date, staffMemberId });
    } catch {
      // The mark is made; a missed push is only a sheet that reads again when it is opened.
    }
  }

  private static async recordsBetween(tenantId: string, from: string, to: string, staffIds?: Types.ObjectId[]) {
    const records = await StaffAttendance.find({ tenantId: asId(tenantId), ...(staffIds ? { staffMemberId: { $in: staffIds } } : {}), date: { $gte: fromDay(from), $lte: fromDay(to) } }).lean();
    return new Map(records.map((r) => [`${r.staffMemberId.toString()}:${dayOf(r.date)}`, r as IStaffAttendance]));
  }

  /**
   * Every staff member on the sheet (or, with a department, that department's), every day of the range (to today at most). A search keeps the
   * rows it finds (name, code, post or department); the counts are of the department asked for, never of the search. `departments` is every
   * department the school has, in the order of the roles, with how many each has (the filter's list).
   */
  static async sheet(tenantId: string, query: StaffSheetQuery) {
    const now = indiaNow();
    const to = query.to > now.date ? now.date : query.to;
    const days = query.from > to ? [] : await schoolDays(tenantId, query.from, to);
    const everyone = await StaffMember.find({ tenantId: asId(tenantId), ...ON_THE_SHEET }).lean();
    const departments = STAFF_MEMBER_ROLES.map((r) => ({ key: r.key, label: r.label, count: everyone.filter((s) => s.role === r.key).length })).filter((d) => d.count > 0);
    const staff = query.role ? everyone.filter((s) => s.role === query.role) : everyone;
    const byKey = days.length === 0 ? new Map<string, IStaffAttendance>() : await StaffAttendanceService.recordsBetween(tenantId, query.from, to);
    const rows = staff.sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ ...rowFor(s, days, byKey, now), department: departmentOf(s) }));
    const word = searchWords(query.search);
    const sum = (key: "present" | "late" | "absent" | "leave") => rows.reduce((n, r) => n + r.tally[key], 0);
    return {
      from: query.from,
      to,
      days: days.map((d) => ({ date: d.date, weekday: d.weekday, working: d.working, holiday: d.holiday, start: clockOf(d.start), end: clockOf(d.end) })),
      departments,
      staff: word ? rows.filter((r) => finds(word, r) || r.department.label.toLowerCase().includes(word)) : rows,
      summary: { staff: rows.length, present: sum("present"), late: sum("late"), absent: sum("absent"), leave: sum("leave") },
    };
  }

  /** A staff member's own month (this month when none is asked), up to today. */
  static async myMonth(tenantId: string, userId: string, query: MonthQuery) {
    const staff = await StaffAttendanceService.staffOf(tenantId, userId);
    const now = indiaNow();
    const month = query.month ?? now.date.slice(0, 7);
    const from = `${month}-01`;
    const last = monthLast(month);
    const to = last > now.date ? now.date : last;
    const days = from > to ? [] : await schoolDays(tenantId, from, to);
    const byKey = days.length === 0 ? new Map<string, IStaffAttendance>() : await StaffAttendanceService.recordsBetween(tenantId, from, to, [staff._id]);
    return { month, from, to, row: { ...rowFor(staff, days, byKey, now), department: departmentOf(staff) } };
  }
}
