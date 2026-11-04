import type { UserRole } from "../types";

/**
 * Who may set the timings and make the timetables (the server's TIMETABLE_WRITERS, backend/src/main/timetable/constants.ts): the school
 * admin and the principal. A teacher only looks, at what is published.
 */
export const TIMETABLE_WRITERS: readonly UserRole[] = ["school_admin", "principal"];

/** The weekdays as the timetable numbers them: 1 = Monday ... 7 = Sunday. */
export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** The usual subjects of an Indian school, to add in one click (the server gives each its category: PE, Art, Music... are activities). */
export const SUBJECT_PRESETS = [
  "English",
  "Hindi",
  "Mathematics",
  "Science",
  "Social Science",
  "EVS",
  "Computer Science",
  "Sanskrit",
  "General Knowledge",
  "Moral Science",
  "Physics",
  "Chemistry",
  "Biology",
  "History",
  "Geography",
  "Economics",
  "Accountancy",
  "Business Studies",
  "Physical Education",
  "Art & Craft",
  "Music",
  "Dance",
  "Library",
  "Yoga",
  "Games",
  "Value Education",
] as const;

/** The limits the server holds (the screens say the same words before anything is sent). */
export const MAX_PERIODS = 12;
export const MIN_PERIOD_MINUTES = 10;
export const MAX_PERIOD_MINUTES = 120;
export const MAX_BREAK_MINUTES = 180;
export const MAX_PERIODS_PER_WEEK = 20;
export const MAX_SAME_SUBJECT_PER_DAY = 2;
export const TIME_MESSAGE = "Enter a time like 08:30";

/** What a subject looks like in the grid: a soft colour per subject, in a fixed order, so a subject keeps its colour as the page changes. */
export const SUBJECT_COLORS = [
  "bg-blue-100 text-blue-900 border-blue-200",
  "bg-emerald-100 text-emerald-900 border-emerald-200",
  "bg-amber-100 text-amber-900 border-amber-200",
  "bg-rose-100 text-rose-900 border-rose-200",
  "bg-violet-100 text-violet-900 border-violet-200",
  "bg-cyan-100 text-cyan-900 border-cyan-200",
  "bg-orange-100 text-orange-900 border-orange-200",
  "bg-lime-100 text-lime-900 border-lime-200",
  "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200",
  "bg-teal-100 text-teal-900 border-teal-200",
] as const;
