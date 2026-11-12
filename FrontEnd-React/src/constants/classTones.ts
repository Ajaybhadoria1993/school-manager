import { Baby, Blocks, type LucideIcon } from "lucide-react";

export type ClassTone = "pink" | "green" | "blue" | "orange" | "purple";

/** The pastel of a class card's top band, and the solid colour of its mark (the number, or the little picture before Class 1). */
export const CLASS_TONES: Record<ClassTone, { band: string; mark: string; markSoft: string }> = {
  pink: { band: "bg-pink-50", mark: "bg-pink-500 text-white", markSoft: "bg-pink-100 text-pink-600" },
  green: { band: "bg-emerald-50", mark: "bg-emerald-500 text-white", markSoft: "bg-emerald-100 text-emerald-600" },
  blue: { band: "bg-blue-50", mark: "bg-blue-600 text-white", markSoft: "bg-blue-100 text-blue-600" },
  orange: { band: "bg-orange-50", mark: "bg-orange-500 text-white", markSoft: "bg-orange-100 text-orange-600" },
  purple: { band: "bg-violet-50", mark: "bg-violet-500 text-white", markSoft: "bg-violet-100 text-violet-600" },
};

/** The colour each level has, in the order a school meets them, so a row of cards reads as a rainbow the way the sign-up mock shows it. */
const TONE_OF_LEVEL: Record<string, ClassTone> = {
  "Pre-Nursery": "pink",
  Nursery: "pink",
  LKG: "green",
  UKG: "green",
  "1": "blue",
  "2": "green",
  "3": "orange",
  "4": "purple",
  "5": "green",
  "6": "blue",
  "7": "green",
  "8": "purple",
  "9": "green",
  "10": "orange",
  "11": "pink",
  "12": "blue",
};

/** What a class card shows as its mark: a picture for the classes before Class 1, the number for the others. */
export interface ClassMarkKind {
  tone: ClassTone;
  icon: LucideIcon | null;
  /** The number of a numbered class ("Class 11 Science" is 11); null for a class that has a picture or none. */
  number: string | null;
  /** A stream or any text after the class's own name ("Science" for "Class 11 Science"). */
  rest: string;
}

/** The level of a class name: "Class 5" is "5", "Class 11 Science" is "11", "LKG" is "LKG"; null for a name of the school's own. */
function levelOf(name: string): { level: string; rest: string } | null {
  const numbered = /^Class (\d{1,2})\b\s*(.*)$/.exec(name.trim());
  if (numbered) return { level: numbered[1], rest: numbered[2] };
  const known = Object.keys(TONE_OF_LEVEL).find((level) => level.toLowerCase() === name.trim().toLowerCase());
  return known ? { level: known, rest: "" } : null;
}

export function classMarkOf(name: string, position: number): ClassMarkKind {
  const found = levelOf(name);
  const tones = Object.keys(CLASS_TONES) as ClassTone[];
  if (!found) return { tone: tones[position % tones.length], icon: null, number: null, rest: "" };
  const tone = TONE_OF_LEVEL[found.level];
  if (found.level === "Pre-Nursery" || found.level === "Nursery") return { tone, icon: Baby, number: null, rest: found.rest };
  if (found.level === "LKG" || found.level === "UKG") return { tone, icon: Blocks, number: null, rest: found.rest };
  return { tone, icon: null, number: found.level, rest: found.rest };
}
