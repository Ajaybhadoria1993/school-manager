import { Schema, model, Types } from "mongoose";

export type ExamType = "unit_test" | "mid_term" | "final" | "other";

export interface IExam {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  name: string;
  examType: ExamType;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const examSchema = new Schema<IExam>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true, index: true },
    name: { type: String, required: true, trim: true },
    examType: { type: String, enum: ["unit_test", "mid_term", "final", "other"], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true }
);

export const Exam = model<IExam>("Exam", examSchema);

// One subject "paper" within an exam — carries the weightage split (FR-6.4:
// Internal + Written) and its own lock state, so a teacher submitting Maths
// marks doesn't lock Science for the same exam.
export interface IExamSubject {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  examId: Types.ObjectId;
  subjectId: Types.ObjectId;
  examDate?: Date;
  maxInternal: number;
  maxWritten: number;
  isLocked: boolean;
  lockedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const examSubjectSchema = new Schema<IExamSubject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    examDate: { type: Date },
    maxInternal: { type: Number, default: 0 },
    maxWritten: { type: Number, required: true },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date },
  },
  { timestamps: true }
);

examSubjectSchema.index({ examId: 1, subjectId: 1 }, { unique: true });

export const ExamSubject = model<IExamSubject>("ExamSubject", examSubjectSchema);

// Individual student's marks for one exam-subject paper.
export interface IMark {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  examSubjectId: Types.ObjectId;
  studentId: Types.ObjectId;
  internalMarks: number;
  writtenMarks: number;
  isAbsent: boolean;
  enteredBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const markSchema = new Schema<IMark>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    examSubjectId: { type: Schema.Types.ObjectId, ref: "ExamSubject", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    internalMarks: { type: Number, default: 0 },
    writtenMarks: { type: Number, default: 0 },
    isAbsent: { type: Boolean, default: false },
    enteredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

markSchema.index({ examSubjectId: 1, studentId: 1 }, { unique: true });

export const Mark = model<IMark>("Mark", markSchema);

// Per-student, per-exam report card gate (FR-6.6): stays invisible to
// parents/students until a Principal explicitly publishes it. The marks
// table itself is always computed live from Mark documents, so a correction
// made after publish (with the record reopened) is reflected immediately.
export type ReportCardStatus = "draft" | "published";

export interface IReportCard {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: ReportCardStatus;
  teacherRemarks?: string;
  publishedBy?: Types.ObjectId;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reportCardSchema = new Schema<IReportCard>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    teacherRemarks: { type: String },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

reportCardSchema.index({ examId: 1, studentId: 1 }, { unique: true });

export const ReportCard = model<IReportCard>("ReportCard", reportCardSchema);
