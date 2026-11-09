import type { AttendanceStatus, AttendanceTally } from "./classroom";

/** Attendance for the people who run the school (2026-11-06): the students of any class and the teachers, for any days; a teacher's own mark. */

/** A range of days, "2026-11-01" to "2026-11-30". */
export interface DateRange {
  from: string;
  to: string;
}

// ---- Students ----------------------------------------------------------------------------------------------------------------------------
export interface StudentRangeDay {
  date: string;
  /** Monday is 1, Sunday is 7. */
  weekday: number;
  holiday: string | null;
  /** Attendance was taken for the class (a section of it) on this day. */
  taken: boolean;
}

export interface StudentRangeRecord {
  date: string;
  status: AttendanceStatus;
  reason: string | null;
}

export interface StudentRangeRow {
  id: string;
  name: string;
  admissionNumber: string;
  rollNumber: number | null;
  /** The section the child is in ("A"); null for a class that is not split. */
  section: string | null;
  /** Only the days attendance was taken. */
  records: StudentRangeRecord[];
  tally: AttendanceTally;
}

export interface StudentRange {
  label: string;
  from: string;
  /** Today at most: nothing after today is asked for. */
  to: string;
  days: StudentRangeDay[];
  students: StudentRangeRow[];
  summary: { students: number; present: number; absent: number; late: number; leave: number; percent: number | null };
}

// ---- Teachers ----------------------------------------------------------------------------------------------------------------------------
/**
 * What a teacher's day is: `present` / `late` (they marked themselves, `late` after school started), `absent` (not marked by the time
 * school ended), `leave` (the school put the day on leave: not counted against them), `off` (a day the school does not run, or their own off day), `holiday`, `no_login` (a working day of a teacher the school
 * has given no login: they cannot mark, so it is not counted), `pending` (today, school still on, not marked),
 * `upcoming`, `before` (they had not joined).
 */
export type TeacherDayStatus = "present" | "late" | "absent" | "leave" | "off" | "holiday" | "no_login" | "pending" | "upcoming" | "before";

export interface LogLine {
  /** "08:42", Indian time. */
  time: string;
  at: string;
  /** The teacher marked themselves, or the school marked or corrected the day. */
  action: "checked_in" | "marked_by_school";
  /** What the line set the day to. */
  status?: "present" | "absent" | "leave";
  by: { name: string; role: string };
  note: string | null;
}

export interface TeacherRecord {
  date: string;
  status: TeacherDayStatus;
  /** "08:42", Indian time; null when they did not mark. */
  checkedInTime: string | null;
  /** Minutes after school started (0: in time); null when they did not mark, or the school's start is not known. */
  lateByMinutes: number | null;
  /** The school's latest note on the day, and who made the mark (the teacher, or the school). */
  note?: string | null;
  source?: "self" | "school" | null;
  log: LogLine[];
}

export interface TeacherTally {
  present: number;
  late: number;
  absent: number;
  /** Days on leave: not counted. */
  leave: number;
  days: number;
  percent: number | null;
}

export interface TeacherSheetRow {
  id: string;
  name: string;
  employeeCode: string | null;
  designation: string | null;
  records: TeacherRecord[];
  tally: TeacherTally;
}

export interface SheetDay {
  date: string;
  weekday: number;
  /** The school runs this weekday. */
  working: boolean;
  holiday: string | null;
  /** "08:30" / "14:20": the school's hours that day; null when no timing is set. */
  start: string | null;
  end: string | null;
}

export interface TeacherSheet {
  from: string;
  to: string;
  days: SheetDay[];
  teachers: TeacherSheetRow[];
  summary: { teachers: number; present: number; late: number; absent: number };
}

/** A teacher's own day: what it is, and whether they can mark themselves present now (and why not, when they cannot). */
export interface MyDay extends TeacherRecord {
  school: { start: string | null; end: string | null };
  canCheckIn: boolean;
  why: string | null;
  /** On the answer to a mark: the day had already been marked. */
  alreadyMarked?: boolean;
}

/** A teacher's own month: every day up to today and the counts, in the shape of one row of the school's sheet. */
export interface TeacherMonth {
  month: string;
  from: string;
  to: string;
  row: TeacherSheetRow;
}

/** What the school sets for a teacher's day. */
export interface TeacherDayInput {
  teacherId: string;
  date: string;
  status: "present" | "absent" | "leave";
  /** "08:20": the time they came (Present only; left out = now, or the start of school for a day gone by). */
  time?: string;
  note?: string;
}

/** The classes (or sections) that have not taken today's attendance. */
export interface StudentsToday {
  date: string;
  working: boolean;
  holiday: string | null;
  pending: { classId: string; sectionId: string | null; label: string }[];
}
