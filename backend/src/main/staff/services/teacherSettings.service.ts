import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import type { CustomFieldDef } from "../../students/constants";
import { customIssues } from "../../students/schemas/students.schemas";
import {
  DEFAULT_TEACHER_RULES,
  LOCKED_TEACHER_COLUMNS,
  TEACHER_COLUMN_KEYS,
  TEACHER_DETAILS,
  TEACHER_EXPORT_COLUMNS,
  type TeacherDetailKey,
  type TeacherFieldRules,
} from "../constants";
import { TeacherSettings, type ITeacherExportColumn } from "../models/TeacherSettings";
import type { UpdateTeacherSettingsInput } from "../schemas/staff.schemas";

export interface TeacherSettingsDto {
  /** What Add teacher needs of each usual detail (needed, optional or not asked): the details not decided are optional. */
  fields: TeacherFieldRules;
  customFields: CustomFieldDef[];
  /** The columns of the Excel, in order, under their headings (the school's own, or the usual layout). */
  exportColumns: ITeacherExportColumn[];
  /** The Excel is still the usual layout (nothing of the school's own saved). */
  exportIsDefault: boolean;
}

/** A teacher's answers, ready to keep: what is given (`set`, tidy) and what a change clears (`clear`). */
export interface CleanAnswers {
  set: Record<string, string | number | boolean>;
  clear: string[];
}

const empty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && value.trim() === "");

const headingOf = (key: string) => TEACHER_EXPORT_COLUMNS.find((c) => c.key === key)?.heading ?? key;

/** A new school's Excel: the usual columns, the school's own fields it asks, then the columns that only say more about the teacher. */
export function defaultLayout(custom: CustomFieldDef[]): ITeacherExportColumn[] {
  const usual = TEACHER_EXPORT_COLUMNS.filter((c) => !c.extra).map((c) => ({ key: c.key, heading: c.heading }));
  const own = custom.filter((f) => f.mode !== "hidden").map((f) => ({ key: f.key, heading: f.label }));
  const extras = TEACHER_EXPORT_COLUMNS.filter((c) => c.extra).map((c) => ({ key: c.key, heading: c.heading }));
  return [...usual, ...own, ...extras];
}

/** The columns that are in every export: the name and the mobile number, and the column of every detail or own field made needed. */
export const neededColumns = (rules: TeacherFieldRules, custom: CustomFieldDef[]): string[] => [
  ...LOCKED_TEACHER_COLUMNS,
  ...TEACHER_DETAILS.filter((d) => rules[d.key] === "required").map((d) => d.key as string),
  ...custom.filter((f) => f.mode === "required").map((f) => f.key),
];

/**
 * A layout with the columns that must be there put back where they are missing (a detail made needed after the layout was saved): a
 * column of the list goes right after the nearest column before it in the list that the layout has (else first), an own field at the end.
 * The school's own order, its headings and its other columns stay as they are.
 */
export function withNeededColumns(columns: ITeacherExportColumn[], need: readonly string[]): ITeacherExportColumn[] {
  const wanted = new Set(need);
  const next = [...columns];
  TEACHER_EXPORT_COLUMNS.forEach((column, index) => {
    if (!wanted.has(column.key) || next.some((c) => c.key === column.key)) return;
    let after = -1;
    for (let before = index - 1; before >= 0 && after < 0; before -= 1) after = next.findIndex((c) => c.key === TEACHER_EXPORT_COLUMNS[before].key);
    next.splice(after + 1, 0, { key: column.key, heading: column.heading });
  });
  return next;
}

const sameColumns = (a: ITeacherExportColumn[], b: ITeacherExportColumn[]) => JSON.stringify(a.map((c) => [c.key, c.heading])) === JSON.stringify(b.map((c) => [c.key, c.heading]));

