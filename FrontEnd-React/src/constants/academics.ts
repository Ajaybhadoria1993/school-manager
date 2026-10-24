import { CLASS_LEVELS } from "./schoolOptions";

/** These limits and names must match backend/src/main/academics/constants.ts (the server checks them). */
export const MAX_SECTIONS_PER_CLASS = 30;
/** The most sections one "Add class" may start with. */
export const MAX_NEW_SECTIONS = 10;
export const MAX_SECTION_CAPACITY = 200;

/** The usual wings of an Indian school. A school can rename them or add its own. */
export const DEPARTMENT_NAMES = ["Pre-Primary", "Primary", "Middle", "Secondary", "Senior Secondary"] as const;

/**
 * What the "Add department" list offers: the usual wings of Indian schools, with the four stages of the National Education
 * Policy. A school may also type a name of its own. `grades` is the span of classes a wing normally holds (0 means before
 * Class 1: Pre-Nursery, Nursery, LKG, UKG); it is only used to tick the likely classes for the person, never to decide for them.
 */
export const DEPARTMENT_SUGGESTIONS: readonly { name: string; grades?: readonly [number, number] }[] = [
  { name: "Pre-Primary", grades: [0, 0] },
  { name: "Kindergarten", grades: [0, 0] },
  { name: "Pre-School", grades: [0, 0] },
  { name: "Primary", grades: [1, 5] },
  { name: "Upper Primary", grades: [6, 8] },
  { name: "Middle", grades: [6, 8] },
  { name: "Secondary", grades: [9, 10] },
  { name: "Senior Secondary", grades: [11, 12] },
  { name: "Higher Secondary", grades: [11, 12] },
  { name: "Junior Wing" },
  { name: "Senior Wing" },
  { name: "Foundational Stage", grades: [0, 2] },
  { name: "Preparatory Stage", grades: [3, 5] },
  { name: "Middle Stage", grades: [6, 8] },
  { name: "Secondary Stage", grades: [9, 12] },
];

/** How a level from the onboarding form is written as a class, and the wing it normally belongs to. */
export function levelToClass(level: string): { name: string; department: string } {
  const grade = Number(level);
  if (Number.isNaN(grade)) return { name: level, department: "Pre-Primary" };
  const department = grade <= 5 ? "Primary" : grade <= 8 ? "Middle" : grade <= 10 ? "Secondary" : "Senior Secondary";
  return { name: `Class ${grade}`, department };
}

/** Every standard class in teaching order, as the school would name it. Used for the quick-pick chips. */
export const STANDARD_CLASSES = CLASS_LEVELS.map(levelToClass);

/** Section names for a count: 1 -> A, 3 -> A, B, C. */
export const sectionLetters = (count: number) => Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
