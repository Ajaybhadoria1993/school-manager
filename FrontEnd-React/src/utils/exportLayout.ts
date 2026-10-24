import {
  DEFAULT_EXPORT_LAYOUT,
  DEFAULT_FIELD_RULES,
  EXPORT_COLUMNS,
  MAX_EXPORT_HEADING,
  exportColumnOf,
  fieldOf,
  isCustomKey,
  isLockedColumn,
  type CustomFieldDef,
  type ExportColumnKey,
  type FieldMode,
  type FieldRules,
  type FormFieldKey,
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
// One list for the form and the Excel: a field that is ON is asked on Add student (when it is a box there) and is a column of the file.
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * What the Mandatory switch of a field is:
 *  - `rule`: the school decides (its setting `rule`); a tick (RTE, BPL) is never mandatory;
 *  - `custom`: one of the school's own fields (its own needed / optional);
 *  - `always`: the software needs it whatever the school says (the name, gender, birthday, class and section, the primary parent);
 *  - `auto`: made by the software (the admission number, the age);
 *  - `optional`: always optional on the form (a roll number, a second number, a guardian, the email).
 */
export type FieldNeed =
  | { kind: "rule"; rule: FormFieldKey }
  | { kind: "custom"; field: CustomFieldDef }
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
  if (rule) return { heading, group, need: { kind: "rule", rule }, locked };
  if (ALWAYS.has(key)) return { heading, group, need: { kind: "always" }, locked };
  if (AUTO.has(key)) return { heading, group, need: { kind: "auto" }, locked };
  return { heading, group, need: { kind: "optional" }, locked };
}

/** A tick (yes / no) is never mandatory. */
export const isTick = (rule: FormFieldKey) => "yesNo" in fieldOf(rule) && !!(fieldOf(rule) as { yesNo?: boolean }).yesNo;

/** What a setting becomes when none of its fields is on: not asked (both parents is never "not asked": parents are always on the form). */
const offMode = (rule: FormFieldKey): FieldMode => (rule === "secondParent" ? "optional" : "hidden");

/**
 * The settings the list shows for a layout: a field that is ON is asked (optional unless the school made it mandatory), one that is OFF
 * is not asked and never mandatory. A school's older settings (asked but not in the file, or the other way round) are shown as the list
 * says and are saved that way with the next Save.
 */
export function rulesForLayout(rules: FieldRules, layout: ExportColumn[]): FieldRules {
  const next = { ...rules };
  const on = new Set(layout.map((c) => c.key));
  for (const rule of new Set(Object.values(COLUMN_RULES))) {
    const anyOn = (Object.keys(COLUMN_RULES) as ExportColumnKey[]).some((k) => COLUMN_RULES[k] === rule && on.has(k));
    if (!anyOn) next[rule] = offMode(rule);
    else if (next[rule] === "hidden") next[rule] = "optional";
    if (isTick(rule) && next[rule] === "required") next[rule] = "optional";
  }
  return next;
}

/** The school's own fields as the list shows them: on (asked, in the file) or off (not asked). A tick is never mandatory. */
function customForLayout(custom: CustomFieldDef[], layout: ExportColumn[]): CustomFieldDef[] {
  const on = new Set(layout.map((c) => c.key));
  return custom.map((f) => {
    const mode: FieldMode = !on.has(f.key) ? "hidden" : f.mode === "hidden" || (f.type === "yesNo" && f.mode === "required") ? "optional" : f.mode;
    return mode === f.mode ? f : { ...f, mode };
  });
}

/** One row of the list: a field, whether it is on, and its heading in the Excel. */
export interface FieldRow {
  key: string;
  on: boolean;
  heading: string;
}

/** Everything the Export page changes before it is saved: the list (in its order), the settings, the school's own fields. */
export interface FieldsDraft {
  rows: FieldRow[];
  rules: FieldRules;
  custom: CustomFieldDef[];
}

/** The fields that are on, in the list's order: the Excel's columns. */
export const layoutOf = (draft: FieldsDraft): ExportColumn[] => draft.rows.filter((r) => r.on).map((r) => ({ key: r.key, heading: r.heading }));

