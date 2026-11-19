/**
 * Which of the school's subjects make sense for a class, from the names alone (Assign class's "Other subject" list): a pre-school class
 * is not offered Physics, Chemistry or Accountancy. The school's own subjects carry no level, so this is a plain reading of the common
 * ones; a school that teaches one earlier still reaches it ("Show all subjects", or its exact name typed). Nothing here is saved or checked
 * by the server: it only keeps the list short and sensible.
 */

/** The first class each kind of subject is usually taught in (the highest of those that match its name; anything else is for every class). */
const FROM_CLASS: readonly (readonly [RegExp, number])[] = [
  [/^(science|social science|social studies)$/i, 1],
  [/sanskrit/i, 3],
  [/history|geography|civics|computer science/i, 6],
  [/physics|chemistry|biology|botany|zoology/i, 9],
  [/accountancy|accounts|business studies|economics|political science|sociology|psychology|informatics|legal studies|entrepreneurship/i, 11],
];

const PRE_PRIMARY = /nursery|\blkg\b|\bukg\b|\bkg\b|play ?(group|school)|pre[- ]?(school|primary|nursery|kg)|junior kg|senior kg/i;

/** The number of a class from its name: 0 for the years before Class 1 (Pre-Nursery, Nursery, LKG, UKG), "Class 11 Science" is 11, null when the name says neither. */
export function classNumberOf(className: string): number | null {
  if (PRE_PRIMARY.test(className)) return 0;
  const digits = /(\d{1,2})/.exec(className);
  return digits ? Number(digits[1]) : null;
}

/** The first class a subject is usually taught in (0 when it is taught from the start). */
export function firstClassOf(subjectName: string): number {
  return FROM_CLASS.reduce((first, [pattern, from]) => (pattern.test(subjectName.trim()) ? Math.max(first, from) : first), 0);
}

/** Whether a subject is one the class would usually have: always true for a class whose number the name does not tell. */
export function subjectFitsClass(subjectName: string, className: string): boolean {
  const number = classNumberOf(className);
  return number === null || firstClassOf(subjectName) <= number;
}
