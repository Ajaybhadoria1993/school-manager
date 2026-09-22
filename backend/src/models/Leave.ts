import { Schema, model, Types } from "mongoose";

export type LeaveType = "casual" | "sick" | "earned" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ILeaveRequest {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  staffId: Types.ObjectId;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: LeaveStatus;
  appliedBy: Types.ObjectId;
  decidedBy?: Types.ObjectId;
  decisionNote?: string;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const leaveRequestSchema = new Schema<ILeaveRequest>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: "Staff", required: true, index: true },
    leaveType: { type: String, enum: ["casual", "sick", "earned", "other"], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
    appliedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decisionNote: { type: String },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ staffId: 1, status: 1 });

export const LeaveRequest = model<ILeaveRequest>("LeaveRequest", leaveRequestSchema);

// Simple per-year, per-type allocation/usage tracker (FR-3.5: "leave balance auto-updated").
export interface ILeaveBalance {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  staffId: Types.ObjectId;
  year: number;
  allocations: { leaveType: LeaveType; allocated: number; used: number }[];
}

const leaveBalanceSchema = new Schema<ILeaveBalance>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
  staffId: { type: Schema.Types.ObjectId, ref: "Staff", required: true, index: true },
  year: { type: Number, required: true },
  allocations: [
    {
      leaveType: { type: String, enum: ["casual", "sick", "earned", "other"], required: true },
      allocated: { type: Number, required: true, default: 12 },
      used: { type: Number, required: true, default: 0 },
    },
  ],
});

leaveBalanceSchema.index({ staffId: 1, year: 1 }, { unique: true });

export const LeaveBalance = model<ILeaveBalance>("LeaveBalance", leaveBalanceSchema);

// Substitution assignment while a teacher is on approved leave (FR-3.4).
// Scoped to a single allocation (class+section+subject) for the leave's
// date range, so the substitute only gets temporary access to that specific
// class/subject slot, not the original teacher's full timetable.
export interface ISubstitution {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  leaveRequestId: Types.ObjectId;
  originalStaffId: Types.ObjectId;
  substituteStaffId: Types.ObjectId;
  allocationId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const substitutionSchema = new Schema<ISubstitution>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    leaveRequestId: { type: Schema.Types.ObjectId, ref: "LeaveRequest", required: true, index: true },
    originalStaffId: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    substituteStaffId: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    allocationId: { type: Schema.Types.ObjectId, ref: "TeacherAllocation", required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true }
);

substitutionSchema.index({ allocationId: 1, leaveRequestId: 1 }, { unique: true });

export const Substitution = model<ISubstitution>("Substitution", substitutionSchema);
