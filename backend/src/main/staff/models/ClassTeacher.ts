import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * The class teacher of one unit in one academic year: a section ("Class 5 - A"), or a class that has no sections (`sectionId` null). One
 * per unit; a teacher may be the class teacher of more than one (a small school). Kept per year, like the sections: next year's
 * Class 5 - A has its own.
 */
export interface IClassTeacher {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  /** null for a class that has no sections: the class is the unit. */
  sectionId: Types.ObjectId | null;
  teacherId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const classTeacherSchema = new Schema<IClassTeacher>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
classTeacherSchema.plugin(tenantScope);
// One class teacher per unit and year (a null section is a value like any other).
classTeacherSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1 }, { unique: true, name: "one_class_teacher_per_unit" });
classTeacherSchema.index({ tenantId: 1, academicYearId: 1, teacherId: 1 });

export const ClassTeacher = model<IClassTeacher>("ClassTeacher", classTeacherSchema);