/** A draft from a layout: its columns first (on), then every other field of the list and of the school's own (off). */
function draftFrom(layout: ExportColumn[], rules: FieldRules, custom: CustomFieldDef[]): FieldsDraft {
  const on = new Set(layout.map((c) => c.key));
  const rows: FieldRow[] = [
    ...layout.map((c) => ({ key: c.key, on: true, heading: c.heading })),
    ...EXPORT_COLUMNS.filter((c) => !on.has(c.key)).map((c) => ({ key: c.key as string, on: false, heading: c.heading })),
    ...custom.filter((f) => !on.has(f.key)).map((f) => ({ key: f.key, on: false, heading: f.label })),
  ];
  return { rows, rules: rulesForLayout(rules, layout), custom: customForLayout(custom, layout) };
}

/** What is saved, as the page shows it. */
export const draftOf = (settings: StudentSettings): FieldsDraft => draftFrom(settings.exportColumns, settings.fields, settings.customFields);

/** A new school's list; the school's own fields stay, switched off. */
export const defaultDraft = (custom: CustomFieldDef[]): FieldsDraft => draftFrom(defaultLayout(), DEFAULT_FIELD_RULES, custom);

/** The same list, settings and own fields (headings compared as they would be saved). */
export function sameDraft(a: FieldsDraft, b: FieldsDraft): boolean {
  const shape = (d: FieldsDraft) => JSON.stringify([layoutOf(d).map((c) => [c.key, tidyHeading(c.heading)]), d.rules, d.custom]);
  return shape(a) === shape(b);
}

/** With the settings and the school's own fields that the list's columns mean. */
const settle = (draft: FieldsDraft): FieldsDraft => {
  const layout = layoutOf(draft);
  return { ...draft, rules: rulesForLayout(draft.rules, layout), custom: customForLayout(draft.custom, layout) };
};

/** A field switched on or off where it stands: on, it is asked and a column (optional); off, neither. Its place in the list stays. */
export function switchRow(draft: FieldsDraft, key: string, on: boolean): FieldsDraft {
  const rows = draft.rows.map((r) => (r.key === key ? { ...r, on, heading: r.heading.trim() ? r.heading : infoOf(key, draft.custom).heading } : r));
  return settle({ ...draft, rows });
}

/** Mandatory or optional (only for a field that is on and that the school decides about). */
export function setMandatory(draft: FieldsDraft, key: string, required: boolean): FieldsDraft {
  const need = infoOf(key, draft.custom).need;
  const mode: FieldMode = required ? "required" : "optional";
  if (need.kind === "rule") return { ...draft, rules: { ...draft.rules, [need.rule]: mode } };
  if (need.kind === "custom") return { ...draft, custom: draft.custom.map((f) => (f.key === key ? { ...f, mode } : f)) };
  return draft;
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

/** A new field of the school's own: on, at the end of the file (and of the list of fields that are on). */
export function addCustom(draft: FieldsDraft, field: CustomFieldDef): FieldsDraft {
  const lastOn = draft.rows.reduce((last, r, i) => (r.on ? i : last), -1);
  const rows = [...draft.rows];
  rows.splice(lastOn + 1, 0, { key: field.key, on: true, heading: field.label });
  return settle({ ...draft, rows, custom: [...draft.custom, field] });
}

/** A field of the school's own changed (its name, choices, mandatory): a heading that was its old name follows the new one. */
export function editCustom(draft: FieldsDraft, field: CustomFieldDef): FieldsDraft {
  const before = draft.custom.find((f) => f.key === field.key);
  const rows = draft.rows.map((r) => (r.key === field.key && before && tidyHeading(r.heading) === before.label ? { ...r, heading: field.label } : r));
  return settle({ ...draft, rows, custom: draft.custom.map((f) => (f.key === field.key ? field : f)) });
}

/** A field of the school's own deleted: out of the form, the list and the file. */
export const removeCustom = (draft: FieldsDraft, key: string): FieldsDraft =>
  settle({ ...draft, rows: draft.rows.filter((r) => r.key !== key), custom: draft.custom.filter((f) => f.key !== key) });

export const isOwnKey = isCustomKey;
