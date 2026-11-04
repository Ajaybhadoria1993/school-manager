import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const CHANGE_KINDS = ["moved", "transferred_out"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Where a student sat, as it was written down then (a class or section may be renamed or removed later, so the names are kept too). */
export interface IPlaceSnapshot {
  classId: Types.ObjectId;
  className: string;
  sectionId: Types.ObjectId | null;
  sectionName: string | null;
  rollNumber: number | null;
}

/** The transfer certificate details of a student who leaves for another school. */
export interface ITransferSchool {
  schoolName: string;
  tcNumber: string | null;
  /** The day, "2026-10-20". */
  tcDate: string | null;
  remarks: string | null;
}

/**
 * One line of a student's movements in an academic year: moved to another class, section or roll number, or transferred out to another
 * school. The year's enrolment is changed in place, so this is the history that says where the student was before, who changed it, when
 * and why. Written once and never changed; nothing is deleted when a student is moved or transferred. It belongs to the session it
 * happened in (`academicYearId`).
 */
export interface IEnrolmentChange {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  studentId: Types.ObjectId;
  enrolmentId: Types.ObjectId;
  kind: ChangeKind;
  /** Where they were; null never happens today (every change starts from a place). */
  from: IPlaceSnapshot | null;
  /** Where they went; null for a transfer out. */
  to: IPlaceSnapshot | null;
  reason: string | null;
  /** Only for `transferred_out`. */
  school: ITransferSchool | null;
  by: { userId: Types.ObjectId; name: string; role: string };
  createdAt: Date;
}

const placeSchema = new Schema<IPlaceSnapshot>(
  {
    classId: { type: Schema.Types.ObjectId, required: true },
    className: { type: String, required: true },
    sectionId: { type: Schema.Types.ObjectId, default: null },
    sectionName: { type: String, default: null },
    rollNumber: { type: Number, default: null },
  },
  { _id: false }
);

const schema = new Schema<IEnrolmentChange>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    enrolmentId: { type: Schema.Types.ObjectId, ref: "Enrolment", required: true },
    kind: { type: String, enum: CHANGE_KINDS, required: true },
    from: { type: placeSchema, default: null },
    to: { type: placeSchema, default: null },
    reason: { type: String, default: null, maxlength: 200 },
    school: {
      type: new Schema<ITransferSchool>(
        {
          schoolName: { type: String, required: true },
          tcNumber: { type: String, default: null },
          tcDate: { type: String, default: null },
          remarks: { type: String, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    by: {
      userId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
schema.plugin(tenantScope);
// "The movements of this student", newest first.
schema.index({ tenantId: 1, studentId: 1, createdAt: -1 });

export const EnrolmentChange = model<IEnrolmentChange>("EnrolmentChange", schema);
