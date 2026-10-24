import { Baby, Backpack, BookOpen, FlaskConical, GraduationCap, Layers, type LucideIcon } from "lucide-react";
import { DEPARTMENT_SUGGESTIONS, levelToClass, sectionLetters } from "../constants/academics";
import { CLASS_LEVELS } from "../constants/schoolOptions";
import type { Tone } from "../constants/tones";
import type { AcademicStructure, ClassItem, DepartmentItem } from "../types";

/** "Class  5" and "class 5" are the same name, here as on the server. */
export const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** "1 section", "2 sections", "2 classes". */
export const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : /(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`}`;

/** "Class 5 - A". */
export const sectionTitle = (className: string, sectionName: string) => `${className} - ${sectionName}`;

/** What "N sections" will be called: 2 -> "A, B", 3 -> "A, B, C", 8 -> "A to H". */
export function describeSections(count: number): string {
  const letters = sectionLetters(count);
  return count <= 3 ? letters.join(", ") : `${letters[0]} to ${letters[count - 1]}`;
}

/** The first letter A-Z this class has not used yet; "" when all 26 are taken. */
export function nextSectionName(taken: readonly string[]): string {
  const used = new Set(taken.map(keyOf));
  return sectionLetters(26).find((letter) => !used.has(keyOf(letter))) ?? "";
}

/** The "how many sections" dropdown: 0 reads `none`, the rest "2 sections (A, B)". */
export function sectionCountOptions(none: string, max: number) {
  return Array.from({ length: max + 1 }, (_, n) => ({
    value: String(n),
    label: n === 0 ? none : `${plural(n, "section")} (${describeSections(n)})`,
  }));
}

/** "Pre-Primary" and "Pre Primary" are the same wing when deciding which classes it usually holds. */
const looseKey = (name: string) => keyOf(name).replace(/-/g, " ");

/** The classes that come before Class 1, however a school writes them. */
const BEFORE_CLASS_1 = new Set([
  "pre nursery", "nursery", "lkg", "ukg", "kg", "pre kg", "jr kg", "sr kg", "junior kg", "senior kg", "play group", "playgroup", "pre school", "preschool",
]);

/** "Class 5" is 5, Nursery / LKG / UKG are 0 (before Class 1), anything else is unknown (null). */
export function gradeOf(className: string): number | null {
  const number = /^class\s*(\d{1,2})$/i.exec(className.trim())?.[1];
  if (number) return Number(number);
  return BEFORE_CLASS_1.has(looseKey(className)) ? 0 : null;
}

/**
 * Which of `classes` a department with this name normally holds (Primary: Class 1 to 5, Pre-Primary: Nursery to UKG), to tick
 * them for the person. `null` for a name that has no usual span (the school's own, or "Junior Wing"): only the person knows
 * what goes in it.
 */
export function usualClassIds(departmentName: string, classes: readonly ClassItem[]): string[] | null {
  const span = DEPARTMENT_SUGGESTIONS.find((s) => looseKey(s.name) === looseKey(departmentName))?.grades;
  if (!span) return null;
  return classes
    .filter((c) => {
      const grade = gradeOf(c.name);
      return grade !== null && grade >= span[0] && grade <= span[1];
    })
    .map((c) => c.id);
}

/** What the "Add department" list shows: the usual wings, then the school's own, each marked when the school already has it. */
export function departmentChoices(existing: readonly DepartmentItem[]): { name: string; exists: boolean }[] {
  const have = new Map(existing.map((d) => [keyOf(d.name), d.name]));
  const usual = DEPARTMENT_SUGGESTIONS.map((s) => ({ name: have.get(keyOf(s.name)) ?? s.name, exists: have.has(keyOf(s.name)) }));
  const listed = new Set(DEPARTMENT_SUGGESTIONS.map((s) => keyOf(s.name)));
  const own = existing.filter((d) => !listed.has(keyOf(d.name))).map((d) => ({ name: d.name, exists: true }));
  return [...usual, ...own];
}

/** What "Quick setup" will create for a range, wing by wing: shown before anything is saved. */
export function quickSetupPlan(from: string, to: string) {
  const start = CLASS_LEVELS.indexOf(from as (typeof CLASS_LEVELS)[number]);
  const end = CLASS_LEVELS.indexOf(to as (typeof CLASS_LEVELS)[number]);
  if (start < 0 || end < 0 || start > end) return [];
  const groups: { department: string; classes: string[] }[] = [];
  for (const level of CLASS_LEVELS.slice(start, end + 1)) {
    const { name, department } = levelToClass(level);
    const last = groups[groups.length - 1];
    if (last?.department === department) last.classes.push(name);
    else groups.push({ department, classes: [name] });
  }
  return groups;
}

export interface ClassGroup {
  /** null for classes that are in no department (shown last, under "Other classes"). */
  department: DepartmentItem | null;
  classes: ClassItem[];
  /** The colour of this wing everywhere on the page. */
  tone: Tone;
}

/**
 * The classes laid out wing by wing, in the order the API sends them. A school that uses no departments gets one
 * group without a heading. Departments with no class yet are kept, so they can be renamed, filled or deleted.
 */
export function groupClasses(structure: AcademicStructure): ClassGroup[] {
  const groups: ClassGroup[] = structure.departments.map((department, position) => ({
    department,
    classes: structure.classes.filter((c) => c.departmentId === department.id),
    tone: departmentTone(position),
  }));
  const loose = structure.classes.filter((c) => !c.departmentId);
  if (loose.length > 0 || groups.length === 0) groups.push({ department: null, classes: loose, tone: "navy" });
  return groups;
}

/** Departments take these colours in turn (in display order), so the same wing is the same colour on the whole page. */
const DEPARTMENT_TONES: readonly Tone[] = ["primary", "success", "warning", "info", "danger"];
export const departmentTone = (position: number): Tone => DEPARTMENT_TONES[position % DEPARTMENT_TONES.length];

/** An icon that fits the usual wings; a school's own department names get the plain layers icon. */
const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  "pre-primary": Baby,
  kindergarten: Baby,
  "pre-school": Baby,
  // A school bag, not a pencil: a pencil reads as an "edit" button next to the department's name.
  primary: Backpack,
  middle: BookOpen,
  secondary: FlaskConical,
  "senior secondary": GraduationCap,
};
export const departmentIcon = (name: string): LucideIcon => DEPARTMENT_ICONS[keyOf(name)] ?? Layers;

