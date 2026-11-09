/**
 * Attendance for the people who run the school (2026-11-06): the students' attendance of any class for any days, and the teachers'
 * own attendance (a teacher marks themselves present in the app; one who has not by the time school ends is absent).
 */

/** Who reads the school-wide sheets. A teacher reads only their own day (`/attendance/teachers/me`). */
export const ATTENDANCE_READERS = ["school_admin", "principal"] as const;

/** A range of days is a year at most, so one question is never a whole history. */
export const MAX_RANGE_DAYS = 366;

/**
 * What a teacher's day says. `present` / `late` are kept (the teacher marked, `late` when it was after school started); `absent` is
 * worked out (no mark by the time school ended, or the day has passed); `off` is a day the school does not run or the teacher's own off day;
 * `leave` (the school put the day on leave: not counted against the teacher); `holiday`; `no_login` (a working day of a teacher the school has given no login: they cannot mark themselves, so it is neither
 * present nor absent); `pending` (today, school still on, not marked); `upcoming` (a day to come); `before` (the teacher had not joined yet).
 */
export const TEACHER_DAY_STATUSES = ["present", "late", "absent", "leave", "off", "holiday", "no_login", "pending", "upcoming", "before"] as const;
export type TeacherDayStatus = (typeof TEACHER_DAY_STATUSES)[number];
