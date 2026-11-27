/** Exam (the menu's own row since 2026-11-26; it was Test & Exam under Manage school): the school's exams and tests of the year, and what each class writes on which day. */

export type ExamType = "half_yearly" | "annual" | "quarterly" | "pre_board" | "unit_test" | "monthly_test" | "class_test" | "other";

/** Whether it has come: before its first day, between its first and last day, after its last day. */
export type ExamStatus = "upcoming" | "running" | "over";

/** Whom an exam is for (2026-11-26): the whole school, some departments (their classes), or some classes. */
export type ExamScope = "school" | "departments" | "classes";

/** Whom an exam is for, named, with its classes in the school's order (on the school's list and an exam's page). */
export interface ExamAudience {
  /** "Whole school", "Primary and Middle", "Class 9 and Class 10". */
  label: string;
  departments: { id: string; name: string }[];
  classes: ExamClassRef[];
}

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
  /**
   * The hours an older exam kept while it was on ("08:00" to "12:30"); null: the school's time on an exam day is the time of the class's papers
   * (2026-11-26: the time is set per paper in the Exam Time Table).
   */
  schoolHours: { start: string; end: string } | null;
  /** Whom it is for; an older server sends none (the whole school). */
  scope?: ExamScope;
  /** Sent on the school's list and an exam's page, not on a class's or a child's reading. */
  audience?: ExamAudience;
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
  scope?: ExamScope;
  departmentIds?: string[];
  classIds?: string[];
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
  /** Where the child sits for it (2026-11-27): their roll number and room; null (or left out by an older server) for a child with no class this year. */
  seat?: { rollNumber: number | null; room: string | null } | null;
}

// ---- The children of an exam, their roll numbers and rooms (2026-11-27) --------------------------------------------------------------------

/** A child of a class of the exam, as the Students tab lists them. */
export interface RosterRow {
  id: string;
  name: string;
  admissionNumber: string;
  fatherName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  /** The room whose run holds their roll number, or null. */
  room: string | null;
}

export interface ExamRoster {
  classId: string;
  className: string;
  sectionId: string | null;
  sections: { id: string; name: string }[];
  items: RosterRow[];
  counts: { students: number; withoutRoll: number; withoutRoom: number };
}

/** A room and the run of roll numbers of a class (or section) that sit in it. */
export interface ExamRoom {
  id: string;
  examId: string;
  room: string;
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  fromRoll: number;
  toRoll: number;
  students: number;
}

/** A class or section with children not in a room yet: with a roll number and no room, and with no roll number. */
export interface ExamRoomsLeft {
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  withoutRoom: number;
  withoutRoll: number;
}

/** A teacher who can watch a room, or watches one. */
export interface DutyTeacher {
  id: string;
  name: string;
}

/** The one or two teachers on duty in a room for the whole exam (2026-11-27). */
export interface ExamRoomDuty {
  room: string;
  teachers: DutyTeacher[];
}

/** The roll numbers given in a class or section of the exam: the Rooms tab counts a run with them while it is written. */
export interface ExamRolls {
  classId: string;
  sectionId: string | null;
  numbers: number[];
}

export interface ExamRooms {
  items: ExamRoom[];
  left: ExamRoomsLeft[];
  /** Left out by an older server. */
  duties?: ExamRoomDuty[];
  rolls?: ExamRolls[];
}

/** A room the signed-in teacher watches (their home, 2026-11-27): the exam, who else is there, who sits in it, and the days it has papers. */
export interface MyExamDuty {
  exam: { id: string; name: string; startDate: string; endDate: string };
  room: string;
  /** The other teacher on duty there. */
  with: string[];
  seats: { place: string; fromRoll: number; toRoll: number; students: number }[];
  students: number;
  days: { date: string; startTime: string; endTime: string; papers: { subject: string; classes: string[]; startTime: string; endTime: string }[] }[];
}

export interface ExamRoomInput {
  room: string;
  classId: string;
  sectionId: string | null;
  fromRoll: number;
  toRoll: number;
}

export interface ChildExams {
  items: ChildExam[];
  week: ExamWeek;
}