/** How a usual detail is read from what Add teacher or Change teacher sends, and what is said when a needed one is empty. */
const PROBES: Record<TeacherDetailKey, { path: string; present: (i: DetailInput) => boolean; value: (i: DetailInput) => unknown; message: string }> = {
  dateOfBirth: { path: "dateOfBirth", present: (i) => i.dateOfBirth !== undefined, value: (i) => i.dateOfBirth, message: "Enter the date of birth" },
  email: { path: "email", present: (i) => i.email !== undefined, value: (i) => i.email, message: "Enter the email" },
  address: { path: "address.line1", present: (i) => i.address?.line1 !== undefined, value: (i) => i.address?.line1, message: "Enter the house and street" },
  city: { path: "address.city", present: (i) => i.address?.city !== undefined, value: (i) => i.address?.city, message: "Enter the city or village" },
  state: { path: "address.state", present: (i) => i.address?.state !== undefined, value: (i) => i.address?.state, message: "Choose the state" },
  pincode: { path: "address.pincode", present: (i) => i.address?.pincode !== undefined, value: (i) => i.address?.pincode, message: "Enter the PIN code" },
  employeeCode: { path: "employeeCode", present: (i) => i.employeeCode !== undefined, value: (i) => i.employeeCode, message: "Enter the employee code" },
  designation: { path: "designation", present: (i) => i.designation !== undefined, value: (i) => i.designation, message: "Enter the designation" },
  qualification: { path: "qualification", present: (i) => i.qualification !== undefined, value: (i) => i.qualification, message: "Enter the qualification" },
  experienceYears: { path: "experienceYears", present: (i) => i.experienceYears !== undefined, value: (i) => i.experienceYears, message: "Enter the years of experience" },
  joiningDate: { path: "joiningDate", present: (i) => i.joiningDate !== undefined, value: (i) => i.joiningDate, message: "Enter the joining date" },
  employmentType: { path: "employmentType", present: (i) => i.employmentType !== undefined, value: (i) => i.employmentType, message: "Choose the employment type" },
  subjects: { path: "subjectIds", present: (i) => i.subjectIds !== undefined, value: (i) => (i.subjectIds && i.subjectIds.length > 0 ? "given" : null), message: "Choose at least one subject" },
};

/** The part of a teacher's input the usual details are read from (the same for a new teacher and for a change). */
export interface DetailInput {
  dateOfBirth?: unknown;
  email?: unknown;
  address?: { line1?: unknown; city?: unknown; state?: unknown; pincode?: unknown };
  employeeCode?: unknown;
  designation?: unknown;
  qualification?: unknown;
  experienceYears?: unknown;
  joiningDate?: unknown;
  employmentType?: unknown;
  subjectIds?: unknown[];
}

