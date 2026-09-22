import { Schema, model, Types } from "mongoose";

export interface IAcademicYear {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  name: string; // e.g. "2026-27"
  startDate: Date;
  endDate: Date;
  terms: { name: string; startDate: Date; endDate: Date }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const academicYearSchema = new Schema<IAcademicYear>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    terms: [
      {
        name: { type: String, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

academicYearSchema.index({ branchId: 1, name: 1 }, { unique: true });

export const AcademicYear = model<IAcademicYear>("AcademicYear", academicYearSchema);
