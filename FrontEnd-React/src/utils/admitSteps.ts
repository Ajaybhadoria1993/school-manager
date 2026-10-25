import { STUDENT_FORM_FIELDS, type CustomFieldDef, type FieldRules } from "../constants/studentFields";
import { asks } from "./fieldRules";

export type AdmitStepKey = "academic" | "personal" | "parents" | "more";

export interface AdmitStep {
  key: AdmitStepKey;
  /** Its name on the stepper. */
  label: string;
  /** One line saying what is in it. */
  hint: string;
}

const STEPS: Record<AdmitStepKey, AdmitStep> = {
  academic: { key: "academic", label: "Academic", hint: "The class and section, the admission date and the previous school" },
  personal: { key: "personal", label: "Personal info", hint: "The child, the address and the IDs" },
  parents: { key: "parents", label: "Parents", hint: "The father, the mother or a guardian" },
  more: { key: "more", label: "More details", hint: "Health, an emergency number, fees, the bus and your own details" },
};

/** The details of the last step: the rest of "More" (the religion sits with the student) and fees and transport. */
const MORE_KEYS = STUDENT_FORM_FIELDS.filter((f) => (f.group === "More" && f.key !== "religion") || f.group === "Fees and transport").map((f) => f.key);

/**
 * The steps of Add student, in order: Academic, Personal info, Parents, and More details when the school asks for anything of it (a
 * health detail, an emergency number, a fee or bus detail, or a field of its own). A step with nothing to ask is not shown.
 */
export function stepsFor(rules: FieldRules | undefined, custom: readonly CustomFieldDef[] | undefined): AdmitStep[] {
  const more = MORE_KEYS.some((key) => asks(rules, key)) || (custom ?? []).some((f) => f.mode !== "hidden");
  return [STEPS.academic, STEPS.personal, STEPS.parents, ...(more ? [STEPS.more] : [])];
}

/** The boxes of each step, by the first part of the path their message is shown under ("address.city" is "address"). */
const ACADEMIC = new Set(["classId", "sectionId", "rollNumber", "admissionDate", "previousSchool"]);
const PERSONAL = new Set(["firstName", "lastName", "gender", "dateOfBirth", "category", "bloodGroup", "religion", "address", "aadhaarNumber", "samagraId", "apaarId", "pen", "srNumber"]);
// The rest of "More" and fees and transport have the same name as their setting; a field of the school's own is "custom.<key>".
const MORE = new Set<string>([...MORE_KEYS, "custom"]);

/** The step a box belongs to, by the path its message is shown under; null for a path of no box. */
export function stepKeyOfPath(path: string): AdmitStepKey | null {
  const root = path.split(".")[0];
  if (ACADEMIC.has(root)) return "academic";
  if (PERSONAL.has(root)) return "personal";
  if (root === "guardians") return "parents";
  if (MORE.has(root)) return "more";
  return null;
}

/** The boxes of one step that have a message. */
export const problemPathsOf = (problems: Record<string, string>, key: AdmitStepKey): string[] => Object.keys(problems).filter((path) => stepKeyOfPath(path) === key);

/** The index (in `steps`) of the first step that has a message, or -1 when no step shown has one. */
export function firstStepWithProblems(problems: Record<string, string>, steps: readonly AdmitStep[]): number {
  return steps.findIndex((step) => problemPathsOf(problems, step.key).length > 0);
}