export class TeacherSettingsService {
  /** The school's settings, with the usual for everything it has not decided (one read). */
  static async get(tenantId: string): Promise<TeacherSettingsDto> {
    const doc = await TeacherSettings.findOne({ tenantId }).lean();
    const fields = { ...DEFAULT_TEACHER_RULES };
    for (const f of doc?.fields ?? []) if (f.key in fields) fields[f.key] = f.mode;
    const customFields = (doc?.customFields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, options: [...(f.options ?? [])], mode: f.mode }));
    // A field the school deleted leaves the Excel with it.
    const saved = doc?.exportColumns?.filter((c) => TEACHER_COLUMN_KEYS.has(c.key) || customFields.some((f) => f.key === c.key)).map((c) => ({ key: c.key, heading: c.heading }));
    const usual = defaultLayout(customFields);
    // The column of every needed detail is in the Excel, whatever the saved layout says.
    const exportColumns = withNeededColumns(saved && saved.length > 0 ? saved : usual, neededColumns(fields, customFields));
    return { fields, customFields, exportColumns, exportIsDefault: !(saved && saved.length > 0) && sameColumns(exportColumns, usual) };
  }

  /**
   * Changes what is sent: the needs of the usual details listed (the others stay), the school's own fields (the whole list: a field left
   * out is deleted, its answers stay on the teachers' records, unseen, and are never read again; a field keeps its kind: a number field
   * does not become a date, its answers would not fit), and/or the Excel's columns (null = the usual layout; a column must be one of the
   * list or a field the school has). One document per school, made on the first change.
   */
  static async update(tenantId: string, userId: string | null, input: UpdateTeacherSettingsInput): Promise<TeacherSettingsDto> {
    const school = new Types.ObjectId(tenantId);
    const current = await TeacherSettingsService.get(tenantId);
    const set: Record<string, unknown> = { updatedBy: userId ? new Types.ObjectId(userId) : null };

    const rules = { ...current.fields, ...(input.fields ?? {}) } as TeacherFieldRules;
    // Stored in the list's order, every detail written down, so a later default does not change what the school chose.
    if (input.fields) set.fields = TEACHER_DETAILS.map((d) => ({ key: d.key, mode: rules[d.key] }));

    const custom = input.customFields ?? current.customFields;
    if (input.customFields) {
      const changedKind = input.customFields.flatMap((f, i) => {
        const before = current.customFields.find((c) => c.key === f.key);
        return before && before.type !== f.type ? [{ path: `customFields.${i}.type`, message: "A field keeps its kind: add a new field for another kind" }] : [];
      });
      if (changedKind.length > 0) throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", changedKind);
      set.customFields = input.customFields;
    }

    if (input.exportColumns) {
      const unknown = input.exportColumns.flatMap((c, i) =>
        !TEACHER_COLUMN_KEYS.has(c.key) && !custom.some((f) => f.key === c.key) ? [{ path: `exportColumns.${i}.key`, message: "Choose a column from the list" }] : []
      );
      if (unknown.length > 0) throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", unknown);
      // A needed detail is in the Excel as well as on the form: the school makes it optional first to take its column out.
      const lacking = neededColumns(rules, custom).filter((key) => !input.exportColumns!.some((c) => c.key === key));
      if (lacking.length > 0) {
        const nameOf = (key: string) => (TEACHER_COLUMN_KEYS.has(key) ? headingOf(key) : (custom.find((f) => f.key === key)?.label ?? key));
        throw ApiError.badRequest(
          "Validation failed",
          "VALIDATION_ERROR",
          lacking.map((key) => ({ path: "exportColumns", message: `${nameOf(key)} is mandatory, so it is in every export: make it optional first` }))
        );
      }
      set.exportColumns = input.exportColumns;
    } else if (input.exportColumns === null) {
      set.exportColumns = null;
    } else if (input.customFields) {
      // A deleted field leaves the saved layout too (not only the screens' copy of it).
      const doc = await TeacherSettings.findOne({ tenantId: school }).lean();
      if (doc?.exportColumns) set.exportColumns = doc.exportColumns.filter((c) => TEACHER_COLUMN_KEYS.has(c.key) || custom.some((f) => f.key === c.key));
    }
    await TeacherSettings.updateOne({ tenantId: school }, { $set: set, $setOnInsert: { tenantId: school } }, { upsert: true, runValidators: true });
    return TeacherSettingsService.get(tenantId);
  }

  /**
   * Holds a teacher to what the school needs of the usual details. A teacher who is added (`admit`) must have every needed detail; a
   * change (`change`) is asked about the details it sends only (a teacher added before a detail was needed is not asked for it, but the
   * box cannot be emptied). A bulk upload is not held to it: a school's old register seldom has everything. Nothing is written.
   */
  static async checkDetails(tenantId: string, input: DetailInput, kind: "admit" | "change"): Promise<void> {
    const { fields } = await TeacherSettingsService.get(tenantId);
    const issues = TEACHER_DETAILS.filter((d) => fields[d.key] === "required").flatMap((d) => {
      const probe = PROBES[d.key];
      if (kind === "change" && !probe.present(input)) return [];
      return empty(probe.value(input)) ? [{ path: probe.path, message: probe.message }] : [];
    });
    if (issues.length > 0) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", issues);
  }

  /**
   * Judges a teacher's answers against the school's own fields, in the form's words (`custom.<key>`): adding a teacher (`admit`) must
   * answer every needed field, a change cannot clear one, a bulk upload row (`format`) is only checked for what it gives. Returns the
   * answers cleaned for keeping. Nothing is written.
   */
  static async check(tenantId: string, answers: unknown, kind: "admit" | "change" | "format"): Promise<CleanAnswers> {
    const { customFields } = await TeacherSettingsService.get(tenantId);
    if (customFields.length === 0 && (answers === undefined || (answers && typeof answers === "object" && Object.keys(answers).length === 0))) return { set: {}, clear: [] };
    const issues = customIssues(answers, customFields, kind);
    if (issues.length > 0) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    const given = answers && typeof answers === "object" && !Array.isArray(answers) ? (answers as Record<string, unknown>) : {};
    const clean: CleanAnswers = { set: {}, clear: [] };
    for (const [key, value] of Object.entries(given)) {
      if (empty(value)) clean.clear.push(key);
      else if (typeof value === "string") clean.set[key] = value.trim().replace(/\s+/g, " ");
      else clean.set[key] = value as number | boolean;
    }
    return clean;
  }
}
