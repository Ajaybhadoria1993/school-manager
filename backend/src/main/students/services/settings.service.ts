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
  type Placement,
  type SchoolNeeds,
  type StepDef,
  ADMIT_STEPS,
  effectivePlacements,
  effectiveSteps,
  isUsualPlacements,
  isUsualSteps,
  mandatoryColumnKeys,
  normaliseRules,
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
  /** The step of Add student each movable detail and each own field is asked in, in order (every one of them is listed). */
  placements: Placement[];
  /** Every detail is still in its usual step (nothing moved). */
  placementsAreDefault: boolean;
  /** The steps after Parents, in order: More details and the school's own. */
  steps: StepDef[];
  /** Only More details (the school added no step). */
  stepsAreDefault: boolean;
  updatedAt: string | null;
}

const defaultHeading = (key: ExportColumnKey) => EXPORT_COLUMNS.find((c) => c.key === key)!.heading;
export const DEFAULT_EXPORT: IExportColumn[] = DEFAULT_EXPORT_LAYOUT.map((key) => ({ key, heading: defaultHeading(key) }));
const BUILT_IN = new Set<string>(EXPORT_COLUMNS.map((c) => c.key));

/** A column the export can write: one of the list, or one of the school's own fields that still exists. */
const knownColumn = (key: string, custom: CustomFieldDef[]) => BUILT_IN.has(key) || custom.some((f) => f.key === key);

/**
 * A saved layout with the fixed columns put back where they are missing (a layout saved before they were fixed, or one made by hand):
 * each goes right after the nearest column before it in the catalog that the layout has, else first. The school's own order, its
 * headings and its other columns stay as they are.
 */
export function withFixedColumns(columns: IExportColumn[]): IExportColumn[] {
  return withCatalogColumns(columns, (column) => "locked" in column && !!column.locked);
}

/** Puts back, where they are missing, the columns of the list `wanted` says (each after the nearest column before it in the catalog that the layout has, else first). */
function withCatalogColumns(columns: IExportColumn[], wanted: (column: (typeof EXPORT_COLUMNS)[number]) => boolean): IExportColumn[] {
  const next = [...columns];
  EXPORT_COLUMNS.forEach((column, index) => {
    if (!wanted(column) || next.some((c) => c.key === column.key)) return;
    let after = -1;
    for (let before = index - 1; before >= 0 && after < 0; before--) after = next.findIndex((c) => c.key === EXPORT_COLUMNS[before].key);
    next.splice(after + 1, 0, { key: column.key, heading: column.heading });
  });
  return next;
}

/**
 * The form and the Excel are the school's to arrange on their own, but a detail the school makes mandatory is in both: its columns are
 * put back in the layout when it lacks them (a detail made mandatory after the layout was saved), and an own field's at the end.
 */
export function withMandatoryColumns(columns: IExportColumn[], rules: FieldRules, custom: CustomFieldDef[]): IExportColumn[] {
  const need = new Set(mandatoryColumnKeys(rules, custom));
  const next = withCatalogColumns(columns, (column) => need.has(column.key));
  for (const field of custom) if (need.has(field.key) && !next.some((c) => c.key === field.key)) next.push({ key: field.key, heading: field.label });
  return next;
}

const sameColumns = (a: IExportColumn[], b: IExportColumn[]) => JSON.stringify(a.map((c) => [c.key, c.heading])) === JSON.stringify(b.map((c) => [c.key, c.heading]));

