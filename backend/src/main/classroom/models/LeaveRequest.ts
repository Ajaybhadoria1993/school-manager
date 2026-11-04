import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const LEAVE_STATUSES = ["pending", "approved", "declined", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/**
 * A parent's leave application for their child (docs/parent-teacher-flow.md, phase 2). The child's class and section when it was sent are
 * kept, so it reaches that class's class teacher; who sent it ("Ravi Verma (Father)") and who answered it are kept as words, as they were.
 */
export interface ILeaveRequest {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  studentId: Types.ObjectId;
  guardianId: Types.ObjectId;
  classId: Types.ObjectId | null;
  sectionId: Types.ObjectId | null;
  label: string;
  fromDate: Date;
  toDate: Date;
  reason: string;
  appliedBy: string;
  status: LeaveStatus;
  note: string | null;
  decidedBy: { name: string; role: string } | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const leaveRequestSchema = new Schema<ILeaveRequest>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    guardianId: { type: Schema.Types.ObjectId, ref: "Guardian", required: true },
    classId: { type: Schema.Types.ObjectId, default: null },
    sectionId: { type: Schema.Types.ObjectId, default: null },
    label: { type: String, default: "" },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    appliedBy: { type: String, required: true },
    status: { type: String, enum: LEAVE_STATUSES, default: "pending" },
    note: { type: String, default: null, maxlength: 300 },
    decidedBy: { type: new Schema({ name: String, role: String }, { _id: false }), default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

leaveRequestSchema.plugin(tenantScope);
leaveRequestSchema.index({ tenantId: 1, studentId: 1, createdAt: -1 });
leaveRequestSchema.index({ tenantId: 1, classId: 1, sectionId: 1, status: 1 });

export const LeaveRequest = model<ILeaveRequest>("LeaveRequest", leaveRequestSchema);
