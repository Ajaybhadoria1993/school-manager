import {
  ALWAYS_ASKED_RULES,
  DEFAULT_EXPORT_LAYOUT,
  DEFAULT_FIELD_RULES,
  EXPORT_COLUMNS,
  FIXED_RULES,
  MAX_EXPORT_HEADING,
  exportColumnOf,
  fieldOf,
  isCustomKey,
  isLockedColumn,
  MAX_CUSTOM_STEPS,
  MAX_STEP_NAME,
  STEP_NAMES,
  effectivePlacements,
  effectiveSteps,
  newStepKey,
  type AdmitStepKey,
  type CustomFieldDef,
  type ExportColumnKey,
  type FieldMode,
  type FieldRules,
  type FormFieldKey,
  type Placement,
  type StepDef,
} from "../constants/studentFields";
import type { ExportColumn, StudentSettings } from "../types";

/** An Excel column's letters, as the sheet shows them: A … Z, AA, AB … */
export function columnLetters(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    letters = String.fromCharCode(65 + r) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** A heading as the server keeps it: no spaces at the ends, one space between words. */
export const tidyHeading = (heading: string) => heading.trim().replace(/\s+/g, " ");

/** A new school's columns, each under its own heading ("Back to the default"). */
export const defaultLayout = (): ExportColumn[] => DEFAULT_EXPORT_LAYOUT.map((key) => ({ key, heading: exportColumnOf(key).heading }));

/** The layout is the default one (saving it then means "no layout of our own": the server is sent null). */
export const isDefaultLayout = (layout: ExportColumn[]) => JSON.stringify(layout.map((c) => ({ ...c, heading: tidyHeading(c.heading) }))) === JSON.stringify(defaultLayout());

/** What is wrong with each heading, by the column's place (the server's own words): an empty one, a long one, two the same. */
export function layoutProblems(layout: ExportColumn[]): Record<number, string> {
  const problems: Record<number, string> = {};
  const seen = new Set<string>();
  layout.forEach((c, i) => {
    const heading = tidyHeading(c.heading);
    if (!heading) problems[i] = "Enter the heading";
    else if (heading.length > MAX_EXPORT_HEADING) problems[i] = `Keep the heading under ${MAX_EXPORT_HEADING} characters`;
    else if (/[<>]/.test(heading)) problems[i] = "The heading cannot contain < or >";
    else if (seen.has(heading.toLowerCase())) problems[i] = "Two columns cannot have the same heading";
    seen.add(heading.toLowerCase());
  });
  return problems;
}

/**
 * What a file of this layout lacks to be uploaded back through Bulk upload (what every row there needs; the name and the class are in
 * every export): "Date of Birth" (an age is not a birthday), "Gender", "Section", "a parent's mobile".
 */
export function missingForUpload(layout: ExportColumn[]): string[] {
  const has = (key: ExportColumnKey) => layout.some((c) => c.key === key);
  const missing: string[] = [];
  if (!has("dateOfBirth")) missing.push(exportColumnOf("dateOfBirth").heading);
  if (!has("gender")) missing.push(exportColumnOf("gender").heading);
  if (!has("sectionName")) missing.push(exportColumnOf("sectionName").heading);
  if (!has("fatherMobile") && !has("motherMobile") && !has("guardianMobile")) missing.push("a parent's mobile");
  return missing;
}

/** Moves the item at `from` to the place `to`, the others close up. */
export function moveColumn<T>(items: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Two lists, one Mandatory: what the form asks (rules, own fields, steps) and the Excel's columns are arranged on their own; a mandatory
// detail is on the form and a column of the file.
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * What the Mandatory switch of a field is:
 *  - `rule`: the school decides (its setting `rule`); a tick (RTE, BPL) is never mandatory;
 *  - `custom`: one of the school's own fields (its own needed / optional);
 *  - `fixed`: needed whatever the school says, with its own words (the address: "Always"; the previous school: "Class 1–12");
 *  - `always`: the software needs it whatever the school says (the name, gender, birthday, class and section, the primary parent);
 *  - `auto`: made by the software (the admission number, the age);
 *  - `optional`: always optional on the form (a roll number, a second number, a guardian, the email).
 */
export type FieldNeed =
  | { kind: "rule"; rule: FormFieldKey }
  | { kind: "custom"; field: CustomFieldDef }
  | { kind: "fixed"; label: string; title: string }
  | { kind: "always" }
  | { kind: "auto" }
  | { kind: "optional" };

const COLUMN_RULES: Partial<Record<ExportColumnKey, FormFieldKey>> = {
  admissionDate: "admissionDate",
  category: "category",
  bloodGroup: "bloodGroup",
  // Mandatory on the mother's name = the school needs both parents (the father is usually the primary contact, always needed).
  motherName: "secondParent",
  // One setting for every parent's occupation: the two switches move together.
  fatherOccupation: "guardianOccupation",
  motherOccupation: "guardianOccupation",
  address: "addressLine1",
  area: "addressArea",
  city: "addressCity",
  state: "addressState",
  pincode: "addressPincode",
  aadhaarNumber: "aadhaarNumber",
  samagraId: "samagraId",
  apaarId: "apaarId",
  pen: "pen",
  srNumber: "srNumber",
  previousSchool: "previousSchoolName",
  lastClass: "previousSchoolLastClass",
  tcNumber: "previousSchoolTcNumber",
  tcDate: "previousSchoolTcDate",
  religion: "religion",
  nationality: "nationality",
  emergencyMobile: "emergencyMobile",
  disability: "disability",
  medicalNotes: "medicalNotes",
  rteSeat: "rteSeat",
  bpl: "bpl",
  feeConcession: "feeConcession",
  transportRoute: "transportRoute",
  transportStop: "transportStop",
};
const ALWAYS = new Set<string>(["studentName", "firstName", "lastName", "gender", "dateOfBirth", "className", "sectionName", "fatherName", "fatherMobile"]);
const AUTO = new Set<string>(["admissionNumber", "age"]);
export const OWN_GROUP = "Your own";

/** A field of the list or of the school's own: its usual heading, its group, and what its Mandatory is. */
export function infoOf(key: string, custom: CustomFieldDef[]): { heading: string; group: string; need: FieldNeed; locked: boolean } {
  const own = custom.find((f) => f.key === key);
  if (own) return { heading: own.label, group: OWN_GROUP, need: { kind: "custom", field: own }, locked: false };
  const column = EXPORT_COLUMNS.find((c) => c.key === key);
  const heading = column?.heading ?? key;
  const group = column?.group ?? "";
  const locked = !!column && isLockedColumn(column.key);
  const rule = COLUMN_RULES[key as ExportColumnKey];
  if (rule && rule in FIXED_RULES) {
    // The address is always needed; the previous school is needed from Class 1 and not before it: the school has no switch for them.
    return rule === "previousSchoolName"
      ? { heading, group, need: { kind: "fixed", label: "Class 1–12", title: "Needed for Class 1 to 12; optional for Nursery, LKG, UKG" }, locked }
      : { heading, group, need: { kind: "fixed", label: "Always", title: "Always needed: every student has an address" }, locked };
  }
  if (rule) return { heading, group, need: { kind: "rule", rule }, locked };
  if (ALWAYS.has(key)) return { heading, group, need: { kind: "always" }, locked };
  if (AUTO.has(key)) return { heading, group, need: { kind: "auto" }, locked };
  return { heading, group, need: { kind: "optional" }, locked };
}

/** A tick (yes / no) is never mandatory. */
export const isTick = (rule: FormFieldKey) => "yesNo" in fieldOf(rule) && !!(fieldOf(rule) as { yesNo?: boolean }).yesNo;

/** One detail of the admission form: a detail of the list (by its setting) or one of the school's own fields (by its key). */
export type Detail = { kind: "rule"; rule: FormFieldKey } | { kind: "custom"; key: string };

/** The columns of the Excel that come from a detail of the form (the father's and the mother's occupation are two). */
export const columnsOfRule = (rule: FormFieldKey): ExportColumnKey[] => (Object.keys(COLUMN_RULES) as ExportColumnKey[]).filter((k) => COLUMN_RULES[k] === rule);

/** One row of the Excel's list: a column, whether it is in the file, and its heading there. */
export interface FieldRow {
  key: string;
  on: boolean;
  heading: string;
}

/**
 * Everything the Manage fields and Export pages change before it is saved. Two lists that the school arranges on their own: what the
 * Add student form asks (`rules` for the details of the list, `custom` for the school's own fields, `placements` for the step each is
 * asked in) and the Excel's columns (`rows`, in the file's order). They meet in one place: a detail made mandatory is mandatory in
 * both, and so is in both (see `setRequired`).
 */
export interface FieldsDraft {
  rows: FieldRow[];
  rules: FieldRules;
  custom: CustomFieldDef[];
  /** The step of Add student each movable detail and each own field is asked in, in order. */
  placements: Placement[];
  /** The steps after Parents, in order: More details and the school's own. */
  steps: StepDef[];
}

/** The fields that are on, in the list's order: the Excel's columns. */
export const layoutOf = (draft: FieldsDraft): ExportColumn[] => draft.rows.filter((r) => r.on).map((r) => ({ key: r.key, heading: r.heading }));

/** A draft from a layout: its columns first (on), then every other column and own field (off). The form's settings are kept as they are. */
function draftFrom(layout: ExportColumn[], rules: FieldRules, custom: CustomFieldDef[], placements: Placement[], steps: StepDef[]): FieldsDraft {
  const on = new Set(layout.map((c) => c.key));
  const rows: FieldRow[] = [
    ...layout.map((c) => ({ key: c.key, on: true, heading: c.heading })),
    ...EXPORT_COLUMNS.filter((c) => !on.has(c.key)).map((c) => ({ key: c.key as string, on: false, heading: c.heading })),
    ...custom.filter((f) => !on.has(f.key)).map((f) => ({ key: f.key, on: false, heading: f.label })),
  ];
  const own = effectiveSteps(steps);
  return { rows, rules, custom, placements: effectivePlacements(placements, custom, own), steps: own };
}

/** What is saved, as the page shows it. */
export const draftOf = (settings: StudentSettings): FieldsDraft => draftFrom(settings.exportColumns, settings.fields, settings.customFields, settings.placements, settings.steps);

/** A new school's form and Excel; the school's own fields stay, not asked and not in the file. */
export const defaultDraft = (custom: CustomFieldDef[]): FieldsDraft =>
  draftFrom(defaultLayout(), DEFAULT_FIELD_RULES, custom.map((f) => (f.mode === "hidden" ? f : { ...f, mode: "hidden" as const })), effectivePlacements(null, custom), []);

/**
 * A new school's Excel only: the columns and headings a new school starts with, the form and the school's own fields left as they are.
 * The columns of what the school made mandatory stay in the file (a mandatory detail is always a column), and its own fields stay out.
 */
export function defaultColumnsDraft(draft: FieldsDraft): FieldsDraft {
  const base = draftFrom(defaultLayout(), draft.rules, draft.custom, draft.placements, draft.steps);
  return withColumnsOn(base, base.rows.filter((r) => columnIsMandatory(base, r.key)).map((r) => r.key));
}

/** The same form, columns and own fields (headings compared as they would be saved). */
export function sameDraft(a: FieldsDraft, b: FieldsDraft): boolean {
  const shape = (d: FieldsDraft) => JSON.stringify([layoutOf(d).map((c) => [c.key, tidyHeading(c.heading)]), d.rules, d.custom, d.placements, d.steps]);
  return shape(a) === shape(b);
}

const modeOfDetail = (draft: FieldsDraft, detail: Detail): FieldMode => (detail.kind === "rule" ? draft.rules[detail.rule] : (draft.custom.find((f) => f.key === detail.key)?.mode ?? "hidden"));
/** The form asks the detail (mandatory or optional). */
export const isAskedDetail = (draft: FieldsDraft, detail: Detail) => modeOfDetail(draft, detail) !== "hidden";
/** The detail is mandatory (on the form and in the Excel alike). */
export const isRequiredDetail = (draft: FieldsDraft, detail: Detail) => modeOfDetail(draft, detail) === "required";

/** The detail a column of the Excel comes from, when it comes from one the school decides about (its own field, or a detail of the list). */
export function detailOfColumn(key: string, custom: CustomFieldDef[]): Detail | null {
  if (custom.some((f) => f.key === key)) return { kind: "custom", key };
  const rule = COLUMN_RULES[key as ExportColumnKey];
  return rule ? { kind: "rule", rule } : null;
}

/** The column has to stay in the Excel: one every school has, or the column of a mandatory detail. */
export function columnIsMandatory(draft: FieldsDraft, key: string): boolean {
  if (infoOf(key, draft.custom).locked) return true;
  const detail = detailOfColumn(key, draft.custom);
  return !!detail && isRequiredDetail(draft, detail);
}

/** With these columns in the file (a column whose heading was emptied gets its usual one back). */
const withColumnsOn = (draft: FieldsDraft, keys: string[]): FieldsDraft => ({
  ...draft,
  rows: draft.rows.map((r) => (keys.includes(r.key) ? { ...r, on: true, heading: r.heading.trim() ? r.heading : infoOf(r.key, draft.custom).heading } : r)),
});

/**
 * A column in or out of the Excel, where it stands (its place in the list stays). It does not change what the form asks. A column that
 * has to stay (the details every school has, the column of a mandatory detail) cannot be taken out: the list stays as it was.
 */
export function switchRow(draft: FieldsDraft, key: string, on: boolean): FieldsDraft {
  if (!on && columnIsMandatory(draft, key)) return draft;
  return withColumnsOn({ ...draft, rows: draft.rows.map((r) => (r.key === key ? { ...r, on } : r)) }, on ? [key] : []);
}

/**
 * Mandatory or optional, for the form and the Excel at once (it is one setting). Mandatory means the form asks it and the Excel has
 * its columns, so the columns come into the file when they were out. A tick (RTE, an own Yes / No) and the details no school can
 * change are not the school's to make mandatory: the draft stays as it was.
 */
export function setRequired(draft: FieldsDraft, detail: Detail, required: boolean): FieldsDraft {
  const mode: FieldMode = required ? "required" : "optional";
  if (detail.kind === "rule") {
    if (isTick(detail.rule) || detail.rule in FIXED_RULES) return draft;
    return withColumnsOn({ ...draft, rules: { ...draft.rules, [detail.rule]: mode } }, required ? columnsOfRule(detail.rule) : []);
  }
  const field = draft.custom.find((f) => f.key === detail.key);
  if (!field || field.type === "yesNo") return draft;
  return withColumnsOn({ ...draft, custom: draft.custom.map((f) => (f.key === detail.key ? { ...f, mode } : f)) }, required ? [detail.key] : []);
}

/** Mandatory or optional from a column of the Excel (only for a column whose detail the school decides about). */
export function setMandatory(draft: FieldsDraft, key: string, required: boolean): FieldsDraft {
  const need = infoOf(key, draft.custom).need;
  if (need.kind === "rule") return setRequired(draft, { kind: "rule", rule: need.rule }, required);
  if (need.kind === "custom") return setRequired(draft, { kind: "custom", key }, required);
  return draft;
}

/**
 * The form asks a detail or does not (it does not change the Excel). Not asked, it is not mandatory either. What the form always asks
 * (the address, the category) cannot be switched off, and both parents are never "not asked" (optional is the least).
 */
export function setAsked(draft: FieldsDraft, detail: Detail, asked: boolean): FieldsDraft {
  if (detail.kind === "rule") {
    if (detail.rule in FIXED_RULES || (ALWAYS_ASKED_RULES as readonly FormFieldKey[]).includes(detail.rule)) return draft;
    const current = draft.rules[detail.rule];
    const mode: FieldMode = asked ? (current === "hidden" ? "optional" : current) : detail.rule === "secondParent" ? "optional" : "hidden";
    return { ...draft, rules: { ...draft.rules, [detail.rule]: mode } };
  }
  return { ...draft, custom: draft.custom.map((f) => (f.key === detail.key ? { ...f, mode: asked ? (f.mode === "hidden" ? "optional" : f.mode) : "hidden" } : f)) };
}

export const renameRow = (draft: FieldsDraft, key: string, heading: string): FieldsDraft => ({ ...draft, rows: draft.rows.map((r) => (r.key === key ? { ...r, heading } : r)) });

/**
 * A field that is on, one column earlier (-1, up) or later (+1, down) in the Excel: it passes the next field that is on (the ones that
 * are off, in between, do not count).
 */
export function stepRow(draft: FieldsDraft, key: string, step: -1 | 1): FieldsDraft {
  const from = draft.rows.findIndex((r) => r.key === key);
  let to = from + step;
  while (to >= 0 && to < draft.rows.length && !draft.rows[to].on) to += step;
  if (from < 0 || to < 0 || to >= draft.rows.length) return draft;
  return { ...draft, rows: moveColumn(draft.rows, from, to) };
}

/** A field dragged onto another's place in the list. */
export const dragRow = (draft: FieldsDraft, from: number, to: number): FieldsDraft => ({ ...draft, rows: moveColumn(draft.rows, from, to) });

/** A yes / no field is never mandatory. */
const tidyField = (field: CustomFieldDef): CustomFieldDef => (field.type === "yesNo" && field.mode === "required" ? { ...field, mode: "optional" } : field);

/**
 * A new field of the school's own: asked as it says (optional, or mandatory), a column at the end of the file (and of the list of
 * columns that are on), and asked at the end of `step` of Add student (More details unless said).
 */
export function addCustom(draft: FieldsDraft, field: CustomFieldDef, step: AdmitStepKey = "more"): FieldsDraft {
  const own = tidyField(field);
  const lastOn = draft.rows.reduce((last, r, i) => (r.on ? i : last), -1);
  const rows = [...draft.rows];
  rows.splice(lastOn + 1, 0, { key: own.key, on: true, heading: own.label });
  return { ...draft, rows, custom: [...draft.custom, own], placements: [...draft.placements, { key: own.key, step }] };
}

/** A field of the school's own changed (its name, choices, mandatory): a heading that was its old name follows the new one; mandatory brings its column in. */
export function editCustom(draft: FieldsDraft, field: CustomFieldDef): FieldsDraft {
  const own = tidyField(field);
  const before = draft.custom.find((f) => f.key === own.key);
  const rows = draft.rows.map((r) => (r.key === own.key && before && tidyHeading(r.heading) === before.label ? { ...r, heading: own.label } : r));
  return withColumnsOn({ ...draft, rows, custom: draft.custom.map((f) => (f.key === own.key ? own : f)) }, own.mode === "required" ? [own.key] : []);
}

/** A field of the school's own deleted: out of the form, the Excel and its step. */
export const removeCustom = (draft: FieldsDraft, key: string): FieldsDraft => ({
  ...draft,
  rows: draft.rows.filter((r) => r.key !== key),
  custom: draft.custom.filter((f) => f.key !== key),
  placements: draft.placements.filter((p) => p.key !== key),
});

/** What is wrong with the name of a step, in the server's words (nothing when it is fine). `exceptKey` is the step being renamed. */
export function stepNameProblem(name: string, steps: readonly StepDef[], exceptKey?: string): string | undefined {
  const tidy = name.trim().replace(/\s+/g, " ");
  if (tidy.length < 2 || tidy.length > MAX_STEP_NAME) return `The name of a step is 2 to ${MAX_STEP_NAME} characters`;
  if (/[<>]/.test(tidy)) return "The name cannot contain < or >";
  const taken = [...Object.values(STEP_NAMES), ...steps.filter((x) => x.key !== "more" && x.key !== exceptKey).map((x) => x.name)].find((n) => n.toLowerCase() === tidy.toLowerCase());
  return taken ? `There is already a step called ${taken}` : undefined;
}

/** A step of the school's own, after the others (up to MAX_CUSTOM_STEPS; a name with a problem adds nothing). */
export function addStep(draft: FieldsDraft, name: string): FieldsDraft {
  if (draft.steps.length - 1 >= MAX_CUSTOM_STEPS || stepNameProblem(name, draft.steps)) return draft;
  return { ...draft, steps: [...draft.steps, { key: newStepKey(), name: name.trim().replace(/\s+/g, " ") }] };
}

/** A step of the school's own under another name (More details keeps its own). */
export const renameStep = (draft: FieldsDraft, key: string, name: string): FieldsDraft =>
  key === "more" || stepNameProblem(name, draft.steps, key) ? draft : { ...draft, steps: draft.steps.map((x) => (x.key === key ? { ...x, name: name.trim().replace(/\s+/g, " ") } : x)) };

/** A step of the school's own taken out: its details go to More details. More details stays. */
export const removeStep = (draft: FieldsDraft, key: string): FieldsDraft =>
  key === "more" ? draft : { ...draft, steps: draft.steps.filter((x) => x.key !== key), placements: draft.placements.map((p) => (p.step === key ? { ...p, step: "more" } : p)) };

/** A step one place earlier (-1) or later (+1) among the steps after Parents (More details can move too). */
export function moveStep(draft: FieldsDraft, key: string, dir: -1 | 1): FieldsDraft {
  const at = draft.steps.findIndex((x) => x.key === key);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= draft.steps.length) return draft;
  return { ...draft, steps: moveColumn(draft.steps, at, to) };
}

/** The steps of Add student the fields are asked in, changed (the Excel's list stays as it is). */
export const setPlacements = (draft: FieldsDraft, placements: Placement[]): FieldsDraft => ({ ...draft, placements });

export const isOwnKey = isCustomKey;
