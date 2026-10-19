import { Schema, model, Types } from "mongoose";

export const USER_ROLES = [
  "super_admin",
  "school_admin",
  "principal",
  "accountant",
  "teacher",
  "parent",
  "student",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
  /** Title shown to the platform team when reviewing a school (Principal, Owner, ...). */
  designation?: string;
  /** What they wrote in when their role is "Other". */
  designationOther?: string;
  passwordHash: string;
  role: UserRole;
  /** null for the platform super admin; set for everyone who belongs to a school. */
  tenantId: Types.ObjectId | null;
  isActive: boolean;
  emailVerifiedAt?: Date;
  /** Access tokens issued before this moment are rejected (set on password reset/change). */
  passwordChangedAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    // Login resolves a user by email alone, so an email is unique across the whole platform.
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 254 },
    phone: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
    designation: { type: String, trim: true, maxlength: 50 },
    designationOther: { type: String, trim: true, maxlength: 50 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: USER_ROLES, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    isActive: { type: Boolean, default: true },
    emailVerifiedAt: { type: Date },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export const User = model<IUser>("User", userSchema);

/** The only user shape that ever leaves the API (no password hash, no internal timestamps). */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  emailVerifiedAt: string | null;
}

export function toPublicUser(user: Pick<IUser, "_id" | "name" | "email" | "role" | "tenantId" | "emailVerifiedAt">): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId ? user.tenantId.toString() : null,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
  };
}
