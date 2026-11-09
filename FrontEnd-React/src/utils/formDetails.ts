import { fieldOf, isMovableKey, type AdmitStepKey, type FormFieldKey } from "../constants/studentFields";
import { isAskedDetail, isRequiredDetail, isTick, type Detail, type FieldsDraft } from "./exportLayout";
import { allSteps, keysIn, labelOfPlaced } from "./placement";

/**
 * What the school can do with a row of the Add student form: nothing (the form always asks it), only mandatory or optional (the
 * category, both parents), nothing because the software decides (the address, the previous school's name), or ask it or not and make it
 * mandatory or optional.
 */
export type RowControl = "always" | "mandatory" | "fixed" | "asked";

/** One row of Manage fields' picture of the Add student form. */
export interface FormRow {
  /** The key of the detail, of the school's own field, or a name for a box no school decides about. */
  id: string;
  label: string;
  step: AdmitStepKey;
  control: RowControl;
  /** The setting behind the row (a detail of the list, or an own field); none for a box the form always asks. */
  detail?: Detail;
  /** A word under the label that says what the school cannot change ("Mandatory from Class 1"). */
  note?: string;
  /** The row can be dragged to another step (a detail of the list the school may move, or an own field). */
  movable: boolean;
  own: boolean;
  asked: boolean;
  mandatory: boolean;
  /** Mandatory can be switched (a yes / no tick is never mandatory). */
  canRequire: boolean;
}

interface Fixed {
  id: string;
  label: string;
  control: RowControl;
  rule?: FormFieldKey;
  note?: string;
  /** A box the form always asks that may be left empty. */
  optional?: boolean;
}

const always = (id: string, label: string, optional = false): Fixed => ({ id, label, control: "always", optional });
const detail = (rule: FormFieldKey, label: string, control: RowControl, note?: string): Fixed => ({ id: rule, label, control, rule, note });

/** What each of the first three steps always has, in the order of the form (Student, Address, ...), whatever the school decides about the rest. */
const FIXED: Record<string, Fixed[]> = {
  personal: [
    always("firstName", "First name"),
    always("lastName", "Last name"),
    always("gender", "Gender"),
    always("dateOfBirth", "Date of birth"),
    detail("category", "Category", "mandatory"),
    detail("addressLine1", "House and street", "fixed"),
    detail("addressArea", "Area or landmark", "asked"),
    detail("addressCity", "City or village", "fixed"),
    detail("addressState", "State", "fixed"),
    detail("addressPincode", "PIN code", "fixed"),
  ],
  academic: [
    always("classId", "Class and section"),
    always("rollNumber", "Roll number", true),
    detail("admissionDate", "Admission date", "asked"),
    detail("previousSchoolName", "Previous school's name", "fixed", "Mandatory from Class 1"),
    detail("previousSchoolLastClass", "Last class there", "asked"),
    detail("previousSchoolTcNumber", "TC number", "asked"),
    detail("previousSchoolTcDate", "TC date", "asked"),
  ],
  parents: [
    always("guardianName", "Full name"),
    always("guardianRelation", "Relation"),
    always("guardianMobile", "Mobile number"),
    always("guardianAlternate", "Another number", true),
    detail("guardianOccupation", "Occupation", "asked"),
    always("guardianEmail", "Email", true),
    detail("secondParent", "Both parents (father and mother)", "mandatory"),
  ],
};

const ruleDetail = (rule: FormFieldKey): Detail => ({ kind: "rule", rule });

/** A row for a detail of the list or an own field, in the state the draft has. */
function stateRow(draft: FieldsDraft, base: Pick<FormRow, "id" | "label" | "step" | "control" | "note" | "movable" | "own">, d: Detail, canRequire: boolean): FormRow {
  return { ...base, detail: d, asked: isAskedDetail(draft, d), mandatory: isRequiredDetail(draft, d), canRequire };
}

/** What one step of the form shows. */
export interface StepRows {
  fixed: FormRow[];
  asked: FormRow[];
  notAsked: FormRow[];
}

/**
 * The Add student form as Manage fields shows it, step by step (the steps of `allSteps`, by key): for each step the boxes it always has
 * (`fixed`, in the form's order; only the first three steps have any), then the details the school placed in it and asks (`asked`, in
 * its order) and the ones placed in it that the school does not ask (`notAsked`: dimmed, to be switched on).
 */
export function formSteps(draft: FieldsDraft): Record<string, StepRows> {
  const out: Record<string, StepRows> = {};
  for (const { key: step } of allSteps(draft.steps)) {
    const fixed = (FIXED[step] ?? []).map((f): FormRow => {
      const base = { id: f.id, label: f.label, step, control: f.control, note: f.note, movable: false, own: false };
      if (!f.rule) return { ...base, asked: true, mandatory: !f.optional, canRequire: false };
      const row = stateRow(draft, base, ruleDetail(f.rule), !isTick(f.rule) && f.control !== "fixed");
      // What the form always asks is asked, whatever an old setting says; the software's own needs are mandatory.
      return f.control === "fixed" ? { ...row, asked: true, mandatory: true } : f.control === "mandatory" ? { ...row, asked: true } : row;
    });
    const placed = keysIn(draft.placements, step).map((key): FormRow => {
      const own = draft.custom.find((f) => f.key === key);
      if (own) return stateRow(draft, { id: key, label: own.label, step, control: "asked", movable: true, own: true }, { kind: "custom", key }, own.type !== "yesNo");
      const rule = key as FormFieldKey;
      return stateRow(draft, { id: key, label: labelOfPlaced(key, draft.custom), step, control: "asked", movable: isMovableKey(key), own: false }, ruleDetail(rule), !isTick(rule));
    });
    out[step] = { fixed, asked: placed.filter((r) => r.asked), notAsked: placed.filter((r) => !r.asked) };
  }
  return out;
}

/** The label the form uses for a detail of the list (for a row built elsewhere). */
export const labelOfRule = (rule: FormFieldKey) => fieldOf(rule).label;
