import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import {
  CUSTOM_KEY,
  DEFAULT_EXPORT_LAYOUT,
  DEFAULT_FIELD_RULES,
  EXPORT_COLUMNS,
  STUDENT_FORM_FIELDS,
  type CustomFieldDef,
  type ExportColumnKey,
  type FieldRules,
  type SchoolNeeds,
} from "../constants";
import { StudentSettings, type IExportColumn } from "../models/StudentSettings";
import type { UpdateStudentSettingsInput } from "../schemas/students.schemas";

/**
 * How one school keeps its students' records, as the screens get it: every detail's need (defaults filled in), its own fields, and the
 * export's columns.
 */
export interface StudentSettingsDto {
  fields: FieldRules;
  customFields: CustomFieldDef[];
  exportColumns: IExportColumn[];
  /** The export is still the default layout (nothing saved yet). */
  exportIsDefault: boolean;
  updatedAt: string | null;
}

const defaultHeading = (key: ExportColumnKey) => EXPORT_COLUMNS.find((c) => c.key === key)!.heading;
export const DEFAULT_EXPORT: IExportColumn[] = DEFAULT_EXPORT_LAYOUT.map((key) => ({ key, heading: defaultHeading(key) }));
const BUILT_IN = new Set<string>(EXPORT_COLUMNS.map((c) => c.key));

/** A column the export can write: one of the list, or one of the school's own fields that still exists. */
const knownColumn = (key: string, custom: CustomFieldDef[]) => BUILT_IN.has(key) || custom.some((f) => f.key === key);

export class StudentSettingsService {
  /** The school's settings, with the defaults for everything it has not decided. One read. */
  static async get(tenantId: string): Promise<StudentSettingsDto> {
    const doc = await StudentSettings.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean();
    const fields = { ...DEFAULT_FIELD_RULES };
    for (const f of doc?.fields ?? []) if (f.key in fields) fields[f.key] = f.mode;
    const customFields = (doc?.customFields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, options: [...(f.options ?? [])], mode: f.mode }));
    // A field the school deleted leaves the export with it.
    const columns = doc?.exportColumns?.filter((c) => knownColumn(c.key, customFields));
    return {
      fields,
      customFields,
      exportColumns: columns && columns.length > 0 ? columns.map((c) => ({ key: c.key, heading: c.heading })) : DEFAULT_EXPORT,
      exportIsDefault: !columns || columns.length === 0,
      updatedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null,
    };
  }

  /** What the admission form of this school needs (POST /students and a change are held to it): its decisions and its own fields. */
  static async needs(tenantId: string): Promise<SchoolNeeds> {
    const { fields, customFields } = await StudentSettingsService.get(tenantId);
    return { rules: fields, custom: customFields };
  }

  /**
   * Changes what is sent: the needs of the details listed (the others stay as they are), the school's own fields (the whole list: one
   * left out is deleted, and leaves the export), and/or the export's columns (null = back to the default layout). A field of its own
   * keeps its kind (a number field does not become a date: its answers would not fit); a column must be a field the school has. One
   * document per school, made on the first change.
   */
  static async update(tenantId: string, userId: string | null, input: UpdateStudentSettingsInput): Promise<StudentSettingsDto> {
    const school = new Types.ObjectId(tenantId);
    const current = await StudentSettingsService.get(tenantId);
    const set: Record<string, unknown> = { updatedBy: userId ? new Types.ObjectId(userId) : null };
    if (input.fields) {
      const fields = { ...current.fields, ...input.fields } as FieldRules;
      // Stored in the catalog's order, every detail written down, so a later default does not change what the school chose.
      set.fields = STUDENT_FORM_FIELDS.map((f) => ({ key: f.key, mode: fields[f.key] }));
    }

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
        CUSTOM_KEY.test(c.key) && !custom.some((f) => f.key === c.key) ? [{ path: `exportColumns.${i}.key`, message: "Choose a column from the list" }] : []
      );
      if (unknown.length > 0) throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", unknown);
      set.exportColumns = input.exportColumns;
    } else if (input.exportColumns === null) {
      set.exportColumns = null;
    } else if (input.customFields && !current.exportIsDefault) {
      // A deleted field leaves the saved layout too (not only the screens' copy of it).
      set.exportColumns = current.exportColumns.filter((c) => knownColumn(c.key, custom));
    }
    await StudentSettings.updateOne({ tenantId: school }, { $set: set, $setOnInsert: { tenantId: school } }, { upsert: true, runValidators: true });
    return StudentSettingsService.get(tenantId);
  }
}
