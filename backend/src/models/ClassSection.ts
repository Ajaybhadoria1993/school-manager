import { Schema, model, Types } from "mongoose";

// "Class" master, e.g. "Class 5"
export interface IClassMaster {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  name: string;
  order: number; // for sorting Nursery -> Class 12
  createdAt: Date;
  updatedAt: Date;
}

const classSchema = new Schema<IClassMaster>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
classSchema.index({ branchId: 1, name: 1 }, { unique: true });
export const ClassMaster = model<IClassMaster>("ClassMaster", classSchema);

// "Section", e.g. "A" under Class 5
export interface ISection {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  name: string;
  classTeacherId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const sectionSchema = new Schema<ISection>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true, index: true },
    name: { type: String, required: true, trim: true },
    classTeacherId: { type: Schema.Types.ObjectId, ref: "Staff" },
  },
  { timestamps: true }
);
sectionSchema.index({ classId: 1, name: 1 }, { unique: true });
export const Section = model<ISection>("Section", sectionSchema);

// "Subject", scoped to a class, optionally elective
export interface ISubject {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  name: string;
  isElective: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const subjectSchema = new Schema<ISubject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true, index: true },
    name: { type: String, required: true, trim: true },
    isElective: { type: Boolean, default: false },
  },
  { timestamps: true }
);
subjectSchema.index({ classId: 1, name: 1 }, { unique: true });
export const Subject = model<ISubject>("Subject", subjectSchema);
