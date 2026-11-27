import type { DateRange } from "./attendance";
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
  /** Its class teacher is away today and the school gave this teacher the class's attendance for today (2026-11-24); missing from an older server. */
  coversToday?: boolean;
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
  /** The class teacher of the class or section this year (2026-11-23); null when nobody is, missing from an older server. */
  classTeacher?: { id: string; name: string } | null;
  /** The class's own counts: of every child, whatever a search left in `students`. */
  counts: Record<AttendanceStatus, number>;
  /** How many children the class or section has (a search narrows `students`, never this); missing from an older server. */
  total?: number;
  /** `position`: the child's place in the whole class (1 is the first); missing from an older server. */
  students: { id: string; name: string; admissionNumber: string; rollNumber: number | null; position?: number; status: AttendanceStatus; reason: string | null }[];
}

export type AttendanceTally = Record<AttendanceStatus, number> & { days: number; percent: number | null };

/** A child's attendance for their parent: the days of a month, that month's tally and the year's. */
export interface ChildAttendance {
  month: string;
  days: { date: string; status: AttendanceStatus; reason?: string | null }[];
  monthTally: AttendanceTally;
  year: AttendanceTally;
}

/** A chapter of a subject in a class (docs/teaching-progress.md), in the list's order. */
export interface Chapter {
  id: string;
  name: string;
  done: boolean;
  /** The day it is to be finished by, or null. Late: that day is gone and it is not finished. */
  plannedOn: string | null;
  late: boolean;
}

/** A chapter as the Chapters window holds it while it is open (`plannedOn` "" for none; no `id` for a new one). */
export interface ChapterDraft {
  /** The row's own key while the window is open. */
  key: number;
  id?: string;
  name: string;
  done: boolean;
  plannedOn: string;
}

/** A list a subject's chapters can be copied from: another section, or an earlier year. */
export interface ChapterSource {
  id: string;
  label: string;
  chapters: { name: string; plannedOn: string | null }[];
}

/** Whether and when (India, "16:00") teachers who have not written the diary are reminded. */
export interface ClassworkReminder {
  enabled: boolean;
  time: string;
}

/** A class's diary of a day: every subject of the class, the ones the teacher may write, and what was written. */
export interface DiaryDay {
  classId: string;
  sectionId: string | null;
  label: string;
  date: string;
  subjects: {
    subjectId: string;
    subjectName: string;
    canWrite: boolean;
    chapters: Chapter[];
    entry: { taught: string; homework: string; chapterId: string | null; writtenBy: { name: string; role: string } } | null;
  }[];
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
  entries: { subjectName: string; chapter: { number: number; name: string; done: boolean } | null; taught: string; homework: string; writtenBy: string }[];
  /** How far each subject with chapters is, and the chapter going on. */
  progress: { subjectName: string; total: number; done: number; current: { number: number; name: string } | null }[];
}

// ---- Teaching progress (docs/teaching-progress.md) ----------------------------------------------------------------------------------

export interface ProgressChapter extends Chapter {
  number: number;
  completedOn: string | null;
  /** On how many days it was taught, and the first of them. */
  days: number;
  startedOn: string | null;
}

/** One subject of one class (or section). `updates`, `homework` and `last` are of the days asked; the chapters are the year's. */
export interface ProgressRow {
  classId: string;
  sectionId: string | null;
  classLabel: string;
  subjectId: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
  chapters: ProgressChapter[];
  /** How many of its chapters are past their planned day. */
  late: number;
  current: { number: number; name: string } | null;
  updates: number;
  homework: number;
  last: { date: string; taught: string; homework: string; chapter: { number: number; name: string } | null } | null;
}

export interface TeachingProgress {
  options: {
    classes: { classId: string; sectionId: string | null; label: string }[];
    subjects: { id: string; name: string }[];
    teachers: { id: string; name: string }[];
  };
  /** `behind`: class subjects with a chapter past its planned day. */
  summary: { updates: number; homework: number; chaptersDone: number; chaptersTotal: number; withoutUpdate: number; behind: number };
  rows: ProgressRow[];
}

export interface TeachingLog {
  total: number;
  page: number;
  limit: number;
  items: {
    id: string;
    date: string;
    classId: string;
    sectionId: string | null;
    classLabel: string;
    subjectName: string;
    teacherName: string | null;
    writtenBy: string;
    chapter: { number: number; name: string } | null;
    taught: string;
    homework: string;
  }[];
}

/** The filters of teaching progress, as the server takes them. */
export interface ProgressFilter extends DateRange {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  teacherId?: string;
}

export interface ChildTests {
  upcoming: { id: string; subjectName: string; date: string; topic: string; maxMarks: number }[];
  results: { id: string; subjectName: string; date: string; topic: string; maxMarks: number; marks: number | null; absent: boolean; percent: number | null }[];
  average: number | null;
}
