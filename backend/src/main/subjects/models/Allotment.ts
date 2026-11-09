import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_BACKUP_TEACHERS, MAX_BLOCK_SIZE, MAX_GROUP_NAME, MAX_PERIODS_PER_WEEK } from "../constants";

/**
 * What one class (or one section of it) studies in one academic year: a subject, how many periods a week, how those periods come
 * (`blockSize` 2 = in pairs of two periods after each other, for a lab) and who teaches it. It is the source of the timetable: a
 * lesson can only be put where the class studies it, and its teacher is the one named here (unless that lesson names another).
 *
 * The unit is a section, or the class itself when it has no sections (`sectionId` null). Subjects that are chosen between (a
 * third language, Maths or Biology) share a `group`: they are taught in the same periods, each to the students who chose it.
 */
export interface IAllotment {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  /** null for a class that has no sections: the class is the unit. */
  sectionId: Types.ObjectId | null;
  subjectId: Types.ObjectId;
  periodsPerWeek: number;
  /** 1 = single periods; 2 or 3 = that many consecutive periods at a time. */
  blockSize: number;
  /** The teacher of this subject in this unit (priority 1: the timetable uses this one). Null until the school decides. */
  teacherId: Types.ObjectId | null;
  /** The teachers who manage when the main teacher does not come, in order (priority 2, 3...). Never the main teacher; none without one. */
  backupTeacherIds: Types.ObjectId[];
  /** The choice this subject is one of ("Third language"), shown as typed; null for a subject everyone studies. */
  group: string | null;
  /** Lower-cased group: "third language" and "Third  Language" are one choice. */
  groupKey: string | null;
  /** Where it sits in the unit's list, lowest first. */
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

const allotmentSchema = new Schema<IAllotment>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    periodsPerWeek: { type: Number, required: true, min: 1, max: MAX_PERIODS_PER_WEEK },
    blockSize: { type: Number, required: true, default: 1, min: 1, max: MAX_BLOCK_SIZE },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    backupTeacherIds: { type: [{ type: Schema.Types.ObjectId, ref: "Teacher" }], default: [], validate: (v: unknown[]) => v.length <= MAX_BACKUP_TEACHERS },
    group: { type: String, default: null, trim: true, maxlength: MAX_GROUP_NAME },
    groupKey: { type: String, default: null },
    position: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
allotmentSchema.plugin(tenantScope);
// A subject appears once in a unit (a null section is a value like any other, so a class without sections has it once too).
allotmentSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1, subjectId: 1 }, { unique: true, name: "one_allotment_per_unit_and_subject" });
allotmentSchema.index({ tenantId: 1, academicYearId: 1, teacherId: 1 });
allotmentSchema.index({ tenantId: 1, subjectId: 1 });

export const Allotment = model<IAllotment>("Allotment", allotmentSchema);
