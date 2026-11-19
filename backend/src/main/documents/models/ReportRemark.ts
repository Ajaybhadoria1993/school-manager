import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/** What the class teacher (or the school) writes on one child's report card for one exam ("Asha works hard; needs to write neatly"). One per child and exam. */
export interface IReportRemark {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  remark: string;
  writtenBy: { userId: Types.ObjectId; name: string };
  createdAt: Date;
  updatedAt: Date;
}

export const MAX_REMARK = 300;

const reportRemarkSchema = new Schema<IReportRemark>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true, immutable: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    remark: { type: String, required: true, trim: true, maxlength: MAX_REMARK },
    writtenBy: { type: new Schema({ userId: { type: Schema.Types.ObjectId, required: true }, name: { type: String, required: true } }, { _id: false }), required: true },
  },
  { timestamps: true }
);

reportRemarkSchema.plugin(tenantScope);
reportRemarkSchema.index({ tenantId: 1, examId: 1, studentId: 1 }, { unique: true, name: "one_remark_per_child_and_exam" });

export const ReportRemark = model<IReportRemark>("ReportRemark", reportRemarkSchema);
