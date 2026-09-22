import { Schema, model, Types } from "mongoose";

export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "excused";

export interface IAttendance {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId;
  date: Date; // stored at midnight UTC for the calendar day
  status: AttendanceStatus;
  markedBy: Types.ObjectId; // staff userId
  isBackfilled: boolean; // S-4.1: flagged differently from real-time entries
  correctedAt?: Date;
  correctionNote?: string;
  notifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ["present", "absent", "late", "half_day", "excused"], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isBackfilled: { type: Boolean, default: false },
    correctedAt: { type: Date },
    correctionNote: { type: String },
    notifiedAt: { type: Date },
  },
  { timestamps: true }
);

attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ sectionId: 1, date: 1 });

export const Attendance = model<IAttendance>("Attendance", attendanceSchema);
