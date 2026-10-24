import type { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { reportError } from "../../../utils/logger";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { StructureService } from "../../academics/services/structure.service";
import { RefreshToken } from "../../auth/models/RefreshToken";
import { User } from "../../users/models/User";
import { Tenant, type ITenant } from "../models/Tenant";
import { notifySchoolApproved, notifySchoolReactivated, notifySchoolRejected, notifySchoolSuspended } from "./notifications";
import { buildSchoolSteps, type SchoolSteps } from "./schoolDetails";
import { toListItems, type TenantListItem } from "./tenantQueries";
import { toOnboardingProgress, type OnboardingProgress } from "./tenantState";

export interface SchoolReview {
  tenant: TenantListItem;
  steps: SchoolSteps;
  onboarding: OnboardingProgress;
  admin: { name: string; email: string; emailVerifiedAt: string | null } | null;
  review: {
    reviewedAt: string | null;
    reviewedByName: string | null;
    approvedAt: string | null;
    rejectionReason: string | null;
    note: string | null;
  };
  /** The latest time the school was switched off, and back on; null if it never was. */
  suspension: {
    suspendedAt: string;
    suspendedByName: string | null;
    reason: string | null;
    reactivatedAt: string | null;
    reactivatedByName: string | null;
    note: string | null;
  } | null;
}

const NOT_FOUND = () => ApiError.notFound("School not found", "NOT_FOUND");

async function adminOf(tenantId: ITenant["_id"]) {
  return User.findOne({ tenantId, role: "school_admin" });
}

/** A decision can only be taken on a school that is waiting for one, exactly once. */
async function decide(tenantId: string, update: Record<string, unknown>): Promise<ITenant> {
  const decided = await Tenant.findOneAndUpdate({ _id: tenantId, approvalStatus: "pending" }, { $set: update }, { new: true });
  if (decided) return decided;
  const exists = await Tenant.exists({ _id: tenantId });
  if (!exists) throw NOT_FOUND();
  throw ApiError.conflict("This school is not waiting for a decision (it may already have been decided).", "INVALID_STATE");
}

/**
 * Switches an approved school off or on, exactly once: a second click (or a second super admin) finds it
 * already done. Only an approved school has anything to switch: before that it is simply not live yet.
 */
async function switchActive(tenantId: string, wasActive: boolean, update: Record<string, unknown>, unset: Record<string, 1> = {}): Promise<ITenant> {
  const switched = await Tenant.findOneAndUpdate(
    { _id: tenantId, approvalStatus: "approved", isActive: wasActive },
    { $set: { ...update, isActive: !wasActive }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { new: true }
  );
  if (switched) return switched;
  const current = await Tenant.findById(tenantId).select("approvalStatus").lean();
  if (!current) throw NOT_FOUND();
  throw ApiError.conflict(
    current.approvalStatus !== "approved"
      ? "Only an approved school can be suspended or reactivated."
      : wasActive
        ? "This school is already suspended."
        : "This school is not suspended.",
    "INVALID_STATE"
  );
}

export class ReviewService {
  /** Everything the super admin reads before deciding. */
  static async detail(tenantId: string): Promise<SchoolReview> {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw NOT_FOUND();
    const { suspension } = tenant;
    const peopleIds = [tenant.review?.reviewedBy, suspension?.suspendedBy, suspension?.reactivatedBy].filter((id): id is Types.ObjectId => Boolean(id));
    const [admin, people, year] = await Promise.all([
      adminOf(tenant._id),
      User.find({ _id: { $in: peopleIds } }).select("name").lean(),
      AcademicYearService.onboardingYear(tenant._id),
    ]);
    const names = new Map(people.map((p) => [p._id.toString(), p.name]));
    const nameOf = (id?: Types.ObjectId) => (id ? names.get(id.toString()) ?? null : null);
    const [item] = await toListItems([tenant]);

    return {
      tenant: item,
      steps: buildSchoolSteps(tenant, admin, year),
      onboarding: toOnboardingProgress(tenant),
      admin: admin
        ? { name: admin.name, email: admin.email, emailVerifiedAt: admin.emailVerifiedAt?.toISOString() ?? null }
        : null,
      review: {
        reviewedAt: tenant.review?.reviewedAt?.toISOString() ?? null,
        reviewedByName: nameOf(tenant.review?.reviewedBy),
        approvedAt: tenant.review?.approvedAt?.toISOString() ?? null,
        rejectionReason: tenant.review?.rejectionReason || null,
        note: tenant.review?.note || null,
      },
      suspension: suspension?.suspendedAt
        ? {
            suspendedAt: suspension.suspendedAt.toISOString(),
            suspendedByName: nameOf(suspension.suspendedBy),
            reason: suspension.reason || null,
            reactivatedAt: suspension.reactivatedAt?.toISOString() ?? null,
            reactivatedByName: nameOf(suspension.reactivatedBy),
            note: suspension.note || null,
          }
        : null,
    };
  }

  static async approve(tenantId: string, reviewerId: string, note?: string): Promise<TenantListItem> {
    const now = new Date();
    const tenant = await decide(tenantId, {
      approvalStatus: "approved",
      "review.reviewedAt": now,
      "review.reviewedBy": reviewerId,
      "review.approvedAt": now,
      "review.rejectionReason": "",
      "review.note": note ?? "",
    });
    // The academic year the school named at sign-up becomes its active year (sections made from now on belong to it). A
    // failure here must never undo the approval: the next read of the current year finishes the job (AcademicYearService.current).
    await AcademicYearService.activateOnboardingYear(tenant._id).catch((err) =>
      reportError(err, { step: "activate the academic year from the school profile", tenantId })
    );
    // The school's Classes page starts with the classes it named at sign-up. A failure here must never undo the approval:
    // the page then simply starts empty and offers the same setup by hand.
    await StructureService.startFromProfile(tenant).catch((err) =>
      reportError(err, { step: "start classes from the school profile", tenantId })
    );
    const admin = await adminOf(tenant._id);
    if (admin) notifySchoolApproved(tenant, { name: admin.name, email: admin.email });
    return (await toListItems([tenant]))[0];
  }

  static async reject(tenantId: string, reviewerId: string, reason: string): Promise<TenantListItem> {
    const tenant = await decide(tenantId, {
      approvalStatus: "rejected",
      "review.reviewedAt": new Date(),
      "review.reviewedBy": reviewerId,
      "review.approvedAt": null,
      "review.rejectionReason": reason,
      "review.note": "",
    });
    const admin = await adminOf(tenant._id);
    if (admin) notifySchoolRejected(tenant, { name: admin.name, email: admin.email }, reason);
    return (await toListItems([tenant]))[0];
  }

  /**
   * Switches an approved school off. Its people are locked out at once (every request checks the school), and
   * their saved sign-ins are deleted so that switching it back on starts everyone from a fresh sign-in.
   */
  static async suspend(tenantId: string, actorId: string, reason: string): Promise<TenantListItem> {
    const tenant = await switchActive(
      tenantId,
      true,
      { "suspension.suspendedAt": new Date(), "suspension.suspendedBy": actorId, "suspension.reason": reason },
      { "suspension.reactivatedAt": 1, "suspension.reactivatedBy": 1, "suspension.note": 1 }
    );
    const people = await User.find({ tenantId: tenant._id }).select("_id").lean();
    await RefreshToken.deleteMany({ userId: { $in: people.map((p) => p._id) } });
    const admin = await adminOf(tenant._id);
    if (admin) notifySchoolSuspended(tenant, { name: admin.name, email: admin.email }, reason);
    return (await toListItems([tenant]))[0];
  }

  static async reactivate(tenantId: string, actorId: string, note?: string): Promise<TenantListItem> {
    const tenant = await switchActive(tenantId, false, {
      "suspension.reactivatedAt": new Date(),
      "suspension.reactivatedBy": actorId,
      "suspension.note": note ?? "",
    });
    const admin = await adminOf(tenant._id);
    if (admin) notifySchoolReactivated(tenant, { name: admin.name, email: admin.email });
    return (await toListItems([tenant]))[0];
  }
}
