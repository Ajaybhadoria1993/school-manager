import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { MAX_CONCESSIONS } from "../constants";
import { Concession, type IConcession } from "../models/Concession";
import { FeeHead } from "../models/FeeHead";
import { DEFAULT_FEE_RULES, FeeSettings, type IFeeRules } from "../models/FeeSettings";
import type { ConcessionInput, ConcessionUpdate, FeeRulesInput } from "../schemas/fees.schemas";
import { asId, isDuplicateKey, keyOf } from "./feeHead.service";

const NAME_TAKEN = (name?: string) => ApiError.conflict(`${name ?? "A concession"} is already in your list of concessions.`, "CONCESSION_NAME_TAKEN", [{ path: "name", message: "Another concession has this name" }]);

export interface ConcessionDto {
  id: string;
  name: string;
  basis: IConcession["basis"];
  mode: IConcession["mode"];
  value: number;
  appliesTo: IConcession["appliesTo"];
  headIds: string[];
  /** The names of the fees it takes off (empty for "all"), so the list reads without a second request. */
  headNames: string[];
  needsApproval: boolean;
  notes: string | null;
  isActive: boolean;
}

/** The concessions a school gives (the rule; giving one to a student comes with collecting fees) and its fee rules. */
export class FeeRulesService {
  private static dto(c: IConcession, names: Map<string, string>): ConcessionDto {
    return {
      id: c._id.toString(),
      name: c.name,
      basis: c.basis,
      mode: c.mode,
      value: c.value,
      appliesTo: c.appliesTo,
      headIds: c.headIds.map(String),
      headNames: c.headIds.map((id) => names.get(id.toString())).filter((n): n is string => !!n),
      needsApproval: c.needsApproval,
      notes: c.notes,
      isActive: c.isActive,
    };
  }

  private static async headNames(school: Types.ObjectId) {
    return new Map((await FeeHead.find({ tenantId: school }).select("name").lean()).map((h) => [h._id.toString(), h.name]));
  }

  /** Every fee a concession names must be one of the school's own. */
  private static async checkHeads(school: Types.ObjectId, headIds: string[]) {
    if (headIds.length === 0) return;
    const found = await FeeHead.countDocuments({ tenantId: school, _id: { $in: headIds.map(asId) } });
    if (found !== new Set(headIds).size) throw ApiError.badRequest("Choose fees from your list", "FEE_HEAD_NOT_FOUND", [{ path: "headIds", message: "Choose fees from your list" }]);
  }

  static async listConcessions(tenantId: string, status: "active" | "inactive" | "all") {
    const school = asId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school };
    if (status !== "all") filter.isActive = status === "active";
    const [items, names] = await Promise.all([Concession.find(filter).sort({ nameKey: 1 }).lean(), FeeRulesService.headNames(school)]);
    return { items: items.map((c) => FeeRulesService.dto(c, names)) };
  }

  static async createConcession(tenantId: string, input: ConcessionInput) {
    const school = asId(tenantId);
    if ((await Concession.countDocuments({ tenantId: school })) >= MAX_CONCESSIONS) throw ApiError.badRequest(`A school can keep ${MAX_CONCESSIONS} concessions in its list.`, "TOO_MANY_CONCESSIONS");
    await FeeRulesService.checkHeads(school, input.headIds);
    try {
      const made = await Concession.create({ ...input, tenantId: school, nameKey: keyOf(input.name), headIds: input.headIds.map(asId) });
      return FeeRulesService.dto(made.toObject(), await FeeRulesService.headNames(school));
    } catch (err) {
      throw isDuplicateKey(err) ? NAME_TAKEN(input.name) : err;
    }
  }

  static async updateConcession(tenantId: string, id: string, input: ConcessionUpdate) {
    const school = asId(tenantId);
    const current = await Concession.findOne({ _id: id, tenantId: school }).lean();
    if (!current) throw ApiError.notFound("Concession not found", "CONCESSION_NOT_FOUND");
    // The same checks as a new one, on what it will be.
    const mode = input.mode ?? current.mode;
    const value = input.value ?? current.value;
    const appliesTo = input.appliesTo ?? current.appliesTo;
    const headIds = input.headIds ?? current.headIds.map(String);
    if (mode === "percent" && value > 100) throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", [{ path: "value", message: "A percentage cannot be more than 100" }]);
    if (appliesTo === "selected" && headIds.length === 0) throw ApiError.badRequest("Validation failed", "VALIDATION_ERROR", [{ path: "headIds", message: "Choose the fees it takes off" }]);
    await FeeRulesService.checkHeads(school, headIds);

    const set: Record<string, unknown> = { ...input, headIds: appliesTo === "selected" ? [...new Set(headIds)].map(asId) : [] };
    if (input.name !== undefined) set.nameKey = keyOf(input.name);
    try {
      const saved = await Concession.findOneAndUpdate({ _id: id, tenantId: school }, { $set: set }, { new: true }).lean();
      return FeeRulesService.dto(saved!, await FeeRulesService.headNames(school));
    } catch (err) {
      throw isDuplicateKey(err) ? NAME_TAKEN(input.name) : err;
    }
  }

  static async removeConcession(tenantId: string, id: string) {
    const school = asId(tenantId);
    const result = await Concession.deleteOne({ _id: id, tenantId: school });
    if (result.deletedCount === 0) throw ApiError.notFound("Concession not found", "CONCESSION_NOT_FOUND");
  }

  // ---- rules ------------------------------------------------------------------------------------------------------------------------

  static async getRules(tenantId: string): Promise<IFeeRules & { isDefault: boolean }> {
    const saved = await FeeSettings.findOne({ tenantId: asId(tenantId) }).lean();
    if (!saved) return { ...DEFAULT_FEE_RULES, lateFine: { ...DEFAULT_FEE_RULES.lateFine }, isDefault: true };
    return {
      dueDay: saved.dueDay,
      graceDays: saved.graceDays,
      lateFine: { mode: saved.lateFine.mode, amount: saved.lateFine.amount, maxAmount: saved.lateFine.maxAmount ?? null },
      allowPartial: saved.allowPartial,
      holdReportCard: saved.holdReportCard,
      holdCertificate: saved.holdCertificate,
      isDefault: false,
    };
  }

  static async saveRules(tenantId: string, userId: string | null, input: FeeRulesInput) {
    const school = asId(tenantId);
    await FeeSettings.updateOne({ tenantId: school }, { $set: { ...input, updatedBy: userId ? asId(userId) : null }, $setOnInsert: { tenantId: school } }, { upsert: true, runValidators: true });
    return FeeRulesService.getRules(tenantId);
  }
}
