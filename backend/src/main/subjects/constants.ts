import type { UserRole } from "../users/models/User";

/**
 * Who may change the school's subjects and what each class studies (and with which teacher). One list, so a role such as a "vice
 * principal" is added by editing this one line. The routes and the screens both follow it.
 */
export const SUBJECT_WRITERS = ["school_admin", "principal"] as const satisfies readonly UserRole[];
/** Who may look at them: a teacher sees what each class studies. */
export const SUBJECT_READERS = ["school_admin", "principal", "teacher"] as const satisfies readonly UserRole[];

/**
 * `academic` is a subject with marks (Maths, Hindi); `activity` is one without (PT, Art, Library, Music). The timetable treats both the
 * same; the report card will list only the first kind with marks.
 */
export const SUBJECT_CATEGORIES = ["academic", "activity"] as const;
export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

/** Hard limits, so one school cannot fill the database by accident. */
export const MAX_SUBJECTS = 80;
export const MAX_SUBJECT_NAME = 40;
export const MAX_SUBJECT_CODE = 10;
/** The most subjects one request may add at once ("Add the usual subjects"). */
export const MAX_NEW_SUBJECTS = 40;

/** A subject of a class can be taught this many periods a week at most, and in blocks of up to 3 consecutive periods (a lab). */
export const MAX_PERIODS_PER_WEEK = 20;
export const MAX_BLOCK_SIZE = 3;
export const MAX_GROUP_NAME = 30;

/** The subjects an Indian school usually has, to add in one click. The category is the one a subject added by its name gets. */
export const SUBJECT_PRESETS: readonly { name: string; category: SubjectCategory }[] = [
  { name: "English", category: "academic" },
  { name: "Hindi", category: "academic" },
  { name: "Mathematics", category: "academic" },
  { name: "Science", category: "academic" },
  { name: "Social Science", category: "academic" },
  { name: "EVS", category: "academic" },
  { name: "Computer Science", category: "academic" },
  { name: "Sanskrit", category: "academic" },
  { name: "General Knowledge", category: "academic" },
  { name: "Moral Science", category: "academic" },
  { name: "Physics", category: "academic" },
  { name: "Chemistry", category: "academic" },
  { name: "Biology", category: "academic" },
  { name: "History", category: "academic" },
  { name: "Geography", category: "academic" },
  { name: "Economics", category: "academic" },
  { name: "Accountancy", category: "academic" },
  { name: "Business Studies", category: "academic" },
  { name: "Physical Education", category: "activity" },
  { name: "Art & Craft", category: "activity" },
  { name: "Music", category: "activity" },
  { name: "Dance", category: "activity" },
  { name: "Library", category: "activity" },
  { name: "Yoga", category: "activity" },
  { name: "Games", category: "activity" },
  { name: "Value Education", category: "activity" },
];
