import type { EmploymentType, UserRole } from "../types";

/** Who may add and change teachers (the server's STAFF_WRITERS, backend/src/main/staff/constants.ts): the school admin and the principal. */
export const STAFF_WRITERS: readonly UserRole[] = ["school_admin", "principal"];

export const EMPLOYMENT_OPTIONS: readonly { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
];

export const employmentLabel = (type: EmploymentType | null) => EMPLOYMENT_OPTIONS.find((o) => o.value === type)?.label ?? null;

/** The posts of an Indian school, to pick in one click; anything else can be typed. */
export const DESIGNATIONS = [
  "PRT (Primary teacher)",
  "TGT (Trained graduate teacher)",
  "PGT (Post graduate teacher)",
  "Nursery teacher",
  "Class teacher",
  "Subject teacher",
  "Head of department",
  "Coordinator",
  "Vice principal",
  "Sports teacher",
  "Music teacher",
  "Art teacher",
  "Computer teacher",
  "Librarian",
  "Counsellor",
] as const;

/** The same limits as the server (backend/src/main/staff/constants.ts). */
export const TEACHER_LIMITS = {
  name: 100,
  employeeCode: 20,
  designation: 60,
  qualification: 100,
  maxExperience: 60,
  minAge: 18,
  maxAge: 75,
  maxPeriodsPerDay: 12,
  maxPeriodsPerWeek: 70,
  /** A teacher may be added this many days before they join. */
  daysBeforeJoining: 366,
} as const;

/** A bulk upload of teachers (the server's limits, backend/src/main/staff/constants.ts): a file may hold a school's most, and goes in parts. */
export const TEACHER_IMPORT = { maxRows: 300, rowsPerRequest: 10, maxFileMb: 5, maxSubjects: 30 } as const;

/** The words of the own-field dialog when the field is a teacher's (the students' are the dialog's default). */
export const TEACHER_WORDS = { where: "Add teacher and the Excel", form: "Add teacher", who: "teachers" };
