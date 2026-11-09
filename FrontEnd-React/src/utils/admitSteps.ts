import { MOVABLE_FIELDS, USUAL_STEPS, effectivePlacements, effectiveSteps, isCustomKey, isMovableKey, type AdmitStepKey, type CustomFieldDef, type FieldRules, type FormFieldKey, type Placement, type StepDef } from "../constants/studentFields";
import { asks } from "./fieldRules";

export type { AdmitStepKey };

export interface AdmitStep {
  key: AdmitStepKey;
  /** Its name on the stepper. */
  label: string;
  /** One line saying what is in it. */
  hint: string;
}

const STEPS: Record<string, AdmitStep> = {
  academic: { key: "academic", label: "Academic", hint: "The class and section, the admission date, the previous school and the IDs" },
  personal: { key: "personal", label: "Personal info", hint: "The child and the address" },
  parents: { key: "parents", label: "Parents", hint: "The father, the mother or a guardian" },
  more: { key: "more", label: "More details", hint: "Health, fees, the bus and your own details" },
};

/** The stepper's entry for a step after Parents: More details as it always was, a step of the school's own by its name. */
const stepOfDef = (def: StepDef): AdmitStep => (def.key === "more" ? STEPS.more : { key: def.key, label: def.name, hint: "The details your school asks in this step" });

/** Whether the form asks a placed detail: a detail of the list when the school asks it, one of its own fields unless it is switched off. */
export function isAsked(key: string, rules: FieldRules | undefined, custom: readonly CustomFieldDef[] | undefined): boolean {
  const own = (custom ?? []).find((f) => f.key === key);
  if (own) return own.mode !== "hidden";
  return isMovableKey(key) && asks(rules, key as FormFieldKey);
}

/**
 * The steps of Add student, in order: Personal info, Academic, Parents, then More details and the steps the school added, as it
 * arranged them (`steps`), each only when anything the school asks is placed in it. A step with nothing to ask is not shown.
 * `placements` are where the school put each detail (the usual places when not given).
 */
export function stepsFor(rules: FieldRules | undefined, custom: readonly CustomFieldDef[] | undefined, placements?: readonly Placement[], steps: readonly StepDef[] = USUAL_STEPS): AdmitStep[] {
  const defs = effectiveSteps(steps);
  const placed = placements ?? effectivePlacements(null, custom ?? [], defs);
  const shown = defs.filter((def) => placed.some((p) => p.step === def.key && isAsked(p.key, rules, custom)));
  return [STEPS.personal, STEPS.academic, STEPS.parents, ...shown.map(stepOfDef)];
}

/** The boxes of each step that no school can move, by the first part of the path their message is shown under ("address.city" is "address"). */
const ACADEMIC = new Set(["classId", "sectionId", "rollNumber", "admissionDate", "previousSchool"]);
const PERSONAL = new Set(["firstName", "lastName", "gender", "dateOfBirth", "category", "address"]);

/** The step a detail is in when nothing was moved. */
const USUAL_STEP = new Map<string, AdmitStepKey>(MOVABLE_FIELDS.map((f) => [f.key as string, f.step]));

/**
 * The step a box belongs to, by the path its message is shown under; null for a path of no box. A detail the school can move (and its
 * own fields, "custom.<key>") belongs to the step it was placed in (`placements`; the usual step when not given).
 */
export function stepKeyOfPath(path: string, placements?: readonly Placement[]): AdmitStepKey | null {
  const [root, second] = path.split(".");
  if (ACADEMIC.has(root)) return "academic";
  if (PERSONAL.has(root)) return "personal";
  if (root === "guardians") return "parents";
  const key = root === "custom" ? second : root;
  if (key && (isMovableKey(key) || isCustomKey(key))) return placements?.find((p) => p.key === key)?.step ?? USUAL_STEP.get(key) ?? "more";
  // A message about the school's own fields as a whole.
  return root === "custom" ? "more" : null;
}

/** The boxes of one step that have a message. */
export const problemPathsOf = (problems: Record<string, string>, key: AdmitStepKey, placements?: readonly Placement[]): string[] =>
  Object.keys(problems).filter((path) => stepKeyOfPath(path, placements) === key);

/** The index (in `steps`) of the first step that has a message, or -1 when no step shown has one. */
export function firstStepWithProblems(problems: Record<string, string>, steps: readonly AdmitStep[], placements?: readonly Placement[]): number {
  return steps.findIndex((step) => problemPathsOf(problems, step.key, placements).length > 0);
}
