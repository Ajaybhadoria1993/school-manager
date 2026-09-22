import { Schema, model, Types } from "mongoose";

export type StaffCategory = "teaching" | "admin" | "transport" | "support";

export interface IStaff {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  employeeId: string;
  name: string;
  category: StaffCategory;
  designation: string;
  phone: string;
  email?: string;
  qualification?: string;
  aadhaarLast4?: string; // only last 4 digits kept for reference; full value masked/not stored in MVP
  panLast4?: string;
  salaryGrade?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const staffSchema = new Schema<IStaff>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    employeeId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ["teaching", "admin", "transport", "support"], required: true },
    designation: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    qualification: { type: String },
    aadhaarLast4: { type: String },
    panLast4: { type: String },
    salaryGrade: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

staffSchema.index({ branchId: 1, employeeId: 1 }, { unique: true });

export const Staff = model<IStaff>("Staff", staffSchema);

// Teacher-Subject-Class allocation matrix (FR-3.3)
export interface ITeacherAllocation {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  staffId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId;
  subjectId: Types.ObjectId;
  isClassTeacher: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const allocationSchema = new Schema<ITeacherAllocation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: "Staff", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    isClassTeacher: { type: Boolean, default: false },
  },
  { timestamps: true }
);

allocationSchema.index({ sectionId: 1, subjectId: 1 }, { unique: true });

export const TeacherAllocation = model<ITeacherAllocation>("TeacherAllocation", allocationSchema);
