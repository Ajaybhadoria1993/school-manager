import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { EMPLOYMENT_TYPES, MAX_DESIGNATION, MAX_EMPLOYEE_CODE, MAX_QUALIFICATION, MAX_TEACHER_NAME, TEACHER_GENDERS, type EmploymentType } from "../constants";

/**
 * A person who teaches at the school. A teacher is the same person every year; what they teach in a year is an Allotment (which
 * subject, which class) and the periods they take are in the timetable. They are never deleted: a teacher who has left is made
 * inactive, and every old timetable still says who taught it.
 *
 * A login is optional: the timetable is made by the school for the teacher. When the school gives one, `userId` is the User (role
 * "teacher") who signs in with a username and a password; that User is switched off when the teacher is made inactive.
 */
export interface ITeacher {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  /** Lower-cased, single-spaced name, for searching. Not unique: two teachers may share a name. */
  nameKey: string;
  /** 10 digits, unique in the school when given. */
  mobile: string | null;
  email: string | null;
  /** The school's own number for the person ("T-014"); upper case, unique in the school when given. */
  employeeCode: string | null;
  /** What they are able to teach: the timetable suggests them first for these subjects. Not a rule. */
  subjectIds: Types.ObjectId[];
  /** The most periods they should take in a day / a week; null = no limit. Going over is a warning in the timetable, not a refusal. */
  maxPeriodsPerDay: number | null;
  maxPeriodsPerWeek: number | null;
  /** The weekdays they do not come (1 = Monday ... 7 = Sunday): a part-time teacher. The timetable never puts a lesson on them. */
  offDays: number[];
  gender: (typeof TEACHER_GENDERS)[number] | null;
  /** Calendar days, as midnight UTC. */
  dateOfBirth: Date | null;
  address: { line1: string | null; city: string | null; state: string | null; pincode: string | null };
  /** What the school calls the post (PRT, TGT, PGT, Coordinator...). Free text. */
  designation: string | null;
  qualification: string | null;
  experienceYears: number | null;
  joiningDate: Date | null;
  employmentType: EmploymentType | null;
  isActive: boolean;
  userId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const teacherSchema = new Schema<ITeacher>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_TEACHER_NAME },
    nameKey: { type: String, required: true },
    mobile: { type: String, default: null },
    email: { type: String, default: null, lowercase: true, trim: true, maxlength: 254 },
    employeeCode: { type: String, default: null, trim: true, uppercase: true, maxlength: MAX_EMPLOYEE_CODE },
    subjectIds: { type: [{ type: Schema.Types.ObjectId, ref: "Subject" }], default: [] },
    maxPeriodsPerDay: { type: Number, default: null, min: 1 },
    maxPeriodsPerWeek: { type: Number, default: null, min: 1 },
    offDays: { type: [Number], default: [] },
    gender: { type: String, enum: TEACHER_GENDERS, default: null },
    dateOfBirth: { type: Date, default: null },
    address: {
      line1: { type: String, default: null, trim: true, maxlength: 200 },
      city: { type: String, default: null, trim: true, maxlength: 80 },
      state: { type: String, default: null, trim: true, maxlength: 60 },
      pincode: { type: String, default: null, trim: true, maxlength: 6 },
    },
    designation: { type: String, default: null, trim: true, maxlength: MAX_DESIGNATION },
    qualification: { type: String, default: null, trim: true, maxlength: MAX_QUALIFICATION },
    experienceYears: { type: Number, default: null, min: 0 },
    joiningDate: { type: Date, default: null },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: null },
    isActive: { type: Boolean, default: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
teacherSchema.plugin(tenantScope);
teacherSchema.index({ tenantId: 1, nameKey: 1 });
teacherSchema.index({ tenantId: 1, isActive: 1 });
// A mobile number and an employee code, when given, belong to one teacher of the school.
teacherSchema.index({ tenantId: 1, mobile: 1 }, { unique: true, partialFilterExpression: { mobile: { $type: "string" } }, name: "one_teacher_per_mobile" });
teacherSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true, partialFilterExpression: { employeeCode: { $type: "string" } }, name: "one_teacher_per_code" });

export const Teacher = model<ITeacher>("Teacher", teacherSchema);
