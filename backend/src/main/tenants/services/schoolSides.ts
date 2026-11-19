import { Types } from "mongoose";
import { Tenant } from "../models/Tenant";

export interface SchoolSide {
  id: Types.ObjectId;
  label: string;
}

/**
 * The mediums of the school this record belongs to, whichever of them it is: the school's own record first, then the others in the order
 * they were made. Empty for a school with one medium. Imports nothing but the model, so any service can use it.
 */
export async function sidesOfSchool(tenantId: string | Types.ObjectId): Promise<SchoolSide[]> {
  const id = new Types.ObjectId(tenantId);
  const record = await Tenant.findById(id).select("parentTenantId medium").lean();
  if (!record) return [];
  const root = record.parentTenantId ? await Tenant.findById(record.parentTenantId).select("medium").lean() : record;
  if (!root?.medium) return [];
  const others = await Tenant.find({ parentTenantId: root._id }).sort({ _id: 1 }).select("medium").lean();
  return [{ id: root._id, label: root.medium.label }, ...others.map((o) => ({ id: o._id, label: o.medium?.label ?? "" }))];
}

/** Every record of the school: all its mediums, or just this one. */
export async function recordsOfSchool(tenantId: string | Types.ObjectId): Promise<Types.ObjectId[]> {
  const sides = await sidesOfSchool(tenantId);
  return sides.length > 0 ? sides.map((s) => s.id) : [new Types.ObjectId(tenantId)];
}
