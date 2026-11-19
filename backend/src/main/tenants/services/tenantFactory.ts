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

/**
 * One more medium of an approved school: a record of its own (so everything in it stays apart) under the school's name, already approved.
 * Its key cannot be typed as a school's name, so a side never takes one away. A side made a moment ago is returned as it is.
 */
export async function createMediumSide(
  parent: Pick<ITenant, "_id" | "name" | "nameKey" | "slug" | "subscriptionTier" | "source" | "contactEmail" | "schoolEmail" | "contactPhone" | "website" | "address" | "profile" | "review" | "isActive">,
  medium: { key: string; label: string },
  entry: NonNullable<NonNullable<ITenant["profile"]>["boardEntries"]>[number],
  range: { lowestClass: NonNullable<ITenant["profile"]>["lowestClass"]; highestClass: NonNullable<ITenant["profile"]>["highestClass"] }
): Promise<ITenant> {
  try {
    return await Tenant.create({
      name: parent.name,
      nameKey: `${parent.nameKey}#${medium.key}`,
      slug: await uniqueSlug(`${parent.slug} ${medium.key.replace("|", " ")}`),
      parentTenantId: parent._id,
      medium,
      subscriptionTier: parent.subscriptionTier,
      approvalStatus: "approved",
      source: parent.source,
      isActive: parent.isActive,
      contactEmail: parent.contactEmail,
      schoolEmail: parent.schoolEmail,
      contactPhone: parent.contactPhone,
      website: parent.website,
      address: parent.address,
      profile: { ...parent.profile, boardEntries: [entry], lowestClass: range.lowestClass, highestClass: range.highestClass },
      onboarding: { status: "COMPLETED", currentStep: 4, completedSteps: [1, 2, 3, 4], resubmittedCount: 0 },
      review: parent.review,
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    const made = await Tenant.findOne({ parentTenantId: parent._id, "medium.key": medium.key });
    if (!made) throw err;
    return made;
  }
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
