import { Schema, model, Types } from "mongoose";

/**
 * One-time tokens that are emailed as links (password reset, school invite, school sign-up; staff invites later).
 * Only the sha256 hash is stored, the raw value exists only in the email.
 */
export const AUTH_TOKEN_TYPES = ["password_reset", "school_invite", "school_signup"] as const;
export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[number];

export interface IAuthToken {
  _id: Types.ObjectId;
  type: AuthTokenType;
  tokenHash: string;
  userId?: Types.ObjectId;
  /** The school a school_invite belongs to. */
  tenantId?: Types.ObjectId;
  /** A school_signup has no school yet: the name the visitor typed, used when the email is confirmed. */
  schoolName?: string;
  email?: string;
  expiresAt: Date;
  usedAt?: Date;
}

const authTokenSchema = new Schema<IAuthToken>(
  {
    type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", index: true },
    email: { type: String, lowercase: true, trim: true },
    schoolName: { type: String, trim: true, maxlength: 150 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true }
);

// MongoDB removes a token 7 days AFTER it expired. The grace period lets us tell "this link
// has expired" (friendly message) from "this link never existed". Queries always check
// `expiresAt > now` themselves, so a lingering expired token can never be used.
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const AuthToken = model<IAuthToken>("AuthToken", authTokenSchema);
