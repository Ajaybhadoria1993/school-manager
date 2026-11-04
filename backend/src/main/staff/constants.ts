import type { UserRole } from "../users/models/User";

/**
 * Who may add teachers and change them. One list, so a role such as a "vice principal" is added by editing this one line. The routes and the
 * screens both follow it.
 */
export const STAFF_WRITERS = ["school_admin", "principal"] as const satisfies readonly UserRole[];
/** Who may look at the teachers: a teacher sees their colleagues. */
export const STAFF_READERS = ["school_admin", "principal", "teacher"] as const satisfies readonly UserRole[];

/** Hard limits, so one school cannot fill the database by accident. */
export const MAX_TEACHERS = 300;
export const MAX_TEACHER_NAME = 100;
export const MAX_EMPLOYEE_CODE = 20;
export const MAX_TEACHER_SUBJECTS = 30;
/** A teacher takes at most this many periods a day / a week (a guard against a mistyped number, not a policy). */
export const MAX_PERIODS_PER_DAY = 12;
export const MAX_PERIODS_PER_WEEK = 70;

export const MOBILE_MESSAGE = "Enter a 10-digit mobile number starting with 6, 7, 8 or 9";

/** What the school keeps about a teacher as a person and as an employee (all optional: a teacher is added with only a name if need be). */
export const TEACHER_GENDERS = ["Male", "Female", "Other"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const MAX_DESIGNATION = 60;
export const MAX_QUALIFICATION = 100;
export const MAX_EXPERIENCE_YEARS = 60;
/** A teacher is this old, in whole years, today. A guard against a mistyped year, not a policy. */
export const MIN_TEACHER_AGE = 18;
export const MAX_TEACHER_AGE = 75;
/** A teacher may be added before the day they join, but not further ahead than this many days (a mistyped year). */
export const MAX_DAYS_BEFORE_JOINING = 366;
