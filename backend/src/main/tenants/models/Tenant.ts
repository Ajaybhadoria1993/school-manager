import { Schema, model, Types } from "mongoose";
import { BOARDS, CLASS_LEVELS, MEDIUMS, SCHOOL_TYPES, STATE_BOARDS } from "../constants";

/**
 * Where a school is in its life. Single source of truth for "can this school use the app":
 *   invited / (self sign-up) -> onboarding -> pending -> approved   (pending -> rejected -> pending again on resubmit)
 * `isActive` is a separate switch the super admin uses to suspend an approved school (and to switch it
 * back on): while it is off nobody from the school can sign in or use a session they already have.
 */
export const APPROVAL_STATUSES = ["invited", "onboarding", "pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const SUBSCRIPTION_TIERS = ["basic", "standard", "premium"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export type TenantSource = "invite" | "signup";

export interface ITenant {
  _id: Types.ObjectId;
  name: string;
  /** Lower-cased, trimmed name: makes "Sunrise School" and "sunrise  school" the same school. */
  nameKey: string;
  slug: string;
  subscriptionTier: SubscriptionTier;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  /** How the school got here: invited by the super admin, or registered itself from the login page. */
  source: TenantSource;
  /** The school admin's login email (from the invitation or the sign-up). Never changes. */
  contactEmail: string;
  invitedBy?: Types.ObjectId;
  invitedAt?: Date;

  // ---- Filled in by the onboarding form ----
  /** The school's public email and phone (not the admin's login). */
  schoolEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    /** Where the school is, from the largest part down: state, then division (not every state has them), district, city. */
    state?: string;
    division?: string;
    district?: string;
    pincode?: string;
  };
  profile?: {
    schoolType?: (typeof SCHOOL_TYPES)[number];
    /**
     * Every board the school follows, each with the medium(s) it is taught in (CBSE in English, the
     * M.P. Board in Hindi and English...). `stateBoard` is only set when `board` is "State Board".
     * (Named differently from the earlier flat lists of boards and mediums, so old records do not clash.)
     */
    boardEntries?: {
      board: (typeof BOARDS)[number];
      stateBoard?: (typeof STATE_BOARDS)[number];
      /** What the school calls the board, when `board` is "Other". */
      otherBoard?: string;
      /** This board's own affiliation / recognition number. */
      affiliationNumber?: string;
      mediums: (typeof MEDIUMS)[number][];
    }[];
    udiseCode?: string;
    establishedYear?: number;
    lowestClass?: (typeof CLASS_LEVELS)[number];
    highestClass?: (typeof CLASS_LEVELS)[number];
    approxStudents?: number;
    sessionStartMonth?: number;
  };

  /**
   * The school's own switches for how its data is kept. A missing value means the default.
   * `sectionDetailsRequired`: a section must have its seats and its room (default true); the school can make them optional.
   */
  settings?: {
    sectionDetailsRequired?: boolean;
  };

  onboarding: {
    status: OnboardingStatus;
    /** The next step to do, 1-based. */
    currentStep: number;
    completedSteps: number[];
    submittedAt?: Date;
    /** How many times it was sent back after a rejection and submitted again. */
    resubmittedCount: number;
    declarationAcceptedAt?: Date;
  };

  /** The super admin's decision on the latest submission. */
  review: {
    reviewedAt?: Date;
    reviewedBy?: Types.ObjectId;
    approvedAt?: Date;
    rejectionReason?: string;
    note?: string;
  };

  /**
   * The latest time the super admin switched the school off (`isActive: false`) and, once it was
   * switched back on, when. Only the latest round is kept: suspending again overwrites it.
   */
  suspension?: {
    suspendedAt?: Date;
    suspendedBy?: Types.ObjectId;
    reason?: string;
    reactivatedAt?: Date;
    reactivatedBy?: Types.ObjectId;
    note?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    nameKey: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    subscriptionTier: { type: String, enum: SUBSCRIPTION_TIERS, default: "basic" },
    isActive: { type: Boolean, default: true },
    approvalStatus: { type: String, enum: APPROVAL_STATUSES, required: true, default: "invited" },
    source: { type: String, enum: ["invite", "signup"], default: "invite" },
    contactEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
    invitedAt: { type: Date },

    schoolEmail: { type: String, lowercase: true, trim: true, maxlength: 254 },
    contactPhone: { type: String, trim: true, maxlength: 20 },
    website: { type: String, trim: true, maxlength: 200 },
    address: {
      line1: { type: String, trim: true, maxlength: 200 },
      line2: { type: String, trim: true, maxlength: 200 },
      city: { type: String, trim: true, maxlength: 80 },
      state: { type: String, trim: true, maxlength: 80 },
      division: { type: String, trim: true, maxlength: 80 },
      district: { type: String, trim: true, maxlength: 80 },
      pincode: { type: String, trim: true, maxlength: 6 },
    },
    profile: {
      schoolType: { type: String, enum: SCHOOL_TYPES },
      boardEntries: {
        type: [
          new Schema(
            {
              board: { type: String, enum: BOARDS, required: true },
              stateBoard: { type: String, enum: STATE_BOARDS },
              otherBoard: { type: String, trim: true, maxlength: 80 },
              affiliationNumber: { type: String, trim: true, maxlength: 50 },
              mediums: { type: [{ type: String, enum: MEDIUMS }] },
            },
            { _id: false }
          ),
        ],
      },
      udiseCode: { type: String, trim: true, maxlength: 11 },
      establishedYear: { type: Number },
      lowestClass: { type: String, enum: CLASS_LEVELS },
      highestClass: { type: String, enum: CLASS_LEVELS },
      approxStudents: { type: Number },
      sessionStartMonth: { type: Number },
    },

    settings: {
      sectionDetailsRequired: { type: Boolean },
    },

    onboarding: {
      status: { type: String, enum: ONBOARDING_STATUSES, default: "NOT_STARTED" },
      currentStep: { type: Number, default: 1 },
      completedSteps: { type: [Number], default: [] },
      submittedAt: { type: Date },
      resubmittedCount: { type: Number, default: 0 },
      declarationAcceptedAt: { type: Date },
    },

    review: {
      reviewedAt: { type: Date },
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      approvedAt: { type: Date },
      rejectionReason: { type: String, maxlength: 500 },
      note: { type: String, maxlength: 500 },
    },

    suspension: {
      suspendedAt: { type: Date },
      suspendedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, maxlength: 500 },
      reactivatedAt: { type: Date },
      reactivatedBy: { type: Schema.Types.ObjectId, ref: "User" },
      note: { type: String, maxlength: 500 },
    },
  },
  { timestamps: true }
);

tenantSchema.index({ approvalStatus: 1, createdAt: -1 });

export const Tenant = model<ITenant>("Tenant", tenantSchema);
