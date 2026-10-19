export type UserRole =
  | "super_admin"
  | "school_admin"
  | "principal"
  | "accountant"
  | "teacher"
  | "parent"
  | "student";

/** The user as the API returns it (never contains a password or hash). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  emailVerifiedAt: string | null;
}

/** invited -> onboarding -> pending -> approved (pending -> rejected -> pending on resubmit). */
export type ApprovalStatus = "invited" | "onboarding" | "pending" | "approved" | "rejected";

export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface OnboardingProgress {
  status: OnboardingStatus;
  /** The next step to do, 1-based. */
  currentStep: number;
  completedSteps: number[];
  submittedAt: string | null;
  resubmittedCount: number;
}

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

/** Every success response is { success: true, data, message? }. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/** Returned by login, reset-password and accept-invite. */
export interface SessionPayload {
  user: AuthUser;
  tenant: TenantState | null;
  accessToken: string;
  refreshToken: string;
  /** Alias of accessToken. */
  token: string;
}

export interface MePayload {
  user: AuthUser;
  tenant: TenantState | null;
}

/** What the accept-invite page shows before the admin chooses a password. */
export interface InviteInfo {
  email: string;
  schoolName: string;
  expiresAt: string;
  /** "invite": the platform team invited this school. "signup": the visitor registered from the login page. */
  kind: "invite" | "signup";
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

/** One board the school follows, with the medium(s) it is taught in (CBSE in English, the M.P. Board in Hindi and English...). */
export type BoardEntry = {
  board: string;
  /** Only for "State Board"; "" otherwise. */
  stateBoard: string;
  /** Only for "Other": what the school calls the board; "" otherwise. */
  otherBoard: string;
  /** This board's own affiliation / recognition number; "" when not given. */
  affiliationNumber: string;
  mediums: string[];
};

/** The onboarding answers, exactly as the API returns and accepts them. Empty boxes are "" or null. */
export interface SchoolSteps {
  1: {
    schoolName: string;
    schoolType: string | null;
    /** Every board the school follows, each with its medium(s). Empty until the school adds one. */
    boards: BoardEntry[];
    /** The first and the last class the school runs. */
    lowestClass: string | null;
    highestClass: string | null;
    approxStudents: number | null;
    sessionStartMonth: number;
    udiseCode: string;
    establishedYear: number | null;
  };
  2: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pincode: string;
    /** Not every state has divisions; "" when the school has none to name. */
    division: string;
    district: string;
    /** The 10 digits after +91. */
    schoolPhone: string;
    schoolEmail: string;
    website: string;
  };
  3: {
    adminName: string;
    designation: string | null;
    /** What they wrote in when the role is "Other"; "" otherwise. */
    designationOther: string;
    mobile: string;
    alternateMobile: string;
  };
  4: { confirmed: boolean };
}

export interface OnboardingState {
  approvalStatus: ApprovalStatus;
  onboarding: OnboardingProgress;
  rejectionReason: string | null;
  steps: SchoolSteps;
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
