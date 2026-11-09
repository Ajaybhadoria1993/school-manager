import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { EXAM_TYPES, MAX_EXAM_NAME, MAX_NOTE, type ExamType } from "../constants";

/**
 * An exam or a test of one academic year (Test & Exam, Manage school): Half-Yearly, Annual, Unit test, Monthly test, Class test. It has
 * the days it runs (`endDate` is the last day, the first day for a one-day test), and for a full exam the hours the school keeps while it
 * is on (minutes after midnight, both or neither). What each class writes on which day is its `ExamPaper`s.
 */
export interface IExam {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  name: string;
  /** Lower-cased, single-spaced name: two exams of one year cannot have the same name. */
  nameKey: string;
  type: ExamType;
  startDate: Date;
  endDate: Date;
  schoolStart: number | null;
  schoolEnd: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const examSchema = new Schema<IExam>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    name: { type: String, required: true, trim: true, maxlength: MAX_EXAM_NAME },
    nameKey: { type: String, required: true },
    type: { type: String, enum: EXAM_TYPES, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    schoolStart: { type: Number, default: null, min: 0, max: 1439 },
    schoolEnd: { type: Number, default: null, min: 1, max: 1440 },
    note: { type: String, default: null, trim: true, maxlength: MAX_NOTE },
  },
  { timestamps: true }
);

examSchema.plugin(tenantScope);
examSchema.index({ tenantId: 1, academicYearId: 1, nameKey: 1 }, { unique: true, name: "one_exam_per_name_and_year" });
examSchema.index({ tenantId: 1, academicYearId: 1, startDate: 1 });

export const Exam = model<IExam>("Exam", examSchema);
