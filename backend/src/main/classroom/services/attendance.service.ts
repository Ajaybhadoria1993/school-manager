import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { isDuplicateKey } from "../../academics/services/shared";
import { ParentService } from "../../parents/services/parent.service";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Teacher } from "../../staff/models/Teacher";
import { Enrolment } from "../../students/models/Enrolment";
import { Student } from "../../students/models/Student";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { fullName } from "../../students/services/shared";
import { resolveUnit } from "../../timetable/services/unit";
import { Notify } from "../../notifications/services/events";
import { User } from "../../users/models/User";
import { AttendanceDay, type AttendanceStatus } from "../models/AttendanceDay";
import { LeaveRequest } from "../models/LeaveRequest";
import { StudentAttendanceService } from "../../attendance/services/student.service";
import type { StudentsQuery } from "../../attendance/schemas/attendance.schemas";
import type { AttendanceQuery, ChildAttendanceQuery, MarkStudentInput, SaveAttendanceInput } from "../schemas/classroom.schemas";
import { classTeacherUnits, sameUnit, teacherOfUser, worksOnAllClasses } from "./access";
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
  /** The class teacher of this class or section this year (2026-11-23: the school's page says whose class it is); null when nobody is. */
  classTeacher: { id: string; name: string } | null;
  /** The class's own numbers: of EVERY child of the class or section, whatever a search left in `students`. */
  counts: Record<AttendanceStatus, number>;
  /** How many children the class or section has (a search narrows `students`, never this). */
  total: number;
  /** `position` is the child's place in the whole class (1 is the first), the number a child with no roll number is shown under. */
  students: { id: string; name: string; admissionNumber: string; rollNumber: number | null; position: number; status: AttendanceStatus; reason: string | null }[];
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

/** Whether this caller is the class teacher of the class or section (a teacher who left, or one who teaches only a subject there, is not). */
async function isClassTeacherOf(tenantId: string, caller: Caller, unit: { classId: string; sectionId: string | null }) {
  const teacher = caller.role === "teacher" ? await teacherOfUser(tenantId, caller.userId) : null;
  const units = teacher ? await classTeacherUnits(tenantId, teacher._id) : [];
  return units.some((u) => sameUnit(u, unit));
}

/** Who may LOOK at a class's attendance: its class teacher, and the people who run the school (and any staff the school allowed to see it). */
async function assertSees(tenantId: string, caller: Caller, unit: { classId: string; sectionId: string | null }) {
  if (worksOnAllClasses(caller.role)) return;
  if (!(await isClassTeacherOf(tenantId, caller, unit))) throw ApiError.forbidden("Only the class teacher of this class or the school sees its attendance.", "NOT_CLASS_TEACHER");
}

/**
 * Who TAKES a class's attendance (2026-11-17): only its class teacher. The school (admin, principal, any staff) looks and never marks, whatever
 * permission it was given; a teacher who teaches only a subject there does not mark either.
 */
async function assertMarks(tenantId: string, caller: Caller, unit: { classId: string; sectionId: string | null }) {
  if (!(await isClassTeacherOf(tenantId, caller, unit))) throw ApiError.forbidden("Only the class teacher of this class takes its attendance.", "NOT_CLASS_TEACHER");
}

/**
 * Attendance (docs/parent-teacher-flow.md, phase 3): a section's (or a class's without sections) day, taken by its class teacher ONLY (the
 * school looks). A day not saved yet shows every child Present, and a child on approved leave that day Leave. Not on a holiday, not ahead.
 */
