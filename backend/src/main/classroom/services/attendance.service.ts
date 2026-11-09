import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { ParentService } from "../../parents/services/parent.service";
import { Enrolment } from "../../students/models/Enrolment";
import { Student } from "../../students/models/Student";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { fullName } from "../../students/services/shared";
import { resolveUnit } from "../../timetable/services/unit";
import { Notify } from "../../notifications/services/events";
import { User } from "../../users/models/User";
import { AttendanceDay, type AttendanceStatus } from "../models/AttendanceDay";
import { LeaveRequest } from "../models/LeaveRequest";
import type { AttendanceQuery, ChildAttendanceQuery, SaveAttendanceInput } from "../schemas/classroom.schemas";
import { classTeacherUnits, RUNNER_ROLES, sameUnit, teacherOfUser } from "./access";
import { CalendarService, fromDay, toDay } from "./calendar.service";
import { childrenOf } from "./children";
import type { Caller } from "./leave.service";

export interface AttendanceSheetDto {
  classId: string;
  sectionId: string | null;
  label: string;
  date: string;
  holiday: { title: string } | null;
  saved: boolean;
  markedBy: { name: string; role: string } | null;
  counts: Record<AttendanceStatus, number>;
  students: { id: string; name: string; admissionNumber: string; rollNumber: number | null; status: AttendanceStatus; reason: string | null }[];
}

export type AttendanceTally = Record<AttendanceStatus, number> & { days: number; percent: number | null };

const countOf = (statuses: AttendanceStatus[]): Record<AttendanceStatus, number> => ({
  present: statuses.filter((s) => s === "present").length,
  absent: statuses.filter((s) => s === "absent").length,
  late: statuses.filter((s) => s === "late").length,
  leave: statuses.filter((s) => s === "leave").length,
});
/** Late is there; leave and absent are not. */
const tally = (statuses: AttendanceStatus[]): AttendanceTally => {
  const c = countOf(statuses);
  return { ...c, days: statuses.length, percent: statuses.length === 0 ? null : Math.round(((c.present + c.late) / statuses.length) * 100) };
};

/** The class teacher of this class or section, or the people who run the school. */
async function assertTakes(tenantId: string, caller: Caller, unit: { classId: string; sectionId: string | null }) {
  if (RUNNER_ROLES.includes(caller.role)) return;
  const teacher = caller.role === "teacher" ? await teacherOfUser(tenantId, caller.userId) : null;
  const units = teacher ? await classTeacherUnits(tenantId, teacher._id) : [];
  if (!units.some((u) => sameUnit(u, unit))) throw ApiError.forbidden("Only the class teacher of this class or the school takes its attendance.", "NOT_CLASS_TEACHER");
}

/**
 * Attendance (docs/parent-teacher-flow.md, phase 3): a section's (or a class's without sections) day, taken by its class teacher or the
 * school. A day not saved yet shows every child Present, and a child on approved leave that day Leave. Not on a holiday, not ahead.
 */
export class AttendanceService {
  static async sheet(tenantId: string, caller: Caller, query: AttendanceQuery): Promise<AttendanceSheetDto> {
    const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
    await assertTakes(tenantId, caller, unit);
    const school = new Types.ObjectId(tenantId);
    const day = fromDay(query.date);
    const [children, holidays, saved] = await Promise.all([
      childrenOf(tenantId, unit),
      CalendarService.holidaysBetween(school, query.date, query.date),
      AttendanceDay.findOne({ tenantId: school, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null, date: day }).lean(),
    ]);
    const onLeave = new Set(
      (await LeaveRequest.find({ tenantId: school, studentId: { $in: children.map((c) => new Types.ObjectId(c.id)) }, status: "approved", fromDate: { $lte: day }, toDate: { $gte: day } }).select("studentId").lean()).map((l) =>
        l.studentId.toString()
      )
    );
    const marks = new Map((saved?.marks ?? []).map((m) => [m.studentId.toString(), m]));
    const students = children.map((c) => ({
      ...c,
      status: marks.get(c.id)?.status ?? (onLeave.has(c.id) ? ("leave" as const) : ("present" as const)),
      reason: marks.get(c.id)?.reason ?? null,
    }));
    return {
      classId: unit.classId,
      sectionId: unit.sectionId,
      label: unit.label,
      date: query.date,
      holiday: holidays[0] ? { title: holidays[0].title } : null,
      saved: !!saved,
      markedBy: saved ? { name: saved.markedBy.name, role: saved.markedBy.role } : null,
      counts: countOf(students.map((s) => s.status)),
      students,
    };
  }

