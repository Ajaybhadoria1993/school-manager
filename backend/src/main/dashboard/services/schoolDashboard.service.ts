import { Types } from "mongoose";
import { indiaNow } from "../../../utils/clock";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { seatedIn } from "../../academics/services/viewedYear";
import { AttendanceDay } from "../../classroom/models/AttendanceDay";
import { LeaveRequest } from "../../classroom/models/LeaveRequest";
import { CalendarService } from "../../classroom/services/calendar.service";
import { eachDay, schoolDays } from "../../attendance/services/schoolDays";
import { StudentAttendanceService } from "../../attendance/services/student.service";
import { TeacherAttendanceService } from "../../attendance/services/teacher.service";
import { Exam } from "../../exams/models/Exam";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { StaffMember } from "../../staff/models/StaffMember";
import { Teacher } from "../../staff/models/Teacher";
import { CapacityService } from "../../students/services/capacity.service";
import { Enrolment } from "../../students/models/Enrolment";
import { Student } from "../../students/models/Student";
import { activeUnits } from "../../timetable/services/unit";
import { ABSENT_CLASSES, ADMISSION_MONTHS, UPCOMING_DAYS, UPCOMING_LINES } from "../constants";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const fromDay = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export type AttentionKind = "teachers_absent" | "attendance_pending" | "leave_pending" | "no_class_teacher" | "full_sections";

export interface SchoolDashboardDto {
  /** Today, in India. */
  date: string;
  /** The session the student numbers are about (the running one, or a past one the school is looking at). */
  academicYear: { id: string; name: string } | null;
  /** How many classes the school has made (with or without students). */
  classes: number;
  students: {
    total: number;
    /** Only the classes that have students, in teaching order. */
    byClass: { classId: string; name: string; enrolled: number }[];
    gender: { male: number; female: number; other: number };
  };
  people: { teachers: number; staff: number };
  attendance: {
    working: boolean;
    holiday: string | null;
    students: { present: number; late: number; absent: number; leave: number; percent: number | null; classesTaken: number; classesTotal: number };
    teachers: { total: number; present: number; late: number; absent: number };
  };
  /** The last months, oldest first, this month last. */
  admissions: { month: string; count: number }[];
  /** What is waiting for the head, most urgent first; only what has something in it. */
  attention: { kind: AttentionKind; count: number }[];
  upcoming: { title: string; kind: "holiday" | "event" | "exam"; startDate: string; endDate: string }[];
  /** The days the head picked (today when none), each figure with the same number of days just before it (`before`). */
  period: {
    from: string;
    to: string;
    previous: { from: string; to: string };
    students: { admitted: number; admittedBefore: number };
    /** Every child's mark of those days; late is there, leave and absent are not. */
    attendance: { present: number; late: number; absent: number; leave: number; percent: number | null; before: { absent: number; percent: number | null } };
    /** Teacher-days of the days school ran, up to today (a teacher who has not marked is absent once school ends). */
    teachers: { present: number; late: number; absent: number; percent: number | null; before: { percent: number | null } };
    /** The children's leave requests that fall on those days (not declined or cancelled). */
    leaves: { asked: number; askedBefore: number };
    /** The classes with the most absences of those days, most first; only those that had any. */
    absentClasses: { classId: string; name: string; absent: number; marks: number }[];
  };
  /** Today's school hours, for the line under the figures: "08:30" to "14:20", or none on a day without school. */
  day: { working: boolean; holiday: string | null; start: string | null; end: string | null };
}

/** The children's attendance day by day (the chart), and the share of the whole week or month with the one before. */
export interface SchoolTrendDto {
  period: "week" | "month";
  from: string;
  to: string;
  points: { date: string; percent: number | null }[];
  percent: number | null;
  before: number | null;
}

/** The marks of some days, by status, and by class. */
interface Marks {
  present: number;
  late: number;
  absent: number;
  leave: number;
  byClass: Map<string, { absent: number; marks: number }>;
}

/** The share that came, out of every mark: late is there, leave and absent are not; nothing marked is no share (not 0%). */
const share = (m: { present: number; late: number; absent: number; leave: number }) => {
  const marked = m.present + m.late + m.absent + m.leave;
  return marked === 0 ? null : Math.round(((m.present + m.late) / marked) * 100);
};
/** Minutes after midnight as "08:30". */
const clockOf = (minutes: number | null) => (minutes === null ? null : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
const DAY_MS = 24 * 60 * 60 * 1000;
const spanOf = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

const unitKey = (classId: Types.ObjectId | string, sectionId: Types.ObjectId | string | null) => `${classId.toString()}:${sectionId ? sectionId.toString() : "-"}`;

/** "2026-06" .. "2026-11": the last `count` months ending with the month `today` is in. */
function lastMonths(today: string, count: number): string[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return at.toISOString().slice(0, 7);
  });
}

