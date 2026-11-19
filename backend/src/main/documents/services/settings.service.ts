import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { GRADE_BANDS, PASS_PERCENT } from "../constants";
import { DocumentSettings, type IGradeBand } from "../models/DocumentSettings";

export interface SettingsDto {
  passPercent: number;
  gradeBands: IGradeBand[];
  showRank: boolean;
  principalName: string | null;
  /** True while the school has not saved its own: it has the usual scale. */
  isDefault: boolean;
}

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());

/** The school's grading, as the report cards read it. */
export class DocumentSettingsService {
  static async get(tenantId: string | Types.ObjectId): Promise<SettingsDto> {
    const saved = await DocumentSettings.findOne({ tenantId: asId(tenantId) }).lean();
    if (!saved) return { passPercent: PASS_PERCENT, gradeBands: GRADE_BANDS.map((b) => ({ ...b })), showRank: true, principalName: null, isDefault: true };
    return { passPercent: saved.passPercent, gradeBands: saved.gradeBands.map((b) => ({ min: b.min, grade: b.grade })), showRank: saved.showRank, principalName: saved.principalName ?? null, isDefault: false };
  }

  static async save(tenantId: string, userId: string, input: { passPercent: number; gradeBands: IGradeBand[]; showRank: boolean; principalName: string | null }): Promise<SettingsDto> {
    const school = asId(tenantId);
    // Best first; the server writes the order, so a school may list them in any order.
    const bands = [...input.gradeBands].sort((a, b) => b.min - a.min);
    await DocumentSettings.updateOne(
      { tenantId: school },
      { $set: { passPercent: input.passPercent, gradeBands: bands, showRank: input.showRank, principalName: input.principalName, updatedBy: asId(userId) }, $setOnInsert: { tenantId: school } },
      { upsert: true, runValidators: true }
    ).catch((err) => {
      throw (err as { code?: number }).code === 11000 ? ApiError.conflict("Someone saved at the same moment. Please try again.", "SETTINGS_BUSY") : err;
    });
    return DocumentSettingsService.get(tenantId);
  }

  /** Puts the school's scale back to the usual one. */
  static async reset(tenantId: string): Promise<SettingsDto> {
    await DocumentSettings.deleteOne({ tenantId: asId(tenantId) });
    return DocumentSettingsService.get(tenantId);
  }
}
