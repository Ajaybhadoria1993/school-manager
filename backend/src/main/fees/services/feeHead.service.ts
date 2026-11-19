import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { FEE_KIND_LABELS, MAX_FEE_HEADS, type FeeKind } from "../constants";
import { Concession } from "../models/Concession";
import { FeeHead, type IFeeHead } from "../models/FeeHead";
import { FeeLine } from "../models/FeeLine";
import type { HeadInput, HeadUpdate } from "../schemas/fees.schemas";

export const keyOf = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
export const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
export const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

const NAME_TAKEN = (name?: string) => ApiError.conflict(`${name ?? "A fee"} is already in your list of fees.`, "FEE_HEAD_NAME_TAKEN", [{ path: "name", message: "Another fee has this name" }]);
const NOT_FOUND = () => ApiError.notFound("Fee not found", "FEE_HEAD_NOT_FOUND");

export interface FeeHeadDto {
  id: string;
  name: string;
  kind: FeeKind;
  kindLabel: string;
  refundable: boolean;
  defaultFrequency: IFeeHead["defaultFrequency"];
  defaultAppliesTo: IFeeHead["defaultAppliesTo"];
  defaultOptional: boolean;
  notes: string | null;
  isActive: boolean;
  /** Is on a class's fee chart or in a concession (so it cannot be deleted, only switched off). */
  inUse: boolean;
}

export const headDto = (h: IFeeHead, inUse = false): FeeHeadDto => ({
  id: h._id.toString(),
  name: h.name,
  kind: h.kind,
  kindLabel: FEE_KIND_LABELS[h.kind],
  refundable: h.refundable,
  defaultFrequency: h.defaultFrequency,
  defaultAppliesTo: h.defaultAppliesTo,
  defaultOptional: h.defaultOptional,
  notes: h.notes,
  isActive: h.isActive,
  inUse,
});

/** The school's fee heads: Tuition, Admission, Exam, Uniform... (the school's own list, the same every session). */
export class FeeHeadService {
  /** The ids of the heads that some line or concession uses. */
  private static async usedIds(school: Types.ObjectId): Promise<Set<string>> {
    const [lineHeads, concessions] = await Promise.all([FeeLine.distinct("headId", { tenantId: school }), Concession.find({ tenantId: school, appliesTo: "selected" }).select("headIds").lean()]);
    return new Set([...lineHeads.map(String), ...concessions.flatMap((c) => c.headIds.map(String))]);
  }

  static async list(tenantId: string, status: "active" | "inactive" | "all") {
    const school = asId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school };
    if (status !== "all") filter.isActive = status === "active";
    const [heads, used] = await Promise.all([FeeHead.find(filter).sort({ nameKey: 1 }).lean(), FeeHeadService.usedIds(school)]);
    return { items: heads.map((h) => headDto(h, used.has(h._id.toString()))) };
  }

  static async create(tenantId: string, input: HeadInput) {
    const school = asId(tenantId);
    if ((await FeeHead.countDocuments({ tenantId: school })) >= MAX_FEE_HEADS) throw ApiError.badRequest(`A school can keep ${MAX_FEE_HEADS} fees in its list.`, "TOO_MANY_FEE_HEADS");
    try {
      const made = await FeeHead.create({ ...input, tenantId: school, nameKey: keyOf(input.name) });
      return headDto(made.toObject());
    } catch (err) {
      throw isDuplicateKey(err) ? NAME_TAKEN(input.name) : err;
    }
  }

  /** Adds the usual fees a school picked in one go; a name the school already has is left alone (and counted). */
  static async createMany(tenantId: string, inputs: HeadInput[]) {
    const school = asId(tenantId);
    const have = new Set((await FeeHead.find({ tenantId: school }).select("nameKey").lean()).map((h) => h.nameKey));
    const fresh: HeadInput[] = [];
    for (const head of inputs) {
      const key = keyOf(head.name);
      if (have.has(key)) continue;
      have.add(key);
      fresh.push(head);
    }
    if (have.size > MAX_FEE_HEADS) throw ApiError.badRequest(`A school can keep ${MAX_FEE_HEADS} fees in its list.`, "TOO_MANY_FEE_HEADS");
    try {
      const made = fresh.length > 0 ? await FeeHead.insertMany(fresh.map((h) => ({ ...h, tenantId: school, nameKey: keyOf(h.name) }))) : [];
      return { created: made.length, skipped: inputs.length - made.length, items: made.map((m) => headDto(m.toObject())) };
    } catch (err) {
      throw isDuplicateKey(err) ? NAME_TAKEN() : err;
    }
  }

  static async update(tenantId: string, id: string, input: HeadUpdate) {
    const school = asId(tenantId);
    const current = await FeeHead.findOne({ _id: id, tenantId: school }).lean();
    if (!current) throw NOT_FOUND();
    const set: Record<string, unknown> = { ...input };
    if (input.name !== undefined) set.nameKey = keyOf(input.name);
    const frequency = input.defaultFrequency ?? current.defaultFrequency;
    // A one-time fee is for new students only, whatever was said about who pays it.
    if (frequency === "one_time") set.defaultAppliesTo = "new";
    else if (input.defaultAppliesTo === undefined && current.defaultFrequency === "one_time" && input.defaultFrequency) set.defaultAppliesTo = "all";
    if (input.kind !== undefined && (input.kind === "transport") !== (current.kind === "transport") && (await FeeLine.exists({ tenantId: school, headId: current._id }))) {
      throw ApiError.conflict("This fee is already on a class's fee chart, so it cannot become (or stop being) transport. Remove those lines first.", "FEE_HEAD_IN_USE", [{ path: "kind", message: "It is already on a fee chart" }]);
    }
    try {
      const saved = await FeeHead.findOneAndUpdate({ _id: id, tenantId: school }, { $set: set }, { new: true }).lean();
      return headDto(saved!, (await FeeHeadService.usedIds(school)).has(id));
    } catch (err) {
      throw isDuplicateKey(err) ? NAME_TAKEN(input.name) : err;
    }
  }

  static async remove(tenantId: string, id: string) {
    const school = asId(tenantId);
    if (!(await FeeHead.exists({ _id: id, tenantId: school }))) throw NOT_FOUND();
    if ((await FeeHeadService.usedIds(school)).has(id)) {
      throw ApiError.conflict("This fee is on a fee chart or in a concession. Take it off there first, or switch it off.", "FEE_HEAD_IN_USE");
    }
    await FeeHead.deleteOne({ _id: id, tenantId: school });
  }
}
