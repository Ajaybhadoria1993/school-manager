import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const STAFF_LEAVE_STATUSES = ["pending", "approved", "declined", "cancelled"] as const;
export type StaffLeaveStatus = (typeof STAFF_LEAVE_STATUSES)[number];
export const STAFF_LEAVE_KINDS = ["teacher", "staff"] as const;
export type StaffLeaveKind = (typeof STAFF_LEAVE_KINDS)[number];
/** The longest reason a leave takes, and the most days one leave covers. */
export const MAX_LEAVE_REASON = 300;
export const MAX_STAFF_LEAVE_DAYS = 60;

/**
 * A teacher's or a staff member's leave application (2026-11-24, user: "teacher login se leave daal sake, admin side par application jaisa aaye
 * reason ke saath, aur status"). They apply from their own login for today or days to come; the school (admin or principal) approves or declines it
 * (with a note). An approved leave is what makes the person "on leave" for those days: their attendance reads Leave, not Absent, and the arrangement
 * page lists their periods for a substitute, for days to come too. The person can take a leave back (a waiting one, or an approved one that has not
 * started). Who the person was is kept as words, as it was, so a later change of name or role does not rewrite an old application.
 */
export interface IStaffLeave {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  kind: StaffLeaveKind;
  /** Which record the leave is of: a teacher's (kind "teacher") or a staff member's (kind "staff"); the other is null. */
  teacherId: Types.ObjectId | null;
  staffMemberId: Types.ObjectId | null;
  /** The login that applied (the one the answer is sent to). */
  userId: Types.ObjectId;
  personName: string;
  /** "Teacher", or the staff member's role ("Receptionist"). */
  roleLabel: string;
  /** "2026-11-25": the calendar days in India, both included. */
  fromDate: string;
  toDate: string;
  reason: string;
  status: StaffLeaveStatus;
  /** The school's note with its answer. */
  note: string | null;
  decidedBy: { name: string; role: string } | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const staffLeaveSchema = new Schema<IStaffLeave>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    kind: { type: String, enum: STAFF_LEAVE_KINDS, required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    staffMemberId: { type: Schema.Types.ObjectId, ref: "StaffMember", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    personName: { type: String, required: true, trim: true },
    roleLabel: { type: String, required: true, trim: true },
    fromDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    toDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, required: true, trim: true, maxlength: MAX_LEAVE_REASON },
    status: { type: String, enum: STAFF_LEAVE_STATUSES, default: "pending" },
    note: { type: String, default: null, maxlength: MAX_LEAVE_REASON },
    decidedBy: { type: new Schema({ name: String, role: String }, { _id: false }), default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

staffLeaveSchema.plugin(tenantScope);
staffLeaveSchema.index({ tenantId: 1, status: 1, fromDate: 1 });
staffLeaveSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
staffLeaveSchema.index({ tenantId: 1, kind: 1, status: 1, fromDate: 1, toDate: 1 });

export const StaffLeave = model<IStaffLeave>("StaffLeave", staffLeaveSchema);
