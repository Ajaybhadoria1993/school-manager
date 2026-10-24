import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { ENROLMENT_STATUSES, MAX_ROLL_NUMBER, type EnrolmentStatus } from "../constants";

/**
 * One student in ONE academic year: their class, their section (null when the class is not split into sections) and roll number.
 * A new session gets a new enrolment (promotion, later); the old one stays exactly as it was, so last year's class, attendance and
 * fees keep pointing at last year's place. The section is always a section of the same year (checked when it is written).
 */
export interface IEnrolment {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  studentId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  rollNumber: number | null;
  status: EnrolmentStatus;
  enrolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const enrolmentSchema = new Schema<IEnrolment>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    rollNumber: { type: Number, default: null, min: 1, max: MAX_ROLL_NUMBER },
    status: { type: String, enum: ENROLMENT_STATUSES, required: true, default: "active" },
    enrolledAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
enrolmentSchema.plugin(tenantScope);
// One enrolment per student per academic year.
enrolmentSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1 }, { unique: true, name: "one_enrolment_per_student_and_year" });
// A roll number is used once in a section in a year (in a class, for a class without sections).
enrolmentSchema.index(
  { tenantId: 1, academicYearId: 1, classId: 1, sectionId: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { rollNumber: { $type: "number" } }, name: "one_roll_number_per_section_and_year" }
);
// The year's list and the seat counts by section.
enrolmentSchema.index({ tenantId: 1, academicYearId: 1, sectionId: 1, status: 1 });
// "Does this class have students?" across every year (the class delete guard).
enrolmentSchema.index({ tenantId: 1, classId: 1, academicYearId: 1 });

export const Enrolment = model<IEnrolment>("Enrolment", enrolmentSchema);
