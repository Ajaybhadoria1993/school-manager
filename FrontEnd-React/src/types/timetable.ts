/** The shapes of the Subjects, Staff (teachers) and Timetable APIs (backend/src/main/{subjects,staff,timetable}). */

export type SubjectCategory = "academic" | "activity";

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  category: SubjectCategory;
  isActive: boolean;
  /** How many classes or sections study it this year. */
  sections: number;
}

export interface SubjectInput {
  name: string;
  code?: string | null;
  category?: SubjectCategory;
}

export interface QuickAddSubjectsResult {
  created: Subject[];
  skipped: string[];
}

// ---- The school's timings ------------------------------------------------------------------------------------------------------

export type SlotKind = "period" | "lunch" | "break";
export type ScheduleScope = "all" | "only" | "except";

/** One row of a day: times as "08:30". */
export interface Slot {
  kind: SlotKind;
  label: string;
  start: string;
  end: string;
}

export interface Schedule {
  id: string;
  name: string;
  days: number[];
  scope: ScheduleScope;
  classIds: string[];
  /** A department's own timing (its classes are the department's); null for the whole school's or one for named classes. */
  departmentId: string | null;
  /** None for a department's holiday. */
  slots: Slot[];
  periods: number;
}

/**
 * `PUT /timetable/school-day`: a week in one save. For the whole school the rows of every day that has school (a day not sent is a
 * holiday); for a department (`departmentId`) every day of its week, a holiday sent with no rows.
 */
export interface SchoolDayInput {
  departmentId?: string | null;
  days: { day: number; slots: Slot[] }[];
}

/**
 * `PUT /timetable/class-day`: the days that are a class's own (more or fewer periods; a holiday is a day with no rows). Every other day
 * follows the school's (or the department's) timing; no days at all sets the class back to following it. `removeLessons` agrees to take
 * the lessons out of the periods the class will no longer have (the server refuses with LESSONS_IN_REMOVED_PERIODS without it).
 */
export interface ClassDayInput {
  classId: string;
  days: { day: number; slots: Slot[] }[];
  removeLessons?: boolean;
}

export interface ScheduleInput {
  name: string;
  days: number[];
  scope: ScheduleScope;
  classIds: string[];
  slots: Slot[];
}

// ---- What each class studies ---------------------------------------------------------------------------------------------------

export interface AllotmentRow {
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  category: SubjectCategory;
  subjectActive: boolean;
  periodsPerWeek: number;
  blockSize: number;
  teacherId: string | null;
  teacherName: string | null;
  /** The backup teachers in order (priority 2, 3...): they manage the subject when the main teacher cannot come. */
  backups: { id: string; name: string }[];
  group: string | null;
}

export interface AllotmentUnit {
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  label: string;
  academicYear: { id: string; name: string };
}

export interface AllotmentView {
  unit: AllotmentUnit;
  rows: AllotmentRow[];
  siblings: { id: string; name: string }[];
  totals: { periods: number; available: number | null };
}

/** The unit a request is about: a section, or a class that has none (`sectionId` null). */
export interface UnitRef {
  classId: string;
  sectionId: string | null;
}

export interface AllotmentInput {
  subjectId: string;
  periodsPerWeek: number;
  blockSize: number;
  teacherId: string | null;
  group: string | null;
}

export interface SaveAllotmentsInput extends UnitRef {
  rows: AllotmentInput[];
  alsoSections?: string[];
  withTeachers?: boolean;
}

// ---- A class's weekly timetable ------------------------------------------------------------------------------------------------

export interface Lesson {
  subjectId: string;
  /** Null: the teacher the class's subject list names. */
  teacherId: string | null;
  room: string | null;
}

export interface GridCell {
  day: number;
  period: number;
  lessons: Lesson[];
}

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
  day?: number;
  period?: number;
  subjectId?: string;
  teacherId?: string;
}

export interface GridDay {
  day: number;
  name: string;
  slots: { kind: SlotKind; label: string; start: string; end: string; period: number | null }[];
}

export interface GridAllotment {
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  category: SubjectCategory;
  periodsPerWeek: number;
  blockSize: number;
  teacherId: string | null;
  group: string | null;
}

export interface GridTeacher {
  id: string;
  name: string;
  isActive: boolean;
  offDays: number[];
  maxPerDay: number | null;
  maxPerWeek: number | null;
  subjectIds: string[];
}

export interface GridView {
  unit: AllotmentUnit;
  exists: boolean;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string | null;
  days: GridDay[];
  cells: GridCell[];
  allotments: GridAllotment[];
  teachers: GridTeacher[];
  busy: { day: number; period: number; teacherId: string | null; room: string | null; where: string; subjectName: string }[];
  load: { teacherId: string; perDay: Record<string, number>; week: number }[];
  issues: Issue[];
  stats: { total: number; filled: number; free: number; placed: Record<string, number> };
}

export interface AutofillAnswer {
  cells: GridCell[];
  issues: Issue[];
  stats: GridView["stats"];
  unplaced: { subjectId: string; subjectName: string; missing: number }[];
  dropped: number;
  seed: number;
}

export interface CopyInput extends UnitRef {
  toSections: string[];
  replace?: boolean;
}

export interface CopyAnswer {
  results: { sectionId: string; label: string; status: "copied" | "skipped"; copied: number; reason?: string; left: { day: number; period: number; reason: string }[] }[];
}

export interface TeacherWeek {
  teacher: { id: string; name: string; isActive: boolean; offDays: number[]; maxPerDay: number | null; maxPerWeek: number | null };
  lessons: {
    day: number;
    period: number;
    start: string;
    end: string;
    classId: string;
    sectionId: string | null;
    label: string;
    subjectId: string;
    subjectName: string;
    room: string | null;
    published: boolean;
  }[];
  teaches: { classId: string; sectionId: string | null; label: string; subjectId: string; subjectName: string; periodsPerWeek: number }[];
  perDay: Record<string, number>;
  week: number;
}

export interface ReplaceTeacherInput {
  withTeacherId: string;
  deactivate?: boolean;
}

// ---- The set-up at a glance ----------------------------------------------------------------------------------------------------

export interface OverviewUnit {
  classId: string;
  sectionId: string | null;
  label: string;
  className: string;
  hasTiming: boolean;
  subjects: number;
  periodsToPlace: number;
  periodsAvailable: number | null;
  withoutTeacher: number;
  status: "none" | "draft" | "published";
  filled: number;
  total: number;
  errors: number;
  warnings: number;
}

export interface TimingSummary {
  id: string;
  name: string;
  days: number[];
  scope: ScheduleScope;
  classNames: string[];
  periods: number;
  start: string | null;
  end: string | null;
  lunch: { start: string; end: string } | null;
}

/** What the school has done so far, over all its classes (the list's filter does not change it). */
export interface OverviewSummary {
  units: number;
  withSubjects: number;
  withTiming: number;
  none: number;
  draft: number;
  published: number;
}

export interface OverviewQuery {
  search?: string;
  status?: "all" | "none" | "draft" | "published";
}

export interface TimetableOverview {
  academicYear: { id: string; name: string } | null;
  counts: { subjects: number; teachers: number; timings: number };
  summary: OverviewSummary;
  timings: TimingSummary[];
  units: OverviewUnit[];
}

export interface PublishedUnits {
  units: { classId: string; sectionId: string | null; label: string }[];
}
