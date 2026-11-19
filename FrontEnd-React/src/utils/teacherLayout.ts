import type { CustomFieldDef, FieldMode } from "../constants/studentFields";
import { DEFAULT_TEACHER_RULES, TEACHER_COLUMNS, TEACHER_DETAILS, teacherColumnOf, type TeacherDetailKey, type TeacherFieldRules } from "../constants/teacherFields";
import type { ExportColumn, TeacherSettings } from "../types";
import { moveColumn, tidyHeading } from "./exportLayout";

/**
 * Teacher > Manage fields and Teacher > Export, the way the students' pages work (`utils/exportLayout.ts`), with one difference that
 * makes them smaller: a usual detail and its Excel column have the same key. Two lists the school arranges on their own, with one
 * Mandatory: what Add teacher asks (`rules` for the usual details, `custom` for the school's own fields) and the Excel's columns (`rows`,
 * in the file's order). A detail made mandatory is on the form and a column of the file.
 */

/** What the Mandatory switch of a column is: the school decides (`rule`, `custom`), the software always needs it, or it is made by the software. */
export type TeacherNeed = { kind: "rule"; rule: TeacherDetailKey } | { kind: "custom"; field: CustomFieldDef } | { kind: "always" } | { kind: "auto" };

/** One detail of Add teacher: a usual one (by its key) or one of the school's own fields (by its `c_` key). */
export type TeacherDetail = { kind: "rule"; rule: TeacherDetailKey } | { kind: "custom"; key: string };

/** One row of the Excel's list: a column, whether it is in the file, and its heading there. */
export interface TeacherRow {
  key: string;
  on: boolean;
  heading: string;
}

export interface TeacherFieldsDraft {
  rows: TeacherRow[];
  rules: TeacherFieldRules;
  custom: CustomFieldDef[];
}

const RULE_KEYS = new Set<string>(TEACHER_DETAILS.map((d) => d.key));
/** Asked on Add teacher whatever the school says: the person and the login. */
const ALWAYS = new Set(["name", "mobile", "gender", "username"]);

export const OWN_GROUP = "Your own";

/** A column of the list or one of the school's own fields: its usual heading, its group and what its Mandatory is. */
export function infoOf(key: string, custom: CustomFieldDef[]): { heading: string; group: string; need: TeacherNeed; locked: boolean } {
  const own = custom.find((f) => f.key === key);
  if (own) return { heading: own.label, group: OWN_GROUP, need: { kind: "custom", field: own }, locked: false };
  const column = teacherColumnOf(key);
  const heading = column?.heading ?? key;
  const group = column?.group ?? "";
  const locked = !!column?.locked;
  if (RULE_KEYS.has(key)) return { heading, group, need: { kind: "rule", rule: key as TeacherDetailKey }, locked };
  if (ALWAYS.has(key)) return { heading, group, need: { kind: "always" }, locked };
  return { heading, group, need: { kind: "auto" }, locked };
}

/** A new school's Excel: the usual columns, the school's own fields it asks, then the columns that only say more (the server's `defaultLayout`). */
export function defaultTeacherLayout(custom: CustomFieldDef[]): ExportColumn[] {
  const usual = TEACHER_COLUMNS.filter((c) => !c.extra).map((c) => ({ key: c.key, heading: c.heading }));
  const own = custom.filter((f) => f.mode !== "hidden").map((f) => ({ key: f.key, heading: f.label }));
  const extras = TEACHER_COLUMNS.filter((c) => c.extra).map((c) => ({ key: c.key, heading: c.heading }));
  return [...usual, ...own, ...extras];
}

/** The fields that are on, in the list's order: the Excel's columns. */
export const teacherLayoutOf = (draft: TeacherFieldsDraft): ExportColumn[] => draft.rows.filter((r) => r.on).map((r) => ({ key: r.key, heading: r.heading }));

/** A draft from a layout: its columns first (on), then every other column and own field (off). */
function draftFrom(layout: ExportColumn[], rules: TeacherFieldRules, custom: CustomFieldDef[]): TeacherFieldsDraft {
  const on = new Set(layout.map((c) => c.key));
  const rows: TeacherRow[] = [
    ...layout.map((c) => ({ key: c.key, on: true, heading: c.heading })),
    ...TEACHER_COLUMNS.filter((c) => !on.has(c.key)).map((c) => ({ key: c.key, on: false, heading: c.heading })),
    ...custom.filter((f) => !on.has(f.key)).map((f) => ({ key: f.key, on: false, heading: f.label })),
  ];
  return { rows, rules, custom };
}

