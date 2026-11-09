import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_TOPIC } from "../constants";

/**
 * One paper of an exam: a subject, on one day, at one time, for so many minutes, for one class or several at once (the same date and time
 * for a group of classes, or the whole school), with an optional topic and marks. `start` is minutes after midnight. A class is never in
 * two papers that overlap on one day, in one exam or across the exams of the year.
 */
export interface IExamPaper {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  examId: Types.ObjectId;
  classIds: Types.ObjectId[];
  subjectId: Types.ObjectId;
  date: Date;
  start: number;
  duration: number;
  maxMarks: number | null;
  topic: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const examPaperSchema = new Schema<IExamPaper>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true },
    classIds: { type: [{ type: Schema.Types.ObjectId, ref: "SchoolClass" }], required: true, validate: (v: unknown[]) => v.length > 0 },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    date: { type: Date, required: true },
    start: { type: Number, required: true, min: 0, max: 1439 },
    duration: { type: Number, required: true, min: 1, max: 1440 },
    maxMarks: { type: Number, default: null, min: 1, max: 1000 },
    topic: { type: String, default: null, trim: true, maxlength: MAX_TOPIC },
  },
  { timestamps: true }
);

examPaperSchema.plugin(tenantScope);
examPaperSchema.index({ tenantId: 1, examId: 1, date: 1, start: 1 });
// "Which classes are busy on this day": the clash check reads a day of the year at a time.
examPaperSchema.index({ tenantId: 1, academicYearId: 1, date: 1 });

export const ExamPaper = model<IExamPaper>("ExamPaper", examPaperSchema);
