import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * Where an academic year is in its life:
 *   pending -> active -> closed
 * `pending` is the year a school named while signing up, waiting for the super admin's approval (a rejected or still pending
 * school never gets an active year). Approval makes it `active`. `closed` is for a year that has ended and been closed by the
 * school (year-end processing is a later phase; nothing closes a year yet). A school has at most ONE active year: the database
 * refuses a second one (see the partial unique index below), so two requests at once cannot both win.
 */
export const ACADEMIC_YEAR_STATUSES = ["pending", "active", "closed"] as const;
export type AcademicYearStatus = (typeof ACADEMIC_YEAR_STATUSES)[number];

/**
 * How the year came to exist: `onboarding` is the school's first year, named in the sign-up form (one per school, edited while
 * the form is open); `school` is one the school set up itself afterwards (for a school that was approved before academic years
 * existed, and later for the next session).
 */
export const ACADEMIC_YEAR_SOURCES = ["onboarding", "school"] as const;
export type AcademicYearSource = (typeof ACADEMIC_YEAR_SOURCES)[number];

/**
 * One academic session of one school ("2026-2027", 1 April 2026 to 31 March 2027). The dates are the school's own: nothing
 * assumes April to March. Records that belong to a session point to it by `academicYearId` (sections already do; enrolment,
 * attendance, fees and exams will), so a new session never overwrites an old one.
 */
export interface IAcademicYear {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  /** What the school calls it: "2026-2027", "2026-27". */
  name: string;
  /** Lower-cased, trimmed name: two years of one school cannot have the same name. */
  nameKey: string;
  /** The first and the last day of the session, stored as midnight UTC of that calendar day. */
  startDate: Date;
  endDate: Date;
  status: AcademicYearStatus;
  source: AcademicYearSource;
  activatedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const academicYearSchema = new Schema<IAcademicYear>(
  {
    name: { type: String, required: true, trim: true, maxlength: 20 },
    nameKey: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ACADEMIC_YEAR_STATUSES, required: true, default: "pending" },
    source: { type: String, enum: ACADEMIC_YEAR_SOURCES, required: true },
    activatedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
academicYearSchema.plugin(tenantScope);
academicYearSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });
// Only one active year per school, enforced by the database itself.
academicYearSchema.index(
  { tenantId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_year_per_school" }
);
// Only one year from the sign-up form per school: saving the form again (or twice at once) updates it, never adds a second.
academicYearSchema.index(
  { tenantId: 1, source: 1 },
  { unique: true, partialFilterExpression: { source: "onboarding" }, name: "one_onboarding_year_per_school" }
);
academicYearSchema.index({ tenantId: 1, startDate: -1 });

export const AcademicYear = model<IAcademicYear>("AcademicYear", academicYearSchema);
