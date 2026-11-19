import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { CONCESSION_MODES, MAX_NAME, MAX_NOTE, type ConcessionMode } from "../constants";

/**
 * A concession given to ONE student for ONE session (the school's list of concessions is `Concession`; this is it given). It keeps the rule as
 * it was when given (mode, value, which fees), so changing the school's concession later does not change what a family was promised. A concession
 * that needs approval is `pending` and takes nothing off until the school admin or the principal approves it.
 */
export interface IStudentConcession {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  studentId: Types.ObjectId;
  concessionId: Types.ObjectId;
  name: string;
  mode: ConcessionMode;
  value: number;
  /** Empty: every fee; otherwise only these heads. */
  headIds: Types.ObjectId[];
  status: "pending" | "approved";
  /** Why this student gets it (the proof is kept by the school office). */
  note: string | null;
  givenBy: { userId: Types.ObjectId; name: string };
  approvedBy: { userId: Types.ObjectId; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const personSchema = new Schema({ userId: { type: Schema.Types.ObjectId, required: true }, name: { type: String, required: true } }, { _id: false });

const studentConcessionSchema = new Schema<IStudentConcession>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    concessionId: { type: Schema.Types.ObjectId, ref: "Concession", required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    mode: { type: String, enum: CONCESSION_MODES, required: true },
    value: { type: Number, required: true, min: 0 },
    headIds: { type: [Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ["pending", "approved"], required: true },
    note: { type: String, default: null, trim: true, maxlength: MAX_NOTE },
    givenBy: { type: personSchema, required: true },
    approvedBy: { type: personSchema, default: null },
  },
  { timestamps: true }
);

studentConcessionSchema.plugin(tenantScope);
// A student has each concession once in a session.
studentConcessionSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1, concessionId: 1 }, { unique: true, name: "one_concession_per_student_and_year" });
studentConcessionSchema.index({ tenantId: 1, academicYearId: 1, status: 1 });

export const StudentConcession = model<IStudentConcession>("StudentConcession", studentConcessionSchema);
