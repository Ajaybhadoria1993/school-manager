import { Schema, model, Types } from "mongoose";

export const USER_ROLES = [
  "super_admin",
  "school_admin",
  "principal",
  "accountant",
  "teacher",
  "receptionist",
  "management",
  "staff",
  "parent",
  "student",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  /**
   * The login email. A person who signs in with a username (a teacher, often with no email) has none; when it is there it is unique
   * across the whole platform.
   */
  email?: string;
  /** The login name of a person who has no email, or prefers one: lower case, unique across the whole platform. */
  username?: string;
  phone?: string;
  alternatePhone?: string;
  /** Title shown to the platform team when reviewing a school (Principal, Owner, ...). */
  designation?: string;
  /** What they wrote in when their role is "Other". */
  designationOther?: string;
  /**
   * The title a staff member is shown with ("Librarian", a name the school wrote): their login role says what they may open, this says
   * who they are. Only set for people added in Staff.
   */
  roleLabel?: string;
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
    // Login resolves a user by email or username alone (no school is chosen), so each is unique across the whole platform. A person
    // may have either or both; the indexes below only hold the ones that are given.
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    username: { type: String, lowercase: true, trim: true, maxlength: 30 },
    phone: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
    designation: { type: String, trim: true, maxlength: 50 },
    designationOther: { type: String, trim: true, maxlength: 50 },
    roleLabel: { type: String, trim: true, maxlength: 60 },
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

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } }, name: "one_user_per_email" });
userSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: "string" } }, name: "one_user_per_username" });

export const User = model<IUser>("User", userSchema);

/** The only user shape that ever leaves the API (no password hash, no internal timestamps). */
export interface PublicUser {
  id: string;
  name: string;
  /** null for a person who signs in with a username only. */
  email: string | null;
  username: string | null;
  role: UserRole;
  /** A staff member's own title (see IUser.roleLabel); null for everyone else. */
  roleLabel: string | null;
  tenantId: string | null;
  emailVerifiedAt: string | null;
  /**
   * What this person may do, by the school's Permissions (docs/permissions.md): every permission for the school admin and the principal, the
   * list of their kind for anyone else. The menu and the pages follow it; the server checks each request again. Only in a session (sign-in, /me).
   */
  permissions?: string[];
}

export function toPublicUser(user: Pick<IUser, "_id" | "name" | "email" | "username" | "role" | "tenantId" | "emailVerifiedAt"> & { roleLabel?: string | null }): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email ?? null,
    username: user.username ?? null,
    role: user.role,
    roleLabel: user.roleLabel ?? null,
    tenantId: user.tenantId ? user.tenantId.toString() : null,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
  };
}
