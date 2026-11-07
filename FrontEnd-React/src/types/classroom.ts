/** The daily flow of parents and teachers (docs/parent-teacher-flow.md). */

export type CalendarKind = "holiday" | "event";

/**
 * Who put it on the calendar: the school itself, or the standard list every calendar starts with (Diwali, Republic Day...): a
 * `national` day stays, a `festival` the school may take off and bring back.
 */
export type CalendarSource = "school" | "national" | "festival";

/** A holiday or an event on the school's calendar; `endDate` is the last day (the same as `startDate` for one day). A standard holiday's `id` is its key ("2026-11-08-diwali"). */
export interface CalendarEvent {
  id: string;
  title: string;
  kind: CalendarKind;
  startDate: string;
  endDate: string;
  note: string | null;
  source: CalendarSource;
}

/** What a read of the calendar gives: what is on it, and the standard festivals the school took off in those days. */
export interface CalendarDays {
  items: CalendarEvent[];
  hidden: CalendarEvent[];
}

export interface CalendarEventInput {
  title: string;
  kind: CalendarKind;
  startDate: string;
  endDate?: string | null;
  note?: string | null;
}

export type LeaveStatus = "pending" | "approved" | "declined" | "cancelled";

/** A parent's leave application for their child, as the parent and the school see it. */
export interface Leave {
  id: string;
  student: { id: string; name: string; admissionNumber: string };
  /** The child's class when it was sent ("Class 5 - A"). */
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  /** "Ravi Verma (Father)". */
  appliedBy: string;
  status: LeaveStatus;
  /** The answer's note to the parent. */
  note: string | null;
  decidedBy: { name: string; role: string } | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface LeaveInput {
  fromDate: string;
  toDate?: string | null;
  reason: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "leave";

/** One of a teacher's own classes (their home): class teacher of it, and/or the subjects they teach in it. */
export interface MyClass {
  classId: string;
  sectionId: string | null;
  label: string;
  isClassTeacher: boolean;
  subjects: { id: string; name: string }[];
}

/** A class's (or section's) day of attendance, as the class teacher takes it. */
export interface AttendanceSheet {
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

/** A child's attendance for their parent: the days of a month, that month's tally and the year's. */
export interface ChildAttendance {
  month: string;
  days: { date: string; status: AttendanceStatus; reason?: string | null }[];
  monthTally: AttendanceTally;
  year: AttendanceTally;
}

/** A class's diary of a day: every subject of the class, the ones the teacher may write, and what was written. */
export interface DiaryDay {
  classId: string;
  sectionId: string | null;
  label: string;
  date: string;
  subjects: { subjectId: string; subjectName: string; canWrite: boolean; entry: { taught: string; homework: string; writtenBy: { name: string; role: string } } | null }[];
}

/** A test of a class: its subject, day, topic and marks out of; how many marks are entered and their average percentage. */
export interface ClassTestItem {
  id: string;
  subjectId: string;
  subjectName: string;
  date: string;
  topic: string;
  maxMarks: number;
  marked: number;
  average: number | null;
  canWrite: boolean;
}

export interface ClassTestDetail extends ClassTestItem {
  label: string;
  students: { id: string; name: string; admissionNumber: string; rollNumber: number | null; marks: number | null; absent: boolean }[];
}

export interface ChildDiary {
  date: string;
  entries: { subjectName: string; taught: string; homework: string; writtenBy: string }[];
}

export interface ChildTests {
  upcoming: { id: string; subjectName: string; date: string; topic: string; maxMarks: number }[];
  results: { id: string; subjectName: string; date: string; topic: string; maxMarks: number; marks: number | null; absent: boolean; percent: number | null }[];
  average: number | null;
}
