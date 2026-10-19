import { Types } from "mongoose";
import { ONBOARDING_STEP_COUNT } from "../constants";
import { Tenant, type ApprovalStatus, type ITenant, type OnboardingStatus } from "../models/Tenant";

export interface OnboardingProgress {
  status: OnboardingStatus;
  /** The next step to do, 1-based (1..ONBOARDING_STEP_COUNT). */
  currentStep: number;
  completedSteps: number[];
  submittedAt: string | null;
  resubmittedCount: number;
}

/** What the signed-in user's session says about their school (null for the super admin). */
export interface TenantState {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  onboarding: OnboardingProgress;
  /** Only while the school is rejected: why, so the admin knows what to fix. */
  rejectionReason: string | null;
}

type TenantLike = Pick<ITenant, "_id" | "name" | "slug" | "isActive" | "approvalStatus" | "onboarding" | "review">;

export function toOnboardingProgress(tenant: Pick<ITenant, "onboarding">): OnboardingProgress {
  const o = tenant.onboarding;
  return {
    status: o?.status ?? "NOT_STARTED",
    currentStep: Math.min(Math.max(o?.currentStep ?? 1, 1), ONBOARDING_STEP_COUNT),
    completedSteps: [...(o?.completedSteps ?? [])].sort((a, b) => a - b),
    submittedAt: o?.submittedAt ? o.submittedAt.toISOString() : null,
    resubmittedCount: o?.resubmittedCount ?? 0,
  };
}

export function toTenantState(tenant: TenantLike): TenantState {
  return {
    id: tenant._id.toString(),
    name: tenant.name,
    slug: tenant.slug,
    isActive: tenant.isActive,
    approvalStatus: tenant.approvalStatus,
    onboarding: toOnboardingProgress(tenant),
    rejectionReason: tenant.approvalStatus === "rejected" ? (tenant.review?.rejectionReason ?? null) : null,
  };
}

export async function loadTenantState(tenantId: Types.ObjectId | null | undefined): Promise<TenantState | null> {
  if (!tenantId) return null;
  const tenant = await Tenant.findById(tenantId).select("name slug isActive approvalStatus onboarding review").lean();
  return tenant ? toTenantState(tenant) : null;
}
