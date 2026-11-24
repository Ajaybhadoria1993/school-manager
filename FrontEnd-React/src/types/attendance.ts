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

/** The school marks one child on one day (a cell of the register): there or not there. */
export interface MarkStudentInput {
  studentId: string;
  date: string;
  status: "present" | "absent";
}

/** A column of the register: a day the server sent, or (`coming`) a day of the week asked for that has not come yet. */
export interface RegisterDay extends StudentRangeDay {
  coming?: boolean;
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
  /** A staff member's department (their role: "Receptionist", "Peon / attendant"); a teacher's row has none. */
  department?: { key: string; label: string };
}

/** What the teachers' sheet is asked (2026-11-22): the days; a class (its teachers only); the words of the search. */
export interface TeacherSheetQuery extends DateRange {
  classId?: string;
  search?: string;
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

// ---- Staff (2026-11-22): kept like the teachers' ------------------------------------------------------------------------------------------

/** What the staff's sheet is asked: the days; a department (a role key, "receptionist"); the words of the search. */
export interface StaffSheetQuery extends DateRange {
  role?: string;
  search?: string;
}

/** Every staff member who does not teach (or one department's), each day of the range; `departments` is the filter's list, the counts are of the department asked for. */
export interface StaffSheet {
  from: string;
  to: string;
  days: SheetDay[];
  departments: { key: string; label: string; count: number }[];
  staff: TeacherSheetRow[];
  summary: { staff: number; present: number; late: number; absent: number; leave: number };
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

// ---- The day of every class (2026-11-22, Attendance > Student) --------------------------------------------------------------------------

/** What `GET /attendance/students/day` is asked: the day; a class (and a section of it, or "none") to see only it; the words of the search. */
export interface StudentsDayQuery {
  date: string;
  classId?: string;
  sectionId?: string;
  search?: string;
}

export interface StudentsDayLine {
  id: string;
  name: string;
  admissionNumber: string;
  rollNumber: number | null;
  /** The child's place in the whole class (1 is the first): the number shown for a child with no roll number. */
  position: number;
  status: AttendanceStatus;
  reason: string | null;
}

/** One class (or section) of the day: its children (only the ones a search found), and its own numbers (always the whole class). */
export interface StudentsDayGroup {
  classId: string;
  sectionId: string | null;
  /** "Class 5", "Class 5A" (two or more sections). */
  label: string;
  classTeacher: { id: string; name: string } | null;
  /** The class teacher saved the day: otherwise nothing is a mark yet (the page says Not taken). */
  saved: boolean;
  total: number;
  counts: Record<AttendanceStatus, number>;
  students: StudentsDayLine[];
}

export interface StudentsDay {
  date: string;
  holiday: { title: string } | null;
  /** In teaching order; a class with nobody a search found is left out. */
  groups: StudentsDayGroup[];
  /** Of every class asked for (a search never narrows it); the counts are of the classes that were taken. */
  summary: { students: number; classes: number; taken: number; counts: Record<AttendanceStatus, number> };
}

// ---- The leave of the teachers and the staff (2026-11-24) ---------------------------------------------------------------------------------
// A person applies from their own login for today or days to come; the school (admin, principal) answers. Approved days are "Leave" in the
// attendance, and a teacher's lessons on them can be arranged ahead (Leave & arrangements).

export type StaffLeaveKind = "teacher" | "staff";

/** One application: who, their role ("Teacher", "Receptionist"), the days, the reason and where it stands. */
export interface StaffLeave {
  id: string;
  kind: StaffLeaveKind;
  personId: string;
  name: string;
  roleLabel: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  /** The school's note with the answer. */
  note: string | null;
  decidedBy: { name: string; role: string } | null;
  decidedAt: string | null;
  createdAt: string;
  /** The person can take it back (their own list): waiting, or approved and not begun. */
  canCancel: boolean;
}

/** The school's list: the applications and how many are waiting in all (the count on the tab). */
export interface StaffLeaveList {
  items: StaffLeave[];
  waiting: number;
}

export type StaffLeaveWho = "all" | "teacher" | "staff";

export interface StaffLeaveQuery {
  status: "pending" | "all";
  who: StaffLeaveWho;
}

export interface StaffLeaveInput {
  fromDate: string;
  toDate?: string | null;
  reason: string;
}

export interface StaffLeaveDecision {
  id: string;
  status: "approved" | "declined";
  note?: string | null;
}
