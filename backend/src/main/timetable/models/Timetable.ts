import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_LESSONS_PER_CELL, MAX_ROOM } from "../constants";

/**
 * What is taught in one period: a subject, its teacher (only when it is not the teacher the class's subject list names) and a room (a
 * lab, the ground), if the lesson needs one.
 */
export interface ILesson {
  subjectId: Types.ObjectId;
  /** Null: the teacher named in the class's subject list (the Allotment). Set: this lesson has another teacher. */
  teacherId: Types.ObjectId | null;
  room: string | null;
}

/** One period of one day. Only periods with a lesson are stored. */
export interface ICell {
  day: number;
  /** 1 = the first period of that day's timing. */
  period: number;
  /** One lesson, or the lessons of a choice taught side by side (see Allotment.group). */
  lessons: ILesson[];
}

/**
 * The weekly timetable of one class or section in one academic year. `sectionId` is null for a class that has no sections. A
 * timetable is a draft until it is published; after that a change is live at once (who changed it and when is kept).
 */
export interface ITimetable {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  cells: ICell[];
  status: "draft" | "published";
  publishedAt: Date | null;
  publishedBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const lessonSchema = new Schema<ILesson>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    room: { type: String, default: null, trim: true, maxlength: MAX_ROOM },
  },
  { _id: false }
);

const cellSchema = new Schema<ICell>(
  {
    day: { type: Number, required: true, min: 1, max: 7 },
    period: { type: Number, required: true, min: 1 },
    lessons: { type: [lessonSchema], required: true, validate: (lessons: unknown[]) => lessons.length >= 1 && lessons.length <= MAX_LESSONS_PER_CELL },
  },
  { _id: false }
);

const timetableSchema = new Schema<ITimetable>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    cells: { type: [cellSchema], default: [] },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
timetableSchema.plugin(tenantScope);
// One timetable per class or section per year (a null section is a value like any other, so a class without sections has one too).
timetableSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1 }, { unique: true, name: "one_timetable_per_unit" });
timetableSchema.index({ tenantId: 1, academicYearId: 1 });

export const Timetable = model<ITimetable>("Timetable", timetableSchema);