/** The big mark on a class card: "5" for Class 5, "LKG" as it is, "PN" for Pre-Nursery. */
export function classMark(name: string): string {
  const clean = name.trim();
  const number = /^class\s*(\d{1,2})$/i.exec(clean)?.[1];
  if (number) return number;
  if (clean.length <= 3) return clean.toUpperCase();
  const words = clean.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : clean.slice(0, 2)).slice(0, 2).toUpperCase();
}

/** The values of the two special rows of a department dropdown: "No department" and "Other..." (a name of your own). */
export const NO_DEPARTMENT = "none";
export const OTHER = "other";

/** The rows of "which department is this class in": the school's departments, then "No department". Values are `dept:<id>` and "none". */
export function classDepartmentRows(departments: readonly DepartmentItem[]): { value: string; label: string }[] {
  return [...departments.map((d) => ({ value: `dept:${d.id}`, label: d.name })), { value: NO_DEPARTMENT, label: "No department" }];
}

/** The rows of "what is this department called": its own name first, then the usual names that no department uses, then "Other...". */
export function departmentNameRows(departments: readonly DepartmentItem[], current: DepartmentItem): { value: string; label: string }[] {
  const used = new Set(departments.map((d) => keyOf(d.name)));
  return [
    { value: `dept:${current.id}`, label: current.name },
    ...DEPARTMENT_SUGGESTIONS.filter((s) => !used.has(keyOf(s.name))).map((s) => ({ value: `new:${s.name}`, label: s.name })),
    { value: OTHER, label: "Other..." },
  ];
}

/** The colour of a department on the whole screen: the same as its band on the list. Classes in no department are navy. */
export function toneOf(structure: Pick<AcademicStructure, "departments">, departmentId: string | null): Tone {
  const position = departmentId ? structure.departments.findIndex((d) => d.id === departmentId) : -1;
  return position >= 0 ? departmentTone(position) : "navy";
}
