/** Test & Exam (Manage school): the school's exams and tests of the year, and what each class writes on which day. */

export type ExamType = "half_yearly" | "annual" | "quarterly" | "pre_board" | "unit_test" | "monthly_test" | "class_test" | "other";

/** Whether it has come: before its first day, between its first and last day, after its last day. */
export type ExamStatus = "upcoming" | "running" | "over";

export interface Exam {
  id: string;
  name: string;
  type: ExamType;
  /** "Half-yearly exam", "Monthly test". */
  typeLabel: string;
  /** A full exam takes over the school day (it can have school hours); a test fits into a day that goes on as usual. */
  full: boolean;
  startDate: string;
  endDate: string;
  /** The hours the school keeps while a full exam is on ("08:00" to "12:30"); null: the school day is not changed. */
  schoolHours: { start: string; end: string } | null;
  note: string | null;
  status: ExamStatus;
  paperCount: number;
  classCount: number;
}

export interface ExamClassRef {
  id: string;
  name: string;
  /** The school's class order (lowest first). */
  order: number;
}

/** One subject on one day at one time for so many minutes, for one class or several at once. */
export interface ExamPaper {
  id: string;
  examId: string;
  classIds: string[];
  classes: ExamClassRef[];
  subject: { id: string; name: string };
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  maxMarks: number | null;
  topic: string | null;
  /** How many children have a result in this paper, in all its classes. */
  marked: number;
  /** The holiday that is on this paper's day now (declared after the paper was set), or null: the school moves the paper. */
  holiday: string | null;
}

export interface ExamDetail extends Exam {
  papers: ExamPaper[];
}

export interface ExamInput {
  name: string;
  type: ExamType;
  startDate: string;
  endDate?: string | null;
  schoolStart?: string | null;
  schoolEnd?: string | null;
  note?: string | null;
}

export interface PaperInput {
  subjectId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  maxMarks?: number | null;
  topic?: string | null;
}

// ---- A class's exams for its teachers and the school, a child's for their parent, and the marks (2026-11-06) ------------------------------

/** A paper as a class sees it: the same for every child of the class. */
interface PaperOfClass {
  id: string;
  subject: { id: string; name: string };
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  topic: string | null;
  maxMarks: number | null;
}

export interface ClassPaper extends PaperOfClass {
  /** The paper's day has come: marks can be entered. */
  held: boolean;
  /** The caller may enter the marks of this paper in this class (its subject's teacher, the class teacher, the school). */
  canWrite: boolean;
  /** Children of this class (section) with a result in it, and how many it has. */
  marked: number;
  children: number;
  holiday: string | null;
}

export interface ClassExam extends Exam {
  papers: ClassPaper[];
}

/** One day of a class's week on which the class has a paper. */
export interface ExamDay {
  date: string;
  /** Monday is 1, Sunday is 7. */
  day: number;
  /** A full exam is on: that day's lessons are off. A test only goes on top of them. */
  replacesLessons: boolean;
  schoolHours: { start: string; end: string } | null;
  exams: { id: string; name: string; typeLabel: string; full: boolean }[];
  papers: PaperOfClass[];
}

export interface ExamWeek {
  from: string;
  to: string;
  days: ExamDay[];
}

export interface ClassExams {
  label: string;
  items: ClassExam[];
  week: ExamWeek;
}

export interface MarksSheet {
  paperId: string;
  label: string;
  exam: { id: string; name: string };
  subject: { id: string; name: string };
  date: string;
  startTime: string;
  endTime: string;
  maxMarks: number | null;
  topic: string | null;
  held: boolean;
  canWrite: boolean;
  marked: number;
  average: number | null;
  students: { id: string; name: string; admissionNumber: string; rollNumber: number | null; marks: number | null; absent: boolean }[];
}

export interface MarksInput {
  classId: string;
  sectionId: string | null;
  marks: { studentId: string; marks: number | null; absent: boolean }[];
}

export interface ChildPaper extends PaperOfClass {
  /** The child's own result in it; null until the marks are entered. */
  result: { marks: number | null; absent: boolean; percent: number | null } | null;
}

export interface ChildExam extends Exam {
  papers: ChildPaper[];
  /** The marks of the papers with a result (not absent), out of what those papers are out of; null when there is none yet. */
  summary: { marks: number; outOf: number; percent: number; papers: number } | null;
}

export interface ChildExams {
  items: ChildExam[];
  week: ExamWeek;
}
