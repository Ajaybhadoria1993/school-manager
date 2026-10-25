import {
  ALWAYS_ASKED_RULES,
  DEFAULT_FIELD_RULES,
  FIXED_RULES,
  PREVIOUS_SCHOOL_RULES,
  type FieldMode,
  type FieldRules,
  type FormFieldKey,
} from "../constants/studentFields";
import { classNumber } from "./classNumber";

/**
 * What a school needs of ONE admission: its rules with what no school can change put right (the address is always needed, the category
 * always asked) and the previous school needed only for a student of Class 1 to 12 (`className` is the class chosen; before one is
 * chosen, or for Nursery, LKG, UKG..., it is optional). The server holds an admission to the same rules (`needsForClass`).
 */
export function effectiveRules(rules: FieldRules, className: string | null | undefined): FieldRules {
  const next: FieldRules = { ...rules, ...FIXED_RULES };
  for (const key of ALWAYS_ASKED_RULES) if (next[key] === "hidden") next[key] = "optional";
  if (!className || classNumber(className) === null) for (const key of PREVIOUS_SCHOOL_RULES) if (next[key] === "required") next[key] = "optional";
  return next;
}

/** How this school wants a detail (its settings, or the defaults while they load). */
export const modeOf = (rules: FieldRules | undefined, key: FormFieldKey): FieldMode => rules?.[key] ?? DEFAULT_FIELD_RULES[key];
/** The form asks for it (needed or optional). */
export const asks = (rules: FieldRules | undefined, key: FormFieldKey) => modeOf(rules, key) !== "hidden";
/** The form may leave it empty (its label says "optional"). */
export const mayLeave = (rules: FieldRules | undefined, key: FormFieldKey) => modeOf(rules, key) !== "required";