/** What is saved, as the page shows it. */
export const teacherDraftOf = (settings: TeacherSettings): TeacherFieldsDraft => draftFrom(settings.exportColumns, { ...DEFAULT_TEACHER_RULES, ...settings.fields }, settings.customFields);

/** A new school's form and Excel; the school's own fields stay, not asked and not in the file. */
export const defaultTeacherDraft = (custom: CustomFieldDef[]): TeacherFieldsDraft => {
  const hidden = custom.map((f) => (f.mode === "hidden" ? f : { ...f, mode: "hidden" as const }));
  return draftFrom(defaultTeacherLayout(hidden), DEFAULT_TEACHER_RULES, hidden);
};

/** The same form, columns and own fields (headings compared as they would be saved). */
export function sameTeacherDraft(a: TeacherFieldsDraft, b: TeacherFieldsDraft): boolean {
  const shape = (d: TeacherFieldsDraft) => JSON.stringify([teacherLayoutOf(d).map((c) => [c.key, tidyHeading(c.heading)]), d.rules, d.custom]);
  return shape(a) === shape(b);
}

/** The layout is a new school's (saving it then means "no layout of our own": the server is sent null). */
export const isDefaultTeacherLayout = (layout: ExportColumn[], custom: CustomFieldDef[]) =>
  JSON.stringify(layout.map((c) => [c.key, tidyHeading(c.heading)])) === JSON.stringify(defaultTeacherLayout(custom).map((c) => [c.key, c.heading]));

const modeOf = (draft: TeacherFieldsDraft, detail: TeacherDetail): FieldMode => (detail.kind === "rule" ? draft.rules[detail.rule] : (draft.custom.find((f) => f.key === detail.key)?.mode ?? "hidden"));
/** The form asks the detail (mandatory or optional). */
export const isAskedDetail = (draft: TeacherFieldsDraft, detail: TeacherDetail) => modeOf(draft, detail) !== "hidden";
/** The detail is mandatory (on the form and in the Excel alike). */
export const isRequiredDetail = (draft: TeacherFieldsDraft, detail: TeacherDetail) => modeOf(draft, detail) === "required";

/** The detail a column of the Excel comes from, when it comes from one the school decides about (its own field, or a usual detail). */
export function detailOfColumn(key: string, custom: CustomFieldDef[]): TeacherDetail | null {
  if (custom.some((f) => f.key === key)) return { kind: "custom", key };
  return RULE_KEYS.has(key) ? { kind: "rule", rule: key as TeacherDetailKey } : null;
}

/** The column has to stay in the Excel: the name and the mobile number, or the column of a mandatory detail. */
export function columnIsMandatory(draft: TeacherFieldsDraft, key: string): boolean {
  if (infoOf(key, draft.custom).locked) return true;
  const detail = detailOfColumn(key, draft.custom);
  return !!detail && isRequiredDetail(draft, detail);
}

/** With these columns in the file (a column whose heading was emptied gets its usual one back). */
const withColumnsOn = (draft: TeacherFieldsDraft, keys: string[]): TeacherFieldsDraft => ({
  ...draft,
  rows: draft.rows.map((r) => (keys.includes(r.key) ? { ...r, on: true, heading: r.heading.trim() ? r.heading : infoOf(r.key, draft.custom).heading } : r)),
});

/**
 * A new school's Excel only: the columns and headings a new school starts with, the form and the school's own fields left as they are.
 * The columns of what the school made mandatory stay in the file, and its own fields it asks come with the usual layout.
 */
export function defaultTeacherColumnsDraft(draft: TeacherFieldsDraft): TeacherFieldsDraft {
  const base = draftFrom(defaultTeacherLayout(draft.custom), draft.rules, draft.custom);
  return withColumnsOn(base, base.rows.filter((r) => columnIsMandatory(base, r.key)).map((r) => r.key));
}

/**
 * A column in or out of the Excel, where it stands (its place in the list stays). It does not change what the form asks. A column that
 * has to stay (the name, the mobile number, the column of a mandatory detail) cannot be taken out: the list stays as it was.
 */
export function switchTeacherRow(draft: TeacherFieldsDraft, key: string, on: boolean): TeacherFieldsDraft {
  if (!on && columnIsMandatory(draft, key)) return draft;
  return withColumnsOn({ ...draft, rows: draft.rows.map((r) => (r.key === key ? { ...r, on } : r)) }, on ? [key] : []);
}

/**
 * Mandatory or optional, for the form and the Excel at once (it is one setting). Mandatory means the form asks it and the Excel has its
 * column, so the column comes into the file when it was out. A yes / no tick is never mandatory: the draft stays as it was.
 */
