import type { OnboardingProgress, SchoolSteps } from "./onboarding";

/** invited -> onboarding -> pending -> approved (pending -> rejected -> pending on resubmit). */
export type ApprovalStatus = "invited" | "onboarding" | "pending" | "approved" | "rejected";

/** The signed-in user's school. null for the super admin. */
export interface TenantState {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  onboarding: OnboardingProgress;
  /** Only while the school is rejected. */
  rejectionReason: string | null;
}

export type SubscriptionTier = "basic" | "standard" | "premium";

/** One row of the super admin's schools table. */
export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  subscriptionTier: SubscriptionTier;
  approvalStatus: ApprovalStatus;
  adminName: string | null;
  adminEmail: string | null;
  contactEmail: string;
  source: "invite" | "signup";
  /** Only while the school is still "invited". */
  inviteExpiresAt: string | null;
  submittedAt: string | null;
  resubmittedCount: number;
  createdAt: string;
}

/** `suspended` is counted on top of the stages: a suspended school is still an approved one. */
export type StatusCounts = Record<ApprovalStatus, number> & { total: number; suspended: number };

export interface SchoolOverview {
  counts: StatusCounts;
  /** Waiting for a decision, longest first. */
  awaiting: TenantListItem[];
  recent: TenantListItem[];
}

/** What the super admin reads before approving or rejecting. */
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

/** Returned by invite and resend-invite. */
export interface InviteDelivery {
  inviteExpiresAt: string;
  emailSent: boolean;
  /** Only when the backend is not in production and has no SMTP configured. */
  devInviteLink?: string;
}

/** Returned by POST /tenants/invite. */
export type InviteResult = { tenant: TenantListItem } & InviteDelivery;

export interface InviteSchoolInput {
  schoolName: string;
  contactEmail: string;
  subscriptionTier: SubscriptionTier;
}

/** The four decisions the super admin can take on a school. */
export type TenantDecision = "approve" | "reject" | "suspend" | "reactivate";
