import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { generateToken } from "../../../utils/authUtils";
import { Tenant, type ApprovalStatus, type ITenant, type SubscriptionTier, type TenantSource } from "../models/Tenant";

/** "Sunrise  School" and "sunrise school" are the same school. */
export function nameKeyOf(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export const SCHOOL_EXISTS = () =>
  ApiError.conflict("A school with this name is already registered. Add the city or branch to the name.", "SCHOOL_EXISTS");

function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "school";
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await Tenant.exists({ slug: candidate }))) return candidate;
  }
  return `${base}-${generateToken(3)}`;
}

export interface NewTenantInput {
  name: string;
  contactEmail: string;
  approvalStatus: ApprovalStatus;
  source: TenantSource;
  subscriptionTier?: SubscriptionTier;
  invitedBy?: string;
}

/**
 * Creates a school with a unique slug. A duplicate name raises SCHOOL_EXISTS; a slug that was
 * taken a split second earlier (two schools created at the same instant) just picks the next one.
 */
export async function createTenant(input: NewTenantInput): Promise<ITenant> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await Tenant.create({
        name: input.name.trim(),
        nameKey: nameKeyOf(input.name),
        slug: await uniqueSlug(input.name),
        subscriptionTier: input.subscriptionTier ?? "basic",
        approvalStatus: input.approvalStatus,
        source: input.source,
        isActive: true,
        contactEmail: input.contactEmail,
        ...(input.invitedBy ? { invitedBy: new Types.ObjectId(input.invitedBy), invitedAt: new Date() } : {}),
      });
    } catch (err) {
      const dup = err as { code?: number; keyPattern?: Record<string, unknown> };
      if (dup.code !== 11000) throw err;
      if (dup.keyPattern?.nameKey) throw SCHOOL_EXISTS();
    }
  }
  throw ApiError.conflict("Could not create the school, please try again.", "SCHOOL_EXISTS");
}
