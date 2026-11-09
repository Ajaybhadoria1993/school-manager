import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { PROMOTION_OUTCOMES, PROMOTION_STATUSES, type PromotionOutcome, type PromotionStatus } from "../constants";

/** One student of a promotion list: where they are now, what is planned for them, and where they would go (names as written, for the screen). */
export interface IPromotionEntry {
  studentId: Types.ObjectId;
  name: string;
  admissionNumber: string;
  fromEnrolmentId: Types.ObjectId;
  fromClassId: Types.ObjectId;
  fromClassName: string;
  fromSectionId: Types.ObjectId | null;
  fromSectionName: string | null;
  outcome: PromotionOutcome;
  /** Where they go in the next year; all null for `leave`. */
  toClassId: Types.ObjectId | null;
  toClassName: string | null;
  toSectionId: Types.ObjectId | null;
  toSectionName: string | null;
}

export type PromotionPerson = { userId: Types.ObjectId; name: string; role: string };

/**
 * The list of who goes where when one academic year ends and the next one begins. It belongs to the year that is ending
 * (`academicYearId`, like every record of a session) and names the year that follows (`toAcademicYearId`). It is made as a draft with a
 * suggestion for every student of the running year, changed by whoever admits students, sent for approval, and only the school admin
 * approves it: approval makes each promoted or staying student a place in the next year (a new enrolment; the old one is never touched).
 * The students who leave are made inactive when the next year is switched on. One open list per next year (the database refuses a second).
 */
export interface IPromotionBatch {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  toAcademicYearId: Types.ObjectId;
  status: PromotionStatus;
  /** "open" while the list is in use (draft, sent or approved), unset when it is done or cancelled: the unique index lives on it. */
  openKey: string | null;
  entries: IPromotionEntry[];
  createdBy: PromotionPerson;
  submitted: { by: PromotionPerson; at: Date } | null;
  /** The word of the admin: approved, or sent back with a note (kept on the draft until it is sent again). */
  decision: { outcome: "approved" | "rejected"; by: PromotionPerson; at: Date; note: string | null } | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const person = {
  userId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
};

const entrySchema = new Schema<IPromotionEntry>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    name: { type: String, required: true },
    admissionNumber: { type: String, required: true },
    fromEnrolmentId: { type: Schema.Types.ObjectId, ref: "Enrolment", required: true },
    fromClassId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    fromClassName: { type: String, required: true },
    fromSectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    fromSectionName: { type: String, default: null },
    outcome: { type: String, enum: PROMOTION_OUTCOMES, required: true },
    toClassId: { type: Schema.Types.ObjectId, ref: "SchoolClass", default: null },
    toClassName: { type: String, default: null },
    toSectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    toSectionName: { type: String, default: null },
  },
  { _id: false }
);

const batchSchema = new Schema<IPromotionBatch>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    toAcademicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    status: { type: String, enum: PROMOTION_STATUSES, required: true, default: "draft" },
    openKey: { type: String, default: "open" },
    entries: { type: [entrySchema], default: [] },
    createdBy: person,
    submitted: { type: new Schema({ by: person, at: { type: Date, required: true } }, { _id: false }), default: null },
    decision: {
      type: new Schema(
        {
          outcome: { type: String, enum: ["approved", "rejected"], required: true },
          by: person,
          at: { type: Date, required: true },
          note: { type: String, default: null, maxlength: 300 },
        },
        { _id: false }
      ),
      default: null,
    },
    appliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
batchSchema.plugin(tenantScope);
// One open list for each next year: a second request at the same moment loses to the database.
batchSchema.index(
  { tenantId: 1, toAcademicYearId: 1, openKey: 1 },
  { unique: true, partialFilterExpression: { openKey: { $type: "string" } }, name: "one_open_promotion_per_next_year" }
);

export const PromotionBatch = model<IPromotionBatch>("PromotionBatch", batchSchema);
