import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_DESIGNATION, MAX_EMPLOYEE_CODE, MAX_ROLE_OTHER, MAX_TEACHER_NAME, STAFF_MEMBER_ROLE_KEYS, STAFF_MEMBER_STATUSES, TEACHER_GENDERS, type StaffMemberRole, type StaffMemberStatus } from "../constants";

/**
 * A person who works for the school without teaching (a receptionist, an accountant, a member of the management). The school adds them
 * with their details, a role and a **username and password it makes itself** (2026-11-08, like a teacher's or a parent's login): the User is
 * made with them and `userId` points at it (`active`); the school can switch them off (`inactive`: their login closes) and back on. Never
 * deleted once they have a login. `invited` is only what a person added before that is, until the school makes their login: they have none.
 */
export interface IStaffMember {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  /** Lower-cased, single-spaced name, for searching. */
  nameKey: string;
  /** An email, when the school has one (optional): also a way to sign in. Unique in the school. */
  email: string | null;
  mobile: string | null;
  role: StaffMemberRole;
  /** The role's name when `role` is "other" (the school writes it); null for every other role. */
  roleOther: string | null;
  /**
   * Also teaches (a vice principal who takes Maths). With their login they become a Teacher of the school too
   * (`teacherId`), with `subjectIds` as what they can teach; and, when their role has no pages of its own, they sign in as a teacher.
   */
  alsoTeacher: boolean;
  subjectIds: Types.ObjectId[];
  /** Their Teacher record, once they have a login and teach. */
  teacherId: Types.ObjectId | null;
  gender: (typeof TEACHER_GENDERS)[number] | null;
  dateOfBirth: Date | null;
  address: { line1: string | null; city: string | null; state: string | null; pincode: string | null };
  designation: string | null;
  employeeCode: string | null;
  joiningDate: Date | null;
  status: StaffMemberStatus;
  /** The login (null only for a person added before the school made logins itself). */
  userId: Types.ObjectId | null;
  /** Who added them, and when. */
  invitedBy: Types.ObjectId | null;
  invitedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const staffMemberSchema = new Schema<IStaffMember>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_TEACHER_NAME },
    nameKey: { type: String, required: true },
    email: { type: String, default: null, lowercase: true, trim: true, maxlength: 254 },
    mobile: { type: String, default: null },
    role: { type: String, enum: STAFF_MEMBER_ROLE_KEYS, required: true },
    roleOther: { type: String, default: null, trim: true, maxlength: MAX_ROLE_OTHER },
    alsoTeacher: { type: Boolean, default: false },
    subjectIds: { type: [{ type: Schema.Types.ObjectId, ref: "Subject" }], default: [] },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    gender: { type: String, enum: TEACHER_GENDERS, default: null },
    dateOfBirth: { type: Date, default: null },
    address: {
      line1: { type: String, default: null, trim: true, maxlength: 200 },
      city: { type: String, default: null, trim: true, maxlength: 80 },
      state: { type: String, default: null, trim: true, maxlength: 60 },
      pincode: { type: String, default: null, trim: true, maxlength: 6 },
    },
    designation: { type: String, default: null, trim: true, maxlength: MAX_DESIGNATION },
    employeeCode: { type: String, default: null, trim: true, uppercase: true, maxlength: MAX_EMPLOYEE_CODE },
    joiningDate: { type: Date, default: null },
    status: { type: String, enum: STAFF_MEMBER_STATUSES, default: "invited" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    invitedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

staffMemberSchema.plugin(tenantScope);
staffMemberSchema.index({ tenantId: 1, nameKey: 1 });
staffMemberSchema.index({ tenantId: 1, status: 1 });
staffMemberSchema.index({ tenantId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } }, name: "one_staff_member_per_email" });
staffMemberSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true, partialFilterExpression: { employeeCode: { $type: "string" } }, name: "one_staff_member_per_code" });

export const StaffMember = model<IStaffMember>("StaffMember", staffMemberSchema);
