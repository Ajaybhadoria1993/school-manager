/** Words around a class's number that are not part of it. */
const CLASS_WORDS = new Set(["class", "std", "standard", "grade", "cls"]);
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/**
 * The number of a class from 1 to 12, read from the name the school gave it ("Class 5", "V", "5th", "XI Science", "Std 7 - A"), or
 * null: Nursery, LKG, UKG, KG 1, Play Group and anything else are not Class 1 to 12. The first word that is not "Class" / "Std"... is
 * the number; what follows (a section, a stream) does not matter. A previous school is needed for these classes, and only for them.
 * The server reads a class's name the same way (backend/src/main/students/classNumber.ts).
 */
export function classNumber(name: string): number | null {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !CLASS_WORDS.has(w));
  const first = words[0];
  if (!first) return null;
  const digits = /^(\d{1,2})(st|nd|rd|th)?$/.exec(first);
  const number = digits ? Number(digits[1]) : ROMAN[first];
  return number >= 1 && number <= 12 ? number : null;
}

/**
 * The stream a class is taught in, as the school wrote it: "Science" for "Class 11 Science". Only Class 11 and 12 have streams; null
 * for any other class and for Class 11 or 12 as a whole. A single letter after the number is a section, not a stream. The server reads
 * a class's name the same way (backend/src/main/students/classNumber.ts).
 */
export function streamOf(name: string): string | null {
  const number = classNumber(name);
  if (number !== 11 && number !== 12) return null;
  const words = name.trim().split(/\s+/);
  const at = words.findIndex((w) => !CLASS_WORDS.has(w.toLowerCase().replace(/[^a-z0-9]+/g, "")) && w.replace(/[^a-z0-9]+/gi, "") !== "");
  const rest = words
    .slice(at + 1)
    .join(" ")
    .replace(/^[\s\-–—:,./]+|[\s\-–—:,./]+$/g, "");
  return rest.length >= 2 ? rest : null;
}

/** Class 11 or 12 as a whole: a student must be put in one of its streams ("Class 11 Science"), never in this class. */
export function needsStream(name: string): boolean {
  const number = classNumber(name);
  return (number === 11 || number === 12) && streamOf(name) === null;
}
