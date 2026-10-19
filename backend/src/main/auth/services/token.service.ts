import { randomUUID } from "crypto";
import { Types } from "mongoose";
import jwt from "jsonwebtoken";
import { ApiError } from "../../../utils/ApiError";
import { env } from "../../../config/env";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type Platform,
  type RefreshTokenPayload,
} from "../../../utils/authUtils";
import { User, type UserRole } from "../../users/models/User";
import { Tenant } from "../../tenants/models/Tenant";
import { RefreshToken } from "../models/RefreshToken";

export interface SessionMeta {
  platform?: Platform;
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface TokenSubject {
  _id: Types.ObjectId;
  role: UserRole;
  tenantId: Types.ObjectId | null;
}

const SESSION_EXPIRED = () => ApiError.unauthorized("Session expired, please sign in again.", "SESSION_EXPIRED");

/** When a freshly signed refresh token was issued and when it expires, as stored next to its hash. */
function tokenWindow(refreshToken: string): { issuedAt: Date; expiresAt: Date } {
  const decoded = jwt.decode(refreshToken) as { iat?: number; exp?: number } | null;
  if (!decoded?.iat || !decoded.exp) throw new Error("Refresh token has no issue or expiry time");
  return { issuedAt: new Date(decoded.iat * 1000), expiresAt: new Date(decoded.exp * 1000) };
}

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

function clip(value: string | undefined, max: number): string | undefined {
  return value ? value.slice(0, max) : undefined;
}

/**
 * Access token (short, stateless) + refresh token (long, stored hashed, rotated on every use).
 * Exactly one session exists per (user, platform): issuing a new pair replaces the previous one.
 */
export class TokenService {
  static async issueTokenPair(user: TokenSubject, meta: SessionMeta = {}): Promise<TokenPair> {
    const platform: Platform = meta.platform ?? "web";
    const jti = randomUUID();
    const family = randomUUID(); // a fresh login starts a new family
    const refreshToken = signRefreshToken({ sub: user._id.toString(), jti, fid: family, platform });

    await RefreshToken.findOneAndUpdate(
      { userId: user._id, platform },
      {
        $set: {
          family,
          jti,
          tokenHash: hashToken(refreshToken),
          ...tokenWindow(refreshToken),
          userAgent: clip(meta.userAgent, 500),
          ipAddress: clip(meta.ipAddress, 100),
        },
        // A new login starts a clean chain: nothing from an earlier session may be replayed.
        $unset: { prevJti: 1, rotatedAt: 1 },
      },
      { upsert: true }
    );

    return {
      accessToken: signAccessToken({
        userId: user._id.toString(),
        role: user.role,
        tenantId: user.tenantId ? user.tenantId.toString() : null,
      }),
      refreshToken,
    };
  }

  /**
   * Swaps a valid refresh token for a new pair. A token that was already rotated (or never existed)
   * ends the session, except for the one that was rotated a few seconds ago (see sameTokenWithinGrace).
   */
  static async rotate(rawRefreshToken: string, meta: SessionMeta = {}): Promise<TokenPair> {
    let payload;
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch {
      throw SESSION_EXPIRED();
    }

    const user = await User.findById(payload.sub).select("role tenantId isActive").lean();
    const tenantActive = !user?.tenantId || (await Tenant.exists({ _id: user.tenantId, isActive: true }));
    if (!user || !user.isActive || !tenantActive) {
      await RefreshToken.deleteMany({ userId: payload.sub });
      throw SESSION_EXPIRED();
    }

    const newJti = randomUUID();
    const refreshToken = signRefreshToken({
      sub: payload.sub,
      jti: newJti,
      fid: payload.fid,
      platform: payload.platform,
    });

    // Compare-and-swap: only the holder of the current token can rotate it, and only once.
    const swapped = await RefreshToken.findOneAndUpdate(
      {
        userId: payload.sub,
        platform: payload.platform,
        family: payload.fid,
        jti: payload.jti,
        tokenHash: hashToken(rawRefreshToken),
      },
      {
        $set: {
          jti: newJti,
          tokenHash: hashToken(refreshToken),
          ...tokenWindow(refreshToken),
          prevJti: payload.jti,
          rotatedAt: new Date(),
          userAgent: clip(meta.userAgent, 500),
          ipAddress: clip(meta.ipAddress, 100),
        },
      }
    );

    // Not the current token. A second tab, or a retry after a lost response, sends the token that was
    // rotated a moment ago: it gets the very same new token back, so every holder stays in step.
    const resent = swapped ? null : await TokenService.sameTokenWithinGrace(payload);

    if (!swapped && !resent) {
      // Two different causes, handled differently:
      //  - same login (family), token already used: a replay, so treat it as theft and end that session;
      //  - the platform has since been signed in again (different family): this token is just stale,
      //    and must not touch the newer session, so the filter below matches nothing.
      await RefreshToken.deleteOne({ userId: payload.sub, platform: payload.platform, family: payload.fid });
      throw SESSION_EXPIRED();
    }

    return {
      accessToken: signAccessToken({
        userId: user._id.toString(),
        role: user.role,
        tenantId: user.tenantId ? user.tenantId.toString() : null,
      }),
      refreshToken: resent ?? refreshToken,
    };
  }

  /**
   * The refresh token that replaced `payload`'s token, if that happened within the grace window.
   * It is signed again from what is stored (the token itself is never kept), and only handed out
   * if it is byte for byte the one on record. Only the immediate predecessor qualifies: anything
   * older, or anything after the window, is a replay.
   */
  private static async sameTokenWithinGrace(payload: RefreshTokenPayload): Promise<string | null> {
    const row = await RefreshToken.findOne({
      userId: payload.sub,
      platform: payload.platform,
      family: payload.fid,
      prevJti: payload.jti,
      rotatedAt: { $gt: new Date(Date.now() - env.refreshReuseGraceSeconds * 1000) },
    }).lean();
    if (!row) return null;

    const token = signRefreshToken(
      { sub: payload.sub, jti: row.jti, fid: row.family, platform: row.platform },
      { iat: seconds(row.issuedAt), exp: seconds(row.expiresAt) }
    );
    return hashToken(token) === row.tokenHash ? token : null;
  }

  /** Logout: ends the session this refresh token belongs to. Silent when the token is invalid. */
  static async revoke(rawRefreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(rawRefreshToken);
      await RefreshToken.deleteOne({
        userId: payload.sub,
        platform: payload.platform,
        family: payload.fid,
        jti: payload.jti,
      });
    } catch {
      // Already invalid or expired: nothing to revoke.
    }
  }

  /** Ends every session on every platform (password reset, account disabled). */
  static async revokeAllForUser(userId: Types.ObjectId | string): Promise<void> {
    await RefreshToken.deleteMany({ userId });
  }
}
