import { Schema, model, Types } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole =
  | "super_admin"
  | "school_admin"
  | "principal"
  | "accountant"
  | "teacher"
  | "parent"
  | "student";

export const ALL_ROLES: UserRole[] = [
  "super_admin",
  "school_admin",
  "principal",
  "accountant",
  "teacher",
  "parent",
  "student",
];

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  tenantId: Types.ObjectId | null; // null only for super_admin
  branchId: Types.ObjectId | null; // null for super_admin, parents (multi-branch)
  // Profile links - only one is relevant based on role
  staffProfileId?: Types.ObjectId;
  guardianProfileId?: Types.ObjectId;
  studentProfileId?: Types.ObjectId;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ALL_ROLES, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    staffProfileId: { type: Schema.Types.ObjectId, ref: "Staff" },
    guardianProfileId: { type: Schema.Types.ObjectId, ref: "Guardian" },
    studentProfileId: { type: Schema.Types.ObjectId, ref: "Student" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.passwordHash);
};

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export const User = model<IUser>("User", userSchema);
