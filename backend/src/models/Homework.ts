import { Schema, model, Types } from "mongoose";

export interface IHomework {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId;
  subjectId: Types.ObjectId;
  title: string;
  description: string;
  attachmentUrl?: string;
  dueDate: Date;
  assignedBy: Types.ObjectId; // Staff
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const homeworkSchema = new Schema<IHomework>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    attachmentUrl: { type: String },
    dueDate: { type: Date, required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

homeworkSchema.index({ sectionId: 1, dueDate: -1 });

export const Homework = model<IHomework>("Homework", homeworkSchema);
