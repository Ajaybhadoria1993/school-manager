import { Schema, model, Types } from "mongoose";

// 0 = Sunday ... 6 = Saturday (JS Date.getDay() convention), so client-side
// weekly grids can index directly off a plain Date without translation.
export interface ITimetableSlot {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  sectionId: Types.ObjectId;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string; // "09:00"
  endTime: string; // "09:40"
  isBreak: boolean;
  subjectId?: Types.ObjectId;
  staffId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const timetableSlotSchema = new Schema<ITimetableSlot>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    periodNumber: { type: Number, required: true, min: 1 },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    isBreak: { type: Boolean, default: false },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
    staffId: { type: Schema.Types.ObjectId, ref: "Staff" },
  },
  { timestamps: true }
);

// One slot per section/day/period — creating a new one for the same
// coordinates replaces the previous assignment (upsert in the controller).
timetableSlotSchema.index({ sectionId: 1, dayOfWeek: 1, periodNumber: 1 }, { unique: true });

export const TimetableSlot = model<ITimetableSlot>("TimetableSlot", timetableSlotSchema);
