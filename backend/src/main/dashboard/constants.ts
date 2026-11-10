import type { UserRole } from "../users/models/User";

/** Who sees the school's home page numbers: the people who run the school (a teacher or a parent has their own home). */
export const DASHBOARD_READERS = ["school_admin", "principal", "accountant"] as const satisfies readonly UserRole[];

/** How many months of admissions the page draws, this month included. */
export const ADMISSION_MONTHS = 6;
/** "Coming up" looks this many days ahead, and shows at most this many lines. */
export const UPCOMING_DAYS = 30;
export const UPCOMING_LINES = 5;
/** The classes with the most absences the home page names, at most. */
export const ABSENT_CLASSES = 5;
