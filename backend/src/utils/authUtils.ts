import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../main/users/models/User";

// bcrypt is slow on purpose: 12 rounds for real passwords. The tests hash a dozen passwords for every school they make, so they use the
// cheapest setting (a hash made at 12 rounds still verifies: the cost is stored in the hash).
const BCRYPT_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

export type Platform = "web" | "ios" | "android";

/** What the access token carries. Everything else is loaded from the database on each request. */
export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
  tenantId: string | null;
  /** Filled once per request by requirePermission (it is not in the token): what this login may do, by the school's Permissions. */
  permissions?: string[];
}

export interface RefreshTokenPayload {
  sub: string; // user id
  jti: string; // identifies this exact refresh token (rotates on every refresh)
  fid: string; // "family": one per login, kept across rotations, so a replaced session is told apart from a replayed one
  platform: Platform;
}

/** Random single-use token to put in an email link. Only its hash is ever stored. */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// No 0 O o 1 l I: a password read out over the phone or copied by hand has no letters that are mistaken for each other.
const PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_LOWER = "abcdefghijkmnpqrstuvwxyz";
const PASSWORD_DIGITS = "23456789";
const PASSWORD_SPECIAL = "@#$%&*!?";

/**
 * A first password the school hands to a person (a teacher brought in with a file): 10 characters with a capital, a small letter, a
 * number and a symbol, easy to read out. The same rules as the password Add teacher makes in the browser, and it follows the platform's
 * policy. Made from the system's random source, never kept: only its hash is.
 */
export function generatePassword(): string {
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const all = PASSWORD_UPPER + PASSWORD_LOWER + PASSWORD_DIGITS + PASSWORD_SPECIAL;
  const chars = [pick(PASSWORD_UPPER), pick(PASSWORD_LOWER), pick(PASSWORD_DIGITS), pick(PASSWORD_SPECIAL), ...Array.from({ length: 6 }, () => pick(all))];
  // A shuffle, so the four kinds are not always first.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A real bcrypt hash of a random value. Comparing against it when the email is unknown
// makes "no such user" cost the same time as "wrong password", so response time doesn't
// reveal which emails exist.
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(generateToken(16));
  return dummyHash;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.accessTokenExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload & { iat?: number; exp?: number } {
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload & { iat?: number; exp?: number };
}

/**
 * Signing is deterministic: the same payload with the same `at` always gives the same string, which
 * is how a token can be handed out again byte for byte (see TokenService.rotate). Without `at`, the
 * token is stamped now and lives for REFRESH_TOKEN_EXPIRES_IN.
 */
export function signRefreshToken(payload: RefreshTokenPayload, at?: { iat: number; exp: number }): string {
  if (at) return jwt.sign({ ...payload, iat: at.iat, exp: at.exp }, env.refreshTokenSecret);
  return jwt.sign(payload, env.refreshTokenSecret, {
    expiresIn: env.refreshTokenExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload & { iat?: number; exp?: number } {
  return jwt.verify(token, env.refreshTokenSecret) as RefreshTokenPayload & { iat?: number; exp?: number };
}

/** Password policy shared by every endpoint that sets a password. */
export const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,72}$/;
export const PASSWORD_POLICY_MESSAGE =
  "Password must be 8-72 characters with an uppercase letter, a lowercase letter, a number and a special character";
