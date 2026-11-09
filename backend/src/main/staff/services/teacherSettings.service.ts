import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import type { CustomFieldDef } from "../../students/constants";
import { customIssues } from "../../students/schemas/students.schemas";
import { TeacherSettings } from "../models/TeacherSettings";
import type { UpdateTeacherSettingsInput } from "../schemas/staff.schemas";

export interface TeacherSettingsDto {
  customFields: CustomFieldDef[];
}

/** A teacher's answers, ready to keep: what is given (`set`, tidy) and what a change clears (`clear`). */
export interface CleanAnswers {
  set: Record<string, string | number | boolean>;
  clear: string[];
}

const empty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && value.trim() === "");

export class TeacherSettingsService {
  /** The school's own fields for its teachers (none until it makes one). */
  static async get(tenantId: string): Promise<TeacherSettingsDto> {
    const doc = await TeacherSettings.findOne({ tenantId }).lean();
    return { customFields: (doc?.customFields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, options: [...(f.options ?? [])], mode: f.mode })) };
  }

  /**
   * The whole list as it should be (a field left out is deleted: the answers teachers gave to it stay on their record, unseen, and are
   * never read again). A field keeps its kind (a number field does not become a date: its answers would not fit). One document per
   * school, made on the first change.
   */
  static async update(tenantId: string, userId: string | null, input: UpdateTeacherSettingsInput): Promise<TeacherSettingsDto> {
    const current = await TeacherSettingsService.get(tenantId);
    const changedKind = input.customFields.flatMap((f, i) => {
      const before = current.customFields.find((c) => c.key === f.key);
      return before && before.type !== f.type ? [{ path: `customFields.${i}.type`, message: "A field keeps its kind: add a new field for another kind" }] : [];
    });
    if (changedKind.length > 0) throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", changedKind);
    await TeacherSettings.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      { $set: { customFields: input.customFields, updatedBy: userId ? new Types.ObjectId(userId) : null } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    return TeacherSettingsService.get(tenantId);
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