export class StudentSettingsService {
  /** The school's settings, with the defaults for everything it has not decided and what no school can change put right. One read. */
  static async get(tenantId: string): Promise<StudentSettingsDto> {
    const doc = await StudentSettings.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean();
    const stored = { ...DEFAULT_FIELD_RULES };
    for (const f of doc?.fields ?? []) if (f.key in stored) stored[f.key] = f.mode;
    const fields = normaliseRules(stored);
    const customFields = (doc?.customFields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      options: [...(f.options ?? [])],
      mode: f.mode,
      ...(f.classNumbers && f.classNumbers.length > 0 ? { classNumbers: [...f.classNumbers] } : {}),
    }));
    // A field the school deleted leaves the export with it.
    const columns = doc?.exportColumns?.filter((c) => knownColumn(c.key, customFields));
    // Likewise its place on Add student; every detail is listed (the ones never placed at the end of their usual step).
    const steps = effectiveSteps(doc?.steps);
    const placements = effectivePlacements(doc?.placements, customFields, steps);
    const saved = columns && columns.length > 0 ? withFixedColumns(columns.map((c) => ({ key: c.key, heading: c.heading }))) : null;
    // The columns of every mandatory detail are in the export, whatever the saved layout says.
    const exportColumns = withMandatoryColumns(saved ?? DEFAULT_EXPORT, fields, customFields);
    return {
      fields,
      customFields,
      exportColumns,
      exportIsDefault: !saved && sameColumns(exportColumns, DEFAULT_EXPORT),
      placements,
      placementsAreDefault: isUsualPlacements(placements, customFields),
      steps,
      stepsAreDefault: isUsualSteps(steps),
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
      // A mandatory detail is in the Excel as well as on the form: the school makes it optional first to take its column out.
      const rules = { ...current.fields, ...(input.fields ?? {}) } as FieldRules;
      const lacking = mandatoryColumnKeys(rules, custom).filter((key) => !input.exportColumns!.some((c) => c.key === key));
      if (lacking.length > 0) {
        const nameOf = (key: string) => EXPORT_COLUMNS.find((c) => c.key === key)?.heading ?? custom.find((f) => f.key === key)?.label ?? key;
        throw ApiError.badRequest(
          "Validation failed",
          "VALIDATION_ERROR",
          lacking.map((key) => ({ path: "exportColumns", message: `${nameOf(key)} is mandatory, so it is in every export: make it optional first` }))
        );
      }
      set.exportColumns = input.exportColumns;
    } else if (input.exportColumns === null) {
      set.exportColumns = null;
    } else if (input.customFields && !current.exportIsDefault) {
      // A deleted field leaves the saved layout too (not only the screens' copy of it).
      set.exportColumns = current.exportColumns.filter((c) => knownColumn(c.key, custom));
    }
    // The steps after Parents: More details and the school's own, as sent (or as saved). A step taken out sends its details to More details.
    const steps = input.steps !== undefined ? effectiveSteps(input.steps) : current.steps;
    if (input.steps !== undefined) set.steps = input.steps === null || isUsualSteps(steps) ? null : steps;
    const stepKeys = new Set<string>([...ADMIT_STEPS, ...steps.map((s) => s.key)]);

    if (input.placements) {
      const unknown = input.placements.flatMap((p, i) => [
        ...(CUSTOM_KEY.test(p.key) && !custom.some((f) => f.key === p.key) ? [{ path: `placements.${i}.key`, message: "Your school has no such field of its own" }] : []),
        ...(!stepKeys.has(p.step) ? [{ path: `placements.${i}.step`, message: "Your school has no such step" }] : []),
      ]);
      if (unknown.length > 0) throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", unknown);
      // Every detail ends up listed; the usual places sent back are not kept as places of the school's own.
      const places = effectivePlacements(input.placements, custom, steps);
      set.placements = isUsualPlacements(places, custom) ? null : places;
    } else if (input.placements === null) {
      set.placements = null;
    } else if ((input.customFields || input.steps !== undefined) && !current.placementsAreDefault) {
      // A deleted field leaves its place (and a new one comes last in its step); a deleted step's details go to More details.
      const places = effectivePlacements(current.placements, custom, steps);
      set.placements = isUsualPlacements(places, custom) ? null : places;
    }
    await StudentSettings.updateOne({ tenantId: school }, { $set: set, $setOnInsert: { tenantId: school } }, { upsert: true, runValidators: true });
    return StudentSettingsService.get(tenantId);
  }
}