  static async save(tenantId: string, caller: Caller, input: SaveAttendanceInput): Promise<AttendanceSheetDto> {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId ?? null);
    await assertTakes(tenantId, caller, unit);
    if (input.date > todayInIndia()) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "Attendance cannot be taken for a day still to come" }]);
    }
    const school = new Types.ObjectId(tenantId);
    const holiday = (await CalendarService.holidaysBetween(school, input.date, input.date))[0];
    if (holiday) throw ApiError.conflict(`${input.date} is a holiday (${holiday.title}): attendance is not taken.`, "HOLIDAY");
    const children = await childrenOf(tenantId, unit);
    const known = new Set(children.map((c) => c.id));
    if (input.marks.some((m) => !known.has(m.studentId))) throw ApiError.badRequest("A child in this list is not in this class.", "NOT_IN_CLASS");
    const given = new Map(input.marks.map((m) => [m.studentId, m]));
    const user = await User.findById(caller.userId).select("name").lean();
    const where = { tenantId: school, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null, date: fromDay(input.date) };
    // What the day said before, so a parent hears of a child marked absent or late once, not every time the day is saved again.
    const before = new Map(((await AttendanceDay.findOne(where).select("marks").lean())?.marks ?? []).map((m) => [m.studentId.toString(), m.status]));
    await AttendanceDay.findOneAndUpdate(
      where,
      {
        $set: {
          academicYearId: unit.yearId,
          // A reason belongs to an absence, a late coming or a leave; a child who came keeps none.
          marks: children.map((c) => {
            const mark = given.get(c.id);
            const status = mark?.status ?? "present";
            return { studentId: new Types.ObjectId(c.id), status, reason: status === "present" ? null : (mark?.reason ?? null) };
          }),
          markedBy: { name: user?.name ?? "The school", role: caller.role },
        },
      },
      { upsert: true, new: true }
    );
    const sheet = await AttendanceService.sheet(tenantId, caller, { classId: unit.classId, sectionId: unit.sectionId ?? "none", date: input.date });
    const marked = sheet.students.flatMap((c) => ((c.status === "absent" || c.status === "late") && before.get(c.id) !== c.status ? [{ id: c.id, name: c.name, status: c.status, reason: c.reason }] : []));
    Notify.attendanceSaved(tenantId, caller.userId, { unit, date: input.date, counts: sheet.counts, by: user?.name ?? "The school", marked });
    return sheet;
  }

  /** A child's days of a month (this month when none is asked) and the tally of the year, for their parent. */
  static async ofChild(tenantId: string, userId: string, studentId: string, query: ChildAttendanceQuery) {
    const { student } = await ParentService.childOf(tenantId, userId, studentId);
    const school = new Types.ObjectId(tenantId);
    const month = query.month ?? todayInIndia().slice(0, 7);
    const first = fromDay(`${month}-01`);
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const yearId = await AcademicYearService.activeYearId(school);
    const [monthDays, yearDays] = await Promise.all([
      AttendanceDay.find({ tenantId: school, "marks.studentId": student._id, date: { $gte: first, $lt: next } }).sort({ date: 1 }).lean(),
      yearId ? AttendanceDay.find({ tenantId: school, academicYearId: yearId, "marks.studentId": student._id }).select("marks").lean() : Promise.resolve([]),
    ]);
    const statusIn = (d: { marks: { studentId: Types.ObjectId; status: AttendanceStatus }[] }) => d.marks.find((m) => m.studentId.equals(student._id))?.status ?? "present";
    const days = monthDays.map((d) => ({ date: toDay(d.date), status: statusIn(d), reason: d.marks.find((m) => m.studentId.equals(student._id))?.reason ?? null }));
    return { month, days, monthTally: tally(days.map((d) => d.status)), year: tally(yearDays.map(statusIn)) };
  }
}
