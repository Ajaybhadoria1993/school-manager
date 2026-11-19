/**
 * Documents (2026-11-19): what the school prints for a student: the ID card and the exam report card, built from what the app already keeps
 * (the student, the school's profile and logo, the exam marks, the attendance). Nothing here is a new record except the student's photo.
 */

/** The most cards or report cards one request makes (a class of a school; a bigger group is done by section). */
export const MAX_CLASS_DOCUMENTS = 200;

/**
 * A subject or a whole exam is passed from this percentage up. 33% is the usual pass mark of the boards of India; a school's own mark (and its
 * grade scheme) is its own: not a setting yet, so it is one place to change.
 */
export const PASS_PERCENT = 33;

/**
 * The grades of a percentage, best first (a common school scale: A1 from 91, A2 from 81, ... D from 33, E below the pass mark). A school that grades by
 * its own bands changes this one list; every percentage from 0 to 100 falls in exactly one band.
 */
export const GRADE_BANDS: readonly { min: number; grade: string }[] = [
  { min: 91, grade: "A1" },
  { min: 81, grade: "A2" },
  { min: 71, grade: "B1" },
  { min: 61, grade: "B2" },
  { min: 51, grade: "C1" },
  { min: 41, grade: "C2" },
  { min: 33, grade: "D" },
  { min: 0, grade: "E" },
];

/** The grade of a percentage on a scale (the usual one unless the school's own is given): the first band, best first, that the percentage reaches. */
export const gradeOf = (percent: number, bands: readonly { min: number; grade: string }[] = GRADE_BANDS): string => (bands.find((b) => percent >= b.min) ?? bands[bands.length - 1]).grade;

/** The most remark text on a report card, and the most issued certificates a list answers with. */
export const MAX_CERTIFICATES_LISTED = 100;