export class AttendanceService {
  static async sheet(tenantId: string, caller: Caller, query: AttendanceQuery): Promise<AttendanceSheetDto> {
    const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
    await assertSees(tenantId, caller, unit);
    const school = new Types.ObjectId(tenantId);
    const day = fromDay(query.date);
    const [children, holidays, saved, post] = await Promise.all([
      childrenOf(tenantId, unit),
      CalendarService.holidaysBetween(school, query.date, query.date),
      AttendanceDay.findOne({ tenantId: school, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null, date: day }).lean(),
      ClassTeacher.findOne({ tenantId: school, academicYearId: unit.yearId, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null }).select("teacherId").lean(),
    ]);
    const head = post ? await Teacher.findOne({ _id: post.teacherId, tenantId: school }).select("name").lean() : null;
    const onLeave = new Set(
      (await LeaveRequest.find({ tenantId: school, studentId: { $in: children.map((c) => new Types.ObjectId(c.id)) }, status: "approved", fromDate: { $lte: day }, toDate: { $gte: day } }).select("studentId").lean()).map((l) =>
        l.studentId.toString()
      )
    );
    const marks = new Map((saved?.marks ?? []).map((m) => [m.studentId.toString(), m]));
    const students = children.map((c, index) => ({
      ...c,
      position: index + 1,
      status: marks.get(c.id)?.status ?? (onLeave.has(c.id) ? ("leave" as const) : ("present" as const)),
      reason: marks.get(c.id)?.reason ?? null,
    }));
    // The school's search box (2026-11-22): the words are plain text (no pattern), found in the name, the admission number or the roll number.
    const word = (query.search ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const shown = word
      ? students.filter((s) => s.name.toLowerCase().includes(word) || s.admissionNumber.toLowerCase().includes(word) || (s.rollNumber !== null && String(s.rollNumber).includes(word)))
      : students;
    return {
      classId: unit.classId,
      sectionId: unit.sectionId,
      label: unit.label,
      date: query.date,
      holiday: holidays[0] ? { title: holidays[0].title } : null,
      // A day the school only partly marked (one child at a time) is not a day that was saved: the sheet opens unsaved, with those marks in it.
      saved: !!saved && !saved.partial,
      markedBy: saved ? { name: saved.markedBy.name, role: saved.markedBy.role } : null,
      classTeacher: head ? { id: head._id.toString(), name: head.name } : null,
      // The class's numbers, not the search's: the ring and the counts of the page do not shrink to the children shown.
      counts: countOf(students.map((s) => s.status)),
      total: students.length,
      students: shown,
    };
  }

  /**
   * The register of one class or section for the days asked (the same sheet the school reads in Attendance > Student), for its class teacher
   * (their class page) or the school. One class or section at a time: never "all".
   */
  static async register(tenantId: string, caller: Caller, query: StudentsQuery) {
    if (query.sectionId === "all") throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "sectionId", message: "Choose one section, or none for a class without sections" }]);
    const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
    await assertSees(tenantId, caller, unit);
    return StudentAttendanceService.range(tenantId, query);
  }

  static async save(tenantId: string, caller: Caller, input: SaveAttendanceInput): Promise<AttendanceSheetDto> {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId ?? null);
    await assertMarks(tenantId, caller, unit);
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
          // The whole sheet was saved: the day was taken, whatever made it before.
          partial: false,
        },
      },
      { upsert: true, new: true }
    );
    const sheet = await AttendanceService.sheet(tenantId, caller, { classId: unit.classId, sectionId: unit.sectionId ?? "none", date: input.date });
    const marked = sheet.students.flatMap((c) => ((c.status === "absent" || c.status === "late") && before.get(c.id) !== c.status ? [{ id: c.id, name: c.name, status: c.status, reason: c.reason }] : []));
    Notify.attendanceSaved(tenantId, caller.userId, { unit, date: input.date, counts: sheet.counts, by: user?.name ?? "The school", marked });
    return sheet;
  }

  /**
   * The CLASS TEACHER marks ONE child on ONE day, Present or Absent (2026-11-17): a cell of the register in their class page. Only that child's
   * mark is written, the rest of the class is left as it was (no mark is not Present here). A day made this way is `partial` until every
   * child has a mark (or the sheet is saved), so it does not count as taken for the "not taken today" list. The child's parent hears of an
   * absence once, like on a saved sheet; the staff are not told (the one who marked it is staff).
   */
  static async markStudent(tenantId: string, caller: Caller, input: MarkStudentInput): Promise<{ studentId: string; date: string; status: "present" | "absent" }> {
    const school = new Types.ObjectId(tenantId);
    const studentId = new Types.ObjectId(input.studentId);
    // The child's seat this year; a child who is not seated (left, or not of this school) is not found.
    const yearId = await AcademicYearService.activeYearId(tenantId);
    const seat = yearId ? await Enrolment.findOne({ tenantId: school, studentId, academicYearId: yearId, status: "active" }).select("classId sectionId").lean() : null;
    if (!seat) throw ApiError.notFound("That child is not in one of your classes.", "STUDENT_NOT_FOUND");
    const unit = await resolveUnit(tenantId, seat.classId.toString(), seat.sectionId ? seat.sectionId.toString() : null);
    await assertMarks(tenantId, caller, unit);
    if (input.date > todayInIndia()) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "Attendance cannot be taken for a day still to come" }]);
    }
    const holiday = (await CalendarService.holidaysBetween(school, input.date, input.date))[0];
    if (holiday) throw ApiError.conflict(`${input.date} is a holiday (${holiday.title}): attendance is not taken.`, "HOLIDAY");

    const user = await User.findById(caller.userId).select("name").lean();
    const markedBy = { name: user?.name ?? "The school", role: caller.role };
    const where = { tenantId: school, classId: seat.classId, sectionId: seat.sectionId ?? null, date: fromDay(input.date) };
    const was = (await AttendanceDay.findOne(where).select("marks").lean())?.marks.find((m) => m.studentId.equals(studentId))?.status ?? null;

    // Change the child's mark if the day has one; else add it (making the day, partly marked, if there is none). Two requests at the same
    // moment for the same day: the unique index lets one make the day, the other goes round again and changes or adds.
    const change = () => AttendanceDay.updateOne({ ...where, "marks.studentId": studentId }, { $set: { "marks.$.status": input.status, "marks.$.reason": null, markedBy } });
    const add = () =>
      AttendanceDay.updateOne(
        { ...where, "marks.studentId": { $ne: studentId } },
        { $push: { marks: { studentId, status: input.status, reason: null } }, $set: { markedBy }, $setOnInsert: { academicYearId: unit.yearId, partial: true } },
        { upsert: true }
      );
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((await change()).matchedCount > 0) break;
      try {
        await add();
        break;
      } catch (err) {
        if (!isDuplicateKey(err) || attempt === 2) throw err;
      }
    }

    // Every child marked: the day is whole now.
    const day = await AttendanceDay.findOne(where).select("marks partial").lean();
    if (day?.partial) {
      const marked = new Set(day.marks.map((m) => m.studentId.toString()));
      if ((await childrenOf(tenantId, unit)).every((c) => marked.has(c.id))) await AttendanceDay.updateOne({ ...where, partial: true }, { $set: { partial: false } });
    }

    if (input.status === "absent" && was !== "absent") {
      const child = await Student.findOne({ tenantId: school, _id: studentId }).select("firstName lastName").lean();
      if (child) Notify.studentMarkedAbsent(tenantId, caller.userId, { unit, date: input.date, child: { id: input.studentId, name: fullName(child) } });
    }
    return { studentId: input.studentId, date: input.date, status: input.status };
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
