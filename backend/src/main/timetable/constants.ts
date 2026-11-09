import type { UserRole } from "../users/models/User";

/**
 * Who may set the school's timings and make its timetables. One list, so a role such as a "vice principal" is added by editing this one
 * line. The routes and the screens both follow it. (The FRD has the principal make the timetable and the school admin approve it; both
 * may do both here, because a small school has one person doing it all.)
 */
export const TIMETABLE_WRITERS = ["school_admin", "principal"] as const satisfies readonly UserRole[];
/** Who may look at timetables: a teacher sees every class's and every colleague's. */
export const TIMETABLE_READERS = ["school_admin", "principal", "teacher"] as const satisfies readonly UserRole[];

/** The weekdays as numbered everywhere in the timetable: 1 = Monday ... 7 = Sunday (ISO). */
export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** What a row of a day's timings is: a period (a lesson goes in it), the lunch break, or any other break (assembly, a short break). */
export const SLOT_KINDS = ["period", "lunch", "break"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

/** Which classes a timing is for: all of them, only the ones listed, or all but the ones listed. */
export const SCHEDULE_SCOPES = ["all", "only", "except"] as const;
export type ScheduleScope = (typeof SCHEDULE_SCOPES)[number];

/** Hard limits, so one school cannot fill the database by accident. */
export const MAX_SCHEDULES = 60;
export const MAX_SLOTS = 24;
export const MAX_PERIODS = 12;
export const MAX_LABEL = 30;
export const MIN_PERIOD_MINUTES = 10;
export const MAX_PERIOD_MINUTES = 120;
export const MAX_BREAK_MINUTES = 180;
export const MAX_SCHEDULE_NAME = 40;

/** What a timetable cell may hold: one lesson, or the lessons of a choice taught side by side (up to this many). */
export const MAX_LESSONS_PER_CELL = 6;
export const MAX_ROOM = 30;
/** A subject more often than this in one day is a warning (a double period counts once). */
export const MAX_SAME_SUBJECT_PER_DAY = 2;
