import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * A parent or guardian, as ONE record however many children they have at the school: students link to it (Student.guardians), so
 * a mother of three is one guardian with three children, and a parent login (later) can show all of them.
 *
 * The mobile number is the planned login identity (mobile + OTP), so it is kept as its 10 digits and is unique in the school: the
 * database refuses a second guardian with the same mobile, and an admission LINKS the existing guardian instead of copying it.
 * `mobileVerifiedAt` stays null until an OTP proves the number (not built yet). A guardian has no User account yet.
 * Year-free on purpose: a parent is the same person every session (see YEAR_FREE_MODELS).
 */
export interface IGuardian {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  /** 10 digits, no +91. null only for a second guardian whose number was not given. */
  mobile: string | null;
  mobileVerifiedAt: Date | null;
  alternateMobile: string | null;
  email: string | null;
  occupation: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const guardianSchema = new Schema<IGuardian>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    mobile: { type: String, default: null, match: /^[6-9]\d{9}$/ },
    mobileVerifiedAt: { type: Date, default: null },
    alternateMobile: { type: String, default: null, match: /^[6-9]\d{9}$/ },
    email: { type: String, default: null, lowercase: true, trim: true, maxlength: 254 },
    occupation: { type: String, default: null, trim: true, maxlength: 60 },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
guardianSchema.plugin(tenantScope);
// One guardian per mobile number in a school; guardians without a number are not compared with each other.
guardianSchema.index(
  { tenantId: 1, mobile: 1 },
  { unique: true, partialFilterExpression: { mobile: { $type: "string" } }, name: "one_guardian_per_mobile" }
);

export const Guardian = model<IGuardian>("Guardian", guardianSchema);
