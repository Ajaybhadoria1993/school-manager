import { Schema, model, Types } from "mongoose";

export interface IRefreshToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  platform: "web" | "ios" | "android";
  /** One id per login; survives rotations. A newer login on the same platform gets a new family. */
  family: string;
  /** Id of the refresh token currently valid for this (user, platform); changes on every rotation. */
  jti: string;
  tokenHash: string;
  /** When the current token was signed (its `iat`); with expiresAt it lets the same token be signed again. */
  issuedAt: Date;
  expiresAt: Date;
  /** The token this one replaced, kept for a short grace window after `rotatedAt`. */
  prevJti?: string;
  rotatedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    platform: { type: String, enum: ["web", "ios", "android"], required: true, default: "web" },
    family: { type: String, required: true },
    jti: { type: String, required: true },
    tokenHash: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    prevJti: { type: String },
    rotatedAt: { type: Date },
    userAgent: { type: String, maxlength: 500 },
    ipAddress: { type: String, maxlength: 100 },
  },
  { timestamps: true }
);

// One active session per user per platform: logging in again on the same platform replaces
// the previous session, while web and app sessions can exist side by side.
refreshTokenSchema.index({ userId: 1, platform: 1 }, { unique: true });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>("RefreshToken", refreshTokenSchema);
