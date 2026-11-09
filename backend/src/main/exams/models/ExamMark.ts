import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * One child's result in one paper of an exam (2026-11-06): the marks they got, or that they were absent. A paper is written by whole
 * classes, but marks are entered class by class (section by section), so the row also keeps the class and section the child was in when
 * it was entered: a class that is deleted takes its rows with it, and a child who moves to another class keeps their results. A child with
 * no row has no result yet. Exactly one of `marks` and `absent` says something: an absent child has no marks.
 */
export interface IExamMark {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  examId: Types.ObjectId;
  paperId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  marks: number | null;
  absent: boolean;
  enteredBy: { name: string; role: string };
  createdAt: Date;
  updatedAt: Date;
}

const examMarkSchema = new Schema<IExamMark>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true },
    paperId: { type: Schema.Types.ObjectId, ref: "ExamPaper", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    marks: { type: Number, default: null, min: 0 },
    absent: { type: Boolean, default: false },
    enteredBy: { type: new Schema({ name: String, role: String }, { _id: false }), required: true },
  },
  { timestamps: true }
);

examMarkSchema.plugin(tenantScope);
// A child has one result per paper.
examMarkSchema.index({ tenantId: 1, paperId: 1, studentId: 1 }, { unique: true, name: "one_result_per_paper_and_child" });
// "This child's results this year" (the parent's page) and "this class's results in this paper" (the marks sheet).
examMarkSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1 });
examMarkSchema.index({ tenantId: 1, paperId: 1, classId: 1, sectionId: 1 });

export const ExamMark = model<IExamMark>("ExamMark", examMarkSchema);
