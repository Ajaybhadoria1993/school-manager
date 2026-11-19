/** The school's home page in one answer (GET /dashboard/school?from=&to=, 2026-11-09; the days asked and today's hours since 2026-11-10). */

export type AttentionKind = "teachers_absent" | "attendance_pending" | "leave_pending" | "no_class_teacher" | "full_sections";

export interface SchoolDashboard {
  /** Today in India, "2026-11-05". */
  date: string;
  /** The session the student numbers are about. */
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
  /** The last six months, oldest first, this month last: "2026-11". */
  admissions: { month: string; count: number }[];
  /** What is waiting for the head, most urgent first; only what has something in it. */
  attention: { kind: AttentionKind; count: number }[];
  upcoming: { title: string; kind: "holiday" | "event" | "exam"; startDate: string; endDate: string }[];
  /** The days the head picked (today when none), each figure with the same number of days just before it. */
  period: {
    from: string;
    to: string;
    previous: { from: string; to: string };
    students: { admitted: number; admittedBefore: number };
    /** Every child's mark of those days: late is there, leave and absent are not. `percent` is null when nothing was marked. */
    attendance: { present: number; late: number; absent: number; leave: number; percent: number | null; before: { absent: number; percent: number | null } };
    teachers: { present: number; late: number; absent: number; percent: number | null; before: { percent: number | null } };
    leaves: { asked: number; askedBefore: number };
    absentClasses: { classId: string; name: string; absent: number; marks: number }[];
  };
  /** Today's school hours ("08:30", "14:20"); none on a holiday or a day without school. */
  day: { working: boolean; holiday: string | null; start: string | null; end: string | null };
}

/** The children's attendance day by day for this week or this month (GET /dashboard/school/trend?period=). */
export interface SchoolTrend {
  period: "week" | "month";
  from: string;
  to: string;
  points: { date: string; percent: number | null }[];
  percent: number | null;
  before: number | null;
}
