/** Words around a class's number that are not part of it. */
const CLASS_WORDS = new Set(["class", "std", "standard", "grade", "cls"]);
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/**
 * The number of a class from 1 to 12, read from the name the school gave it ("Class 5", "V", "5th", "XI Science", "Std 7 - A"), or
 * null: Nursery, LKG, UKG, KG 1, Play Group and anything else are not Class 1 to 12. The first word that is not "Class" / "Std"... is
 * the number; what follows (a section, a stream) does not matter. A previous school is needed for these classes, and only for them
 * (a child in the first years of school comes from home). The screens read a class's name the same way (`utils/classNumber.ts`).
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