const plusDays = (day: string, days: number) => dayOf(new Date(fromDay(day).getTime() + days * 24 * 60 * 60 * 1000));

/**
 * The school's home page in one answer (2026-11-09). Every figure is what is in the school now: nothing is estimated and nothing is
 * invented; a thing that has not happened yet (attendance not taken, no students) is zero or null, never a made-up number.
 */
export class SchoolDashboardService {
  static async summary(tenantId: string, asked?: { from: string; to: string }): Promise<SchoolDashboardDto> {
    const school = asId(tenantId);
    const now = indiaNow();
    const months = lastMonths(now.date, ADMISSION_MONTHS);
    const from = asked?.from ?? now.date;
    const to = asked?.to ?? now.date;
    const span = spanOf(from, to);
    const previous = { from: plusDays(from, -span), to: plusDays(from, -1) };

    const [capacity, classes, today, marksToday, teachers, staff, sheet, leavesWaiting, withoutClassTeacher, admitted, upcoming] = await Promise.all([
      CapacityService.summary(tenantId),
      SchoolClass.find({ tenantId: school }).sort({ order: 1, _id: 1 }).select("name").lean(),
      StudentAttendanceService.today(tenantId),
      AttendanceDay.find({ tenantId: school, date: fromDay(now.date) }).select("marks.status").lean(),
      Teacher.countDocuments({ tenantId: school, isActive: true }),
      // Staff who also teach are counted as teachers (they have a Teacher record once they have a login).
      StaffMember.countDocuments({ tenantId: school, status: { $ne: "inactive" }, teacherId: null }),
      TeacherAttendanceService.sheet(tenantId, { from: now.date, to: now.date }),
      LeaveRequest.countDocuments({ tenantId: school, status: "pending" }),
      SchoolDashboardService.classesWithoutClassTeacher(tenantId),
      Student.aggregate<{ _id: string; n: number }>([
        { $match: { tenantId: school, admissionDate: { $gte: fromDay(`${months[0]}-01`), $lt: fromDay(`${plusMonth(months[months.length - 1])}-01`) } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$admissionDate" } }, n: { $sum: 1 } } },
      ]),
      SchoolDashboardService.upcoming(tenantId, now.date),
    ]);
    const [marksNow, marksBefore, teachersNow, teachersBefore, admittedNow, admittedBefore, leavesNow, leavesBefore, [todaySchool]] = await Promise.all([
      SchoolDashboardService.marksBetween(school, from, to),
      SchoolDashboardService.marksBetween(school, previous.from, previous.to),
      TeacherAttendanceService.sheet(tenantId, { from, to }),
      TeacherAttendanceService.sheet(tenantId, previous),
      Student.countDocuments({ tenantId: school, admissionDate: { $gte: fromDay(from), $lte: fromDay(to) } }),
      Student.countDocuments({ tenantId: school, admissionDate: { $gte: fromDay(previous.from), $lte: fromDay(previous.to) } }),
      SchoolDashboardService.leavesOn(school, from, to),
      SchoolDashboardService.leavesOn(school, previous.from, previous.to),
      schoolDays(tenantId, now.date, now.date),
    ]);

    const gender = await SchoolDashboardService.genderOf(school, capacity.academicYear?.id ?? null);

    const count = (status: string) => marksToday.reduce((n, day) => n + day.marks.filter((m) => m.status === status).length, 0);
    const present = count("present");
    const late = count("late");
    const absent = count("absent");
    const leave = count("leave");
    const marked = present + late + absent + leave;
    const names = new Map(classes.map((c) => [c._id.toString(), c.name]));
    const enrolled = new Map(capacity.classes.map((c) => [c.classId, c.enrolled]));
    const byMonth = new Map(admitted.map((a) => [a._id, a.n]));

    const attention = (
      [
        ["teachers_absent", sheet.summary.absent],
        ["attendance_pending", today.pending.length],
        ["leave_pending", leavesWaiting],
        ["no_class_teacher", withoutClassTeacher],
        ["full_sections", capacity.totals.fullSections],
      ] as [AttentionKind, number][]
    )
      .filter(([, n]) => n > 0)
      .map(([kind, n]) => ({ kind, count: n }));

    return {
      date: now.date,
      academicYear: capacity.academicYear,
      classes: classes.length,
      students: {
        total: capacity.totals.students,
        byClass: classes.filter((c) => (enrolled.get(c._id.toString()) ?? 0) > 0).map((c) => ({ classId: c._id.toString(), name: names.get(c._id.toString()) ?? c.name, enrolled: enrolled.get(c._id.toString()) ?? 0 })),
        gender,
      },
      people: { teachers, staff },
      attendance: {
        working: today.working,
        holiday: today.holiday,
        students: {
          present,
          late,
          absent,
          leave,
          // Late counts as there; leave and absent do not (the same rule as the class pages).
          percent: marked === 0 ? null : Math.round(((present + late) / marked) * 100),
          classesTaken: marksToday.length,
          classesTotal: marksToday.length + today.pending.length,
        },
        teachers: { total: sheet.summary.teachers, present: sheet.summary.present, late: sheet.summary.late, absent: sheet.summary.absent },
      },
      admissions: months.map((month) => ({ month, count: byMonth.get(month) ?? 0 })),
      attention,
      upcoming,
      period: {
        from,
        to,
        previous,
        students: { admitted: admittedNow, admittedBefore },
        attendance: {
          present: marksNow.present,
          late: marksNow.late,
          absent: marksNow.absent,
          leave: marksNow.leave,
          percent: share(marksNow),
          before: { absent: marksBefore.absent, percent: share(marksBefore) },
        },
        teachers: { ...teacherTally(teachersNow.summary), before: { percent: teacherTally(teachersBefore.summary).percent } },
        leaves: { asked: leavesNow, askedBefore: leavesBefore },
        absentClasses: [...marksNow.byClass]
          .filter(([, c]) => c.absent > 0)
          .map(([classId, c]) => ({ classId, name: names.get(classId) ?? "A class", absent: c.absent, marks: c.marks }))
          .sort((a, b) => b.absent - a.absent || b.absent / b.marks - a.absent / a.marks || a.name.localeCompare(b.name))
          .slice(0, ABSENT_CLASSES),
      },
      day: {
        working: !!todaySchool && todaySchool.working && !todaySchool.holiday,
        holiday: todaySchool?.holiday ?? null,
        start: todaySchool && todaySchool.working && !todaySchool.holiday ? clockOf(todaySchool.start) : null,
        end: todaySchool && todaySchool.working && !todaySchool.holiday ? clockOf(todaySchool.end) : null,
      },
    };
  }

  /**
   * The children's attendance day by day for this week (Monday to Sunday) or this month, for the chart: a day with marks has its share,
   * a day without any (no school, not taken, not come yet) has none. With the share of the whole period and of the one before.
   */
  static async trend(tenantId: string, period: "week" | "month"): Promise<SchoolTrendDto> {
    const school = asId(tenantId);
    const now = indiaNow();
    const range = period === "week" ? weekOf(now.date) : monthOf(now.date);
    const before = period === "week" ? weekOf(plusDays(range.from, -1)) : monthOf(plusDays(range.from, -1));
    const [rows, previous] = await Promise.all([
      AttendanceDay.aggregate<{ _id: { date: Date; status: string }; n: number }>([
        { $match: { tenantId: school, date: { $gte: fromDay(range.from), $lte: fromDay(range.to) } } },
        { $unwind: "$marks" },
        { $group: { _id: { date: "$date", status: "$marks.status" }, n: { $sum: 1 } } },
      ]),
      SchoolDashboardService.marksBetween(school, before.from, before.to),
    ]);
    const byDay = new Map<string, { present: number; late: number; absent: number; leave: number }>();
    const whole = { present: 0, late: 0, absent: 0, leave: 0 };
    for (const row of rows) {
      const day = dayOf(row._id.date);
      const tally = byDay.get(day) ?? { present: 0, late: 0, absent: 0, leave: 0 };
      const status = row._id.status as keyof typeof whole;
      if (status in tally) {
        tally[status] += row.n;
        whole[status] += row.n;
      }
      byDay.set(day, tally);
    }
    return {
      period,
      from: range.from,
      to: range.to,
      points: eachDay(range.from, range.to).map((date) => ({ date, percent: date > now.date ? null : share(byDay.get(date) ?? { present: 0, late: 0, absent: 0, leave: 0 }) })),
      percent: share(whole),
      before: share(previous),
    };
  }

  /** Every child's mark of some days, by status and by class. */
  private static async marksBetween(school: Types.ObjectId, from: string, to: string): Promise<Marks> {
    const rows = await AttendanceDay.aggregate<{ _id: { classId: Types.ObjectId; status: string }; n: number }>([
      { $match: { tenantId: school, date: { $gte: fromDay(from), $lte: fromDay(to) } } },
      { $unwind: "$marks" },
      { $group: { _id: { classId: "$classId", status: "$marks.status" }, n: { $sum: 1 } } },
    ]);
    const marks: Marks = { present: 0, late: 0, absent: 0, leave: 0, byClass: new Map() };
    for (const row of rows) {
      const status = row._id.status as "present" | "late" | "absent" | "leave";
      if (!(status in marks)) continue;
      marks[status] += row.n;
      const key = row._id.classId.toString();
      const c = marks.byClass.get(key) ?? { absent: 0, marks: 0 };
      c.marks += row.n;
      if (status === "absent") c.absent += row.n;
      marks.byClass.set(key, c);
    }
    return marks;
  }

  /** The children's leave requests that fall on some days (from day to last day touching them), not declined or cancelled. */
  private static leavesOn(school: Types.ObjectId, from: string, to: string): Promise<number> {
    return LeaveRequest.countDocuments({ tenantId: school, status: { $in: ["pending", "approved"] }, fromDate: { $lte: fromDay(to) }, toDate: { $gte: fromDay(from) } });
  }

  /** Boys, girls and others among the students who sit in the school this year. */
  private static async genderOf(school: Types.ObjectId, yearId: string | null) {
    const none = { male: 0, female: 0, other: 0 };
    if (!yearId) return none;
    const year = asId(yearId);
    const seats = await Enrolment.find({ tenantId: school, academicYearId: year, ...seatedIn(year) }).select("studentId").lean();
    if (seats.length === 0) return none;
    const rows = await Student.aggregate<{ _id: string; n: number }>([
      { $match: { tenantId: school, _id: { $in: seats.map((s) => s.studentId) } } },
      { $group: { _id: "$gender", n: { $sum: 1 } } },
    ]);
    const by = new Map(rows.map((r) => [r._id, r.n]));
    return { male: by.get("Male") ?? 0, female: by.get("Female") ?? 0, other: by.get("Other") ?? 0 };
  }

  /** The classes (or sections) of the running year that have children and no class teacher. */
  private static async classesWithoutClassTeacher(tenantId: string): Promise<number> {
    const units = await activeUnits(tenantId);
    if (units.length === 0) return 0;
    const school = asId(tenantId);
    const year = units[0].yearId;
    const [seated, posts] = await Promise.all([
      Enrolment.aggregate<{ _id: { classId: Types.ObjectId; sectionId: Types.ObjectId | null } }>([
        { $match: { tenantId: school, academicYearId: year, status: "active" } },
        { $group: { _id: { classId: "$classId", sectionId: "$sectionId" } } },
      ]),
      ClassTeacher.find({ tenantId: school, academicYearId: year }).select("classId sectionId").lean(),
    ]);
    const hasChildren = new Set(seated.map((s) => unitKey(s._id.classId, s._id.sectionId)));
    const hasTeacher = new Set(posts.map((p) => unitKey(p.classId, p.sectionId)));
    return units.filter((u) => hasChildren.has(unitKey(u.classId, u.sectionId)) && !hasTeacher.has(unitKey(u.classId, u.sectionId))).length;
  }

  /** The school's own days, standard holidays it keeps and exams, from today on, soonest first. */
  private static async upcoming(tenantId: string, today: string): Promise<SchoolDashboardDto["upcoming"]> {
    const to = plusDays(today, UPCOMING_DAYS);
    const [calendar, exams] = await Promise.all([
      CalendarService.list(tenantId, { from: today, to }),
      Exam.find({ tenantId: asId(tenantId), startDate: { $lte: fromDay(to) }, endDate: { $gte: fromDay(today) } }).select("name startDate endDate").lean(),
    ]);
    const lines: SchoolDashboardDto["upcoming"] = [
      ...calendar.items.map((e) => ({ title: e.title, kind: e.kind, startDate: e.startDate, endDate: e.endDate })),
      ...exams.map((e) => ({ title: e.name, kind: "exam" as const, startDate: dayOf(e.startDate), endDate: dayOf(e.endDate) })),
    ];
    return lines.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title)).slice(0, UPCOMING_LINES);
  }
}

/** The teachers' days at school of a sheet's summary, and the share of the days that counted (present and late of all three). */
function teacherTally(summary: { present: number; late: number; absent: number }) {
  const counted = summary.present + summary.late + summary.absent;
  return { present: summary.present, late: summary.late, absent: summary.absent, percent: counted === 0 ? null : Math.round(((summary.present + summary.late) / counted) * 100) };
}

/** The week (Monday to Sunday) a day is in. */
function weekOf(day: string): { from: string; to: string } {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
  const from = plusDays(day, 1 - weekday);
  return { from, to: plusDays(from, 6) };
}

/** The month a day is in, first day to last. */
function monthOf(day: string): { from: string; to: string } {
  const month = day.slice(0, 7);
  return { from: `${month}-01`, to: plusDays(`${plusMonth(month)}-01`, -1) };
}

/** The month after "2026-11": "2026-12". */
function plusMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 7);
}
