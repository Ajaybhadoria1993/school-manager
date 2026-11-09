import { ADMIT_STEPS, STEP_NAMES, fieldOf, isMovableKey, type AdmitStepKey, type CustomFieldDef, type Placement, type StepDef } from "../constants/studentFields";

/** What a step is called on Add student's stepper: its usual name, or the name the school gave a step of its own. */
export const stepName = (key: string, steps: readonly StepDef[] = []): string => (STEP_NAMES as Record<string, string>)[key] ?? steps.find((s) => s.key === key)?.name ?? key;

/** Every step of Add student, in order: Personal info, Academic and Parents, then More details and the school's own as it arranged them. */
export const allSteps = (steps: readonly StepDef[]): StepDef[] => [...ADMIT_STEPS.slice(0, 3).map((key) => ({ key: key as string, name: STEP_NAMES[key] })), ...steps];

/** The keys asked in a step, in order. */
export const keysIn = (placements: readonly Placement[], step: AdmitStepKey): string[] => placements.filter((p) => p.step === step).map((p) => p.key);

/** The step a detail is asked in (nothing when it is not a placed detail). */
export const stepOf = (placements: readonly Placement[], key: string): AdmitStepKey | undefined => placements.find((p) => p.key === key)?.step;

/** What the form calls a placed detail: its label, or an own field's name. */
export function labelOfPlaced(key: string, custom: readonly CustomFieldDef[]): string {
  const own = custom.find((f) => f.key === key);
  if (own) return own.label;
  return isMovableKey(key) ? fieldOf(key).label : key;
}

/**
 * Puts a detail in `step`: before `beforeKey` (one of that step's details) or, without it, at the end of the step. The other details
 * keep their steps and their order. A key that is not placed leaves the list as it was.
 */
export function placeIn(placements: readonly Placement[], key: string, step: AdmitStepKey, beforeKey?: string | null): Placement[] {
  if (!placements.some((p) => p.key === key) || beforeKey === key) return [...placements];
  const rest = placements.filter((p) => p.key !== key);
  const before = beforeKey ? rest.findIndex((p) => p.key === beforeKey && p.step === step) : -1;
  let at = before;
  if (at < 0) {
    // The end of the step: right after its last detail; a step with none gets the detail at the end of the list.
    const last = rest.reduce((found, p, i) => (p.step === step ? i : found), -1);
    at = last < 0 ? rest.length : last + 1;
  }
  return [...rest.slice(0, at), { key, step }, ...rest.slice(at)];
}
