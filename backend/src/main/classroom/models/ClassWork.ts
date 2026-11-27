import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const MAX_CHAPTERS = 60;
export const MAX_CHAPTER_NAME = 120;

/**
 * A class's written work (docs/parent-teacher-flow.md, phases 4 and 5).
 *
 * `DiaryEntry`: for one subject of a section (or a class without sections) on one day, what was taught and the homework, and who wrote
 * it. One per class, section, day and subject; writing again replaces it.
 *
 * `Syllabus`: the chapters of one subject of a class in a year (docs/teaching-progress.md), in order, each with the day it is planned to be
 * finished by (if the school plans one) and the day it was finished. A day's diary names the chapter taught (`chapterId`).
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
  /** The chapter of the subject's Syllabus taught that day; null when the teacher named none. */
  chapterId: Types.ObjectId | null;
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
    chapterId: { type: Schema.Types.ObjectId, default: null },
    writtenBy: { type: actorSchema, required: true },
  },
  { timestamps: true }
);
diaryEntrySchema.plugin(tenantScope);
diaryEntrySchema.index({ tenantId: 1, classId: 1, sectionId: 1, date: 1, subjectId: 1 }, { unique: true, name: "one_diary_entry_per_subject_day" });

// Teaching progress reads a year's entries by their days.
diaryEntrySchema.index({ tenantId: 1, academicYearId: 1, date: -1 });

export const DiaryEntry = model<IDiaryEntry>("DiaryEntry", diaryEntrySchema);

export interface IChapter {
  _id: Types.ObjectId;
  name: string;
  /** The day it was finished; null while it is not. */
  completedOn: Date | null;
  /** The day it is to be finished by; null when none is planned. Gone and not finished: the chapter is late. */
  plannedOn: Date | null;
  /** The day the school was told it is late (told once for a planned day); null when not told. */
  lateToldOn: Date | null;
}

export interface ISyllabus {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  subjectId: Types.ObjectId;
  chapters: IChapter[];
  updatedBy: { name: string; role: string };
  createdAt: Date;
  updatedAt: Date;
}

const syllabusSchema = new Schema<ISyllabus>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    chapters: {
      type: [
        new Schema({
          name: { type: String, required: true, trim: true, maxlength: MAX_CHAPTER_NAME },
          completedOn: { type: Date, default: null },
          plannedOn: { type: Date, default: null },
          lateToldOn: { type: Date, default: null },
        }),
      ],
      default: [],
    },
    updatedBy: { type: actorSchema, required: true },
  },
  { timestamps: true }
);
syllabusSchema.plugin(tenantScope);
syllabusSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1, subjectId: 1 }, { unique: true, name: "one_syllabus_per_unit_subject_year" });

export const Syllabus = model<ISyllabus>("Syllabus", syllabusSchema);

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
