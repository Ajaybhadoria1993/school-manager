import { CLASS_LEVELS } from "../tenants/constants";

/** Hard limits, so one school cannot fill the database by accident (or on purpose). */
export const MAX_DEPARTMENTS = 15;
export const MAX_CLASSES = 60;
export const MAX_SECTIONS_PER_CLASS = 30;
/** The most sections one request may create at once ("2 sections" = A and B). */
export const MAX_NEW_SECTIONS = 10;
export const MAX_SECTION_CAPACITY = 200;
/** The most seats one class can have in all (its sections together fit inside it). */
export const MAX_CLASS_CAPACITY = 2000;

type ClassLevel = (typeof CLASS_LEVELS)[number];

/** The usual wings of an Indian school. A school can rename them or add its own (for example "Kindergarten"). */
export const DEPARTMENT_NAMES = ["Pre-Primary", "Primary", "Middle", "Secondary", "Senior Secondary"] as const;

/** How a level from the onboarding form is written as a class, and the wing it normally belongs to. */
export function levelToClass(level: ClassLevel): { name: string; department: (typeof DEPARTMENT_NAMES)[number] } {
  const grade = Number(level);
  if (Number.isNaN(grade)) return { name: level, department: "Pre-Primary" };
  const department =
    grade <= 5 ? "Primary" : grade <= 8 ? "Middle" : grade <= 10 ? "Secondary" : "Senior Secondary";
  return { name: `Class ${grade}`, department };
}

/**
 * The classes a range of levels makes, in teaching order, each with its usual wing. With streams, Class 11 and Class 12 are one class per
 * stream ("Class 11 Science"), because a stream has its own students, subjects and timetable. Nothing for a range that runs backwards.
 */
export function plannedClasses(lowest: ClassLevel, highest: ClassLevel, streams: readonly string[] = []): { name: string; department: (typeof DEPARTMENT_NAMES)[number] }[] {
  const from = CLASS_LEVELS.indexOf(lowest);
  const to = CLASS_LEVELS.indexOf(highest);
  if (from < 0 || to < from) return [];
  return CLASS_LEVELS.slice(from, to + 1).flatMap((level) => {
    const plain = levelToClass(level);
    if (streams.length === 0 || (level !== "11" && level !== "12")) return [plain];
    return streams.map((stream) => ({ name: `${plain.name} ${stream}`, department: plain.department }));
  });
}

/** Section names for a count: 1 -> A, 3 -> A B C. */
export function sectionLetters(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}
