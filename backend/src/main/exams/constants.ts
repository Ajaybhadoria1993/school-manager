/**
 * Test & Exam (Manage school): what the school can schedule. A **full exam** (Half-yearly, Annual...) takes over the school day, so it
 * can say the hours the school keeps while it is on; a **test** (Unit, Monthly, Class test) fits into a school day that goes on as usual.
 */
export const EXAM_TYPES = ["half_yearly", "annual", "quarterly", "pre_board", "unit_test", "monthly_test", "class_test", "other"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

/** Whom an exam is for (2026-11-26): the whole school, some departments (their classes), or some classes. */
export const EXAM_SCOPES = ["school", "departments", "classes"] as const;
export type ExamScope = (typeof EXAM_SCOPES)[number];

export const EXAM_TYPE_INFO: Record<ExamType, { label: string; full: boolean }> = {
  half_yearly: { label: "Half-yearly exam", full: true },
  annual: { label: "Annual exam", full: true },
  quarterly: { label: "Quarterly exam", full: true },
  pre_board: { label: "Pre-board exam", full: true },
  unit_test: { label: "Unit test", full: false },
  monthly_test: { label: "Monthly test", full: false },
  class_test: { label: "Class test", full: false },
  other: { label: "Other test", full: false },
};

/** Who schedules exams (one named list, spread into `requireRole`). Teachers and parents get their own readers when they are given a view. */
export const EXAM_WRITERS = ["school_admin", "principal"] as const;
export const EXAM_READERS = EXAM_WRITERS;

export const MAX_EXAM_NAME = 80;
export const MAX_TOPIC = 200;
export const MAX_NOTE = 300;
/** A paper lasts 5 minutes to 10 hours. */
export const MIN_DURATION = 5;
export const MAX_DURATION = 600;
export const MAX_PAPERS_AT_ONCE = 60;
/** The longest name of an exam room ("Room 101", "Science lab", "Hall B"). */
export const MAX_ROOM = 40;
/** The most roll numbers saved at once (a whole class or two). */
export const MAX_ROLLS_AT_ONCE = 500;
/** The most teachers on duty in one room of an exam (2026-11-27, the user: "ek room mein 1 ya 2 teacher"). */
export const MAX_DUTY_TEACHERS = 2;
