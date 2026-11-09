/**
 * Test & Exam (Manage school): what the school can schedule. A **full exam** (Half-yearly, Annual...) takes over the school day, so it
 * can say the hours the school keeps while it is on; a **test** (Unit, Monthly, Class test) fits into a school day that goes on as usual.
 */
export const EXAM_TYPES = ["half_yearly", "annual", "quarterly", "pre_board", "unit_test", "monthly_test", "class_test", "other"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

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
