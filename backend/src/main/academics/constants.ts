import { CLASS_LEVELS } from "../tenants/constants";

/** Hard limits, so one school cannot fill the database by accident (or on purpose). */
export const MAX_DEPARTMENTS = 15;
export const MAX_CLASSES = 60;
export const MAX_SECTIONS_PER_CLASS = 30;
/** The most sections one request may create at once ("2 sections" = A and B). */
export const MAX_NEW_SECTIONS = 10;
export const MAX_SECTION_CAPACITY = 200;

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

/** Section names for a count: 1 -> A, 3 -> A B C. */
export function sectionLetters(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}
