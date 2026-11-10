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

/** A row of a day's timing, as the school filled it in at sign-up. Times are minutes after midnight. */
export interface IPlanSlot {
  kind: "period" | "lunch" | "break";
  label: string;
  start: number;
  end: number;
}

/**
 * One medium of a board as the school described it at sign-up: its classes (with sections and seats, and a class per stream in 11 and 12)
 * and its timing. Approval builds that side of the school from this (MediumService.setUp).
 */
export interface IMediumPlan {
  medium: (typeof MEDIUMS)[number];
  lowestClass: (typeof CLASS_LEVELS)[number];
  highestClass: (typeof CLASS_LEVELS)[number];
  /** The streams of Class 11 and 12: the usual ones (Science, Commerce, Arts, Maths) and any the school named itself. */
  seniorStreams: string[];
  classes: { name: string; sections: number; seats: number }[];
  week: { days: number[]; usual: IPlanSlot[]; saturday?: IPlanSlot[] | null };
}

export interface ITenant {
  _id: Types.ObjectId;
  name: string;
  /** Lower-cased, trimmed name: makes "Sunrise School" and "sunrise  school" the same school. */
  nameKey: string;
  slug: string;
  /**
   * A school that teaches in more than one medium runs each as its own side: English Medium and Hindi Medium have their own classes, students
   * and timetable. The first medium lives in the school's own record; each other one is a record of its own that points here. People see
   * one school, and its administrator moves between the sides from the top bar. Null for a school, and every school that has one medium.
   */
  parentTenantId?: Types.ObjectId | null;
  /** Which side this is, when the school has more than one: `key` tells them apart ("cbse|english"), `label` is what the top bar says. */
  medium?: { key: string; label: string };
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
      /** One for each of `mediums`. Missing on a school that signed up before plans existed. */
      plans?: IMediumPlan[];
    }[];
    udiseCode?: string;
    establishedYear?: number;
    lowestClass?: (typeof CLASS_LEVELS)[number];
    highestClass?: (typeof CLASS_LEVELS)[number];
    approxStudents?: number;
    sessionStartMonth?: number;
    /** When the logo was last changed: there is one (kept in SchoolLogo), and its address changes with it. */
    logoUpdatedAt?: Date;
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

const planSlotSchema = new Schema<IPlanSlot>(
  {
    kind: { type: String, enum: ["period", "lunch", "break"], required: true },
    label: { type: String, default: "", trim: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
  },
  { _id: false }
);

const mediumPlanSchema = new Schema<IMediumPlan>(
  {
    medium: { type: String, enum: MEDIUMS, required: true },
    lowestClass: { type: String, enum: CLASS_LEVELS, required: true },
    highestClass: { type: String, enum: CLASS_LEVELS, required: true },
    seniorStreams: { type: [{ type: String, trim: true, maxlength: 30 }], default: [] },
    classes: {
      type: [new Schema({ name: { type: String, required: true, trim: true, maxlength: 40 }, sections: { type: Number, required: true }, seats: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
    week: {
      days: { type: [Number], default: [] },
      usual: { type: [planSlotSchema], default: [] },
      saturday: { type: [planSlotSchema], default: undefined },
    },
  },
  { _id: false }
);

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    nameKey: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    parentTenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    medium: { type: new Schema({ key: { type: String, required: true }, label: { type: String, required: true, maxlength: 120 } }, { _id: false }), default: undefined },
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
              plans: { type: [mediumPlanSchema], default: undefined },
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
      logoUpdatedAt: { type: Date },
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
// The sides of a school, read on every request made from a side other than the first; one of each medium.
tenantSchema.index({ parentTenantId: 1, "medium.key": 1 }, { unique: true, partialFilterExpression: { parentTenantId: { $type: "objectId" } }, name: "one_side_per_medium" });

export const Tenant = model<ITenant>("Tenant", tenantSchema);
