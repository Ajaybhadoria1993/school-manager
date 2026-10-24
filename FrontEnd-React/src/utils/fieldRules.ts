import { DEFAULT_FIELD_RULES, type FieldMode, type FieldRules, type FormFieldKey } from "../constants/studentFields";

/** How this school wants a detail (its settings, or the defaults while they load). */
export const modeOf = (rules: FieldRules | undefined, key: FormFieldKey): FieldMode => rules?.[key] ?? DEFAULT_FIELD_RULES[key];
/** The form asks for it (needed or optional). */
export const asks = (rules: FieldRules | undefined, key: FormFieldKey) => modeOf(rules, key) !== "hidden";
/** The form may leave it empty (its label says "optional"). */
export const mayLeave = (rules: FieldRules | undefined, key: FormFieldKey) => modeOf(rules, key) !== "required";