export function setTeacherRequired(draft: TeacherFieldsDraft, detail: TeacherDetail, required: boolean): TeacherFieldsDraft {
  const mode: FieldMode = required ? "required" : "optional";
  if (detail.kind === "rule") return withColumnsOn({ ...draft, rules: { ...draft.rules, [detail.rule]: mode } }, required ? [detail.rule] : []);
  const field = draft.custom.find((f) => f.key === detail.key);
  if (!field || field.type === "yesNo") return draft;
  return withColumnsOn({ ...draft, custom: draft.custom.map((f) => (f.key === detail.key ? { ...f, mode } : f)) }, required ? [detail.key] : []);
}

/** Mandatory or optional from a column of the Excel (only for a column whose detail the school decides about). */
export function setTeacherMandatory(draft: TeacherFieldsDraft, key: string, required: boolean): TeacherFieldsDraft {
  const detail = detailOfColumn(key, draft.custom);
  return detail ? setTeacherRequired(draft, detail, required) : draft;
}

/** The form asks a detail or does not (it does not change the Excel). Not asked, it is not mandatory either. */
export function setTeacherAsked(draft: TeacherFieldsDraft, detail: TeacherDetail, asked: boolean): TeacherFieldsDraft {
  if (detail.kind === "rule") {
    const current = draft.rules[detail.rule];
    return { ...draft, rules: { ...draft.rules, [detail.rule]: asked ? (current === "hidden" ? "optional" : current) : "hidden" } };
  }
  return { ...draft, custom: draft.custom.map((f) => (f.key === detail.key ? { ...f, mode: asked ? (f.mode === "hidden" ? "optional" : f.mode) : "hidden" } : f)) };
}

export const renameTeacherRow = (draft: TeacherFieldsDraft, key: string, heading: string): TeacherFieldsDraft => ({ ...draft, rows: draft.rows.map((r) => (r.key === key ? { ...r, heading } : r)) });

/** A field that is on, one column earlier (-1, up) or later (+1, down) in the Excel: it passes the next field that is on (the ones off, in between, do not count). */
export function stepTeacherRow(draft: TeacherFieldsDraft, key: string, step: -1 | 1): TeacherFieldsDraft {
  const from = draft.rows.findIndex((r) => r.key === key);
  let to = from + step;
  while (to >= 0 && to < draft.rows.length && !draft.rows[to].on) to += step;
  if (from < 0 || to < 0 || to >= draft.rows.length) return draft;
  return { ...draft, rows: moveColumn(draft.rows, from, to) };
}

/** A yes / no field is never mandatory. */
const tidyField = (field: CustomFieldDef): CustomFieldDef => (field.type === "yesNo" && field.mode === "required" ? { ...field, mode: "optional" } : field);

/** A new field of the school's own: asked as it says, and a column at the end of the file (before the columns that only say more). */
export function addTeacherCustom(draft: TeacherFieldsDraft, field: CustomFieldDef): TeacherFieldsDraft {
  const own = tidyField(field);
  const firstExtra = draft.rows.findIndex((r) => r.on && teacherColumnOf(r.key)?.extra);
  const lastOn = draft.rows.reduce((last, r, i) => (r.on ? i : last), -1);
  const at = firstExtra >= 0 ? firstExtra : lastOn + 1;
  const rows = [...draft.rows];
  rows.splice(at, 0, { key: own.key, on: own.mode !== "hidden", heading: own.label });
  return { ...draft, rows, custom: [...draft.custom, own] };
}

/** A field of the school's own changed (its name, choices, mandatory): a heading that was its old name follows the new one; mandatory brings its column in. */
export function editTeacherCustom(draft: TeacherFieldsDraft, field: CustomFieldDef): TeacherFieldsDraft {
  const own = tidyField(field);
  const before = draft.custom.find((f) => f.key === own.key);
  const rows = draft.rows.map((r) => (r.key === own.key && before && tidyHeading(r.heading) === before.label ? { ...r, heading: own.label } : r));
  return withColumnsOn({ ...draft, rows, custom: draft.custom.map((f) => (f.key === own.key ? own : f)) }, own.mode === "required" ? [own.key] : []);
}

/** A field of the school's own deleted: out of the form and the Excel. */
export const removeTeacherCustom = (draft: TeacherFieldsDraft, key: string): TeacherFieldsDraft => ({
  ...draft,
  rows: draft.rows.filter((r) => r.key !== key),
  custom: draft.custom.filter((f) => f.key !== key),
});
