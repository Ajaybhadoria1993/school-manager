import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * A class's written work (docs/parent-teacher-flow.md, phases 4 and 5).
 *
 * `DiaryEntry`: for one subject of a section (or a class without sections) on one day, what was taught and the homework, and who wrote
 * it. One per class, section, day and subject; writing again replaces it.
 *
 * `ClassTest`: a test of one subject on a date (its topic, out of how many marks), and after it each child's marks (or absent).
 */
export interface IDiaryEntry {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  date: Date;
  subjectId: Types.ObjectId;
  taught: string;
  homework: string;
  writtenBy: { name: string; role: string };
  createdAt: Date;
  updatedAt: Date;
}

const actorSchema = new Schema({ name: String, role: String }, { _id: false });

const diaryEntrySchema = new Schema<IDiaryEntry>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    date: { type: Date, required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    taught: { type: String, default: "", trim: true, maxlength: 500 },
    homework: { type: String, default: "", trim: true, maxlength: 500 },
    writtenBy: { type: actorSchema, required: true },
  },
  { timestamps: true }
);
diaryEntrySchema.plugin(tenantScope);
diaryEntrySchema.index({ tenantId: 1, classId: 1, sectionId: 1, date: 1, subjectId: 1 }, { unique: true, name: "one_diary_entry_per_subject_day" });

export const DiaryEntry = model<IDiaryEntry>("DiaryEntry", diaryEntrySchema);

export interface IClassTest {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  subjectId: Types.ObjectId;
  date: Date;
  topic: string;
  maxMarks: number;
  createdBy: { name: string; role: string };
  marks: { studentId: Types.ObjectId; marks: number | null; absent: boolean }[];
  createdAt: Date;
  updatedAt: Date;
}

const classTestSchema = new Schema<IClassTest>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    date: { type: Date, required: true },
    topic: { type: String, required: true, trim: true, maxlength: 200 },
    maxMarks: { type: Number, required: true, min: 1, max: 1000 },
    createdBy: { type: actorSchema, required: true },
    marks: {
      type: [new Schema({ studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true }, marks: { type: Number, default: null }, absent: { type: Boolean, default: false } }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true }
);
classTestSchema.plugin(tenantScope);
classTestSchema.index({ tenantId: 1, classId: 1, sectionId: 1, date: 1 });

export const ClassTest = model<IClassTest>("ClassTest", classTestSchema);
