import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * A teacher's resume (docs/profiles.md), one per teacher record. Kept apart from the record, which is read all the time, and never served at
 * a public address. Only a PDF or Word file checked by its first bytes is stored (see ResumeService).
 */
export interface ITeacherResume {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  teacherId: Types.ObjectId;
  data: Buffer;
  contentType: string;
  fileName: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

const teacherResumeSchema = new Schema<ITeacherResume>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true, immutable: true },
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    fileName: { type: String, required: true, maxlength: 160 },
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

teacherResumeSchema.plugin(tenantScope);
teacherResumeSchema.index({ tenantId: 1, teacherId: 1 }, { unique: true, name: "one_resume_per_teacher" });

export const TeacherResume = model<ITeacherResume>("TeacherResume", teacherResumeSchema);
