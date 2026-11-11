import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { ApiError } from "../utils/ApiError";
import { verifyAccessToken } from "../utils/authUtils";
import { asyncHandler } from "../utils/asyncHandler";
import { User, type UserRole } from "../main/users/models/User";
import { Teacher } from "../main/staff/models/Teacher";
import { Tenant } from "../main/tenants/models/Tenant";

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/**
 * Who is calling. Verifies the access token, then loads the user (and their school) from MongoDB
 * so that a disabled account, a changed role, a password reset or a suspended school takes effect
 * immediately instead of when the token expires. `req.user` is filled from the database, not from
 * the token.
 *
 * `requireApproved`: when true, a school that is not approved yet (invited, onboarding, pending,
 * rejected) is refused. That is the default for every business route, see requireAuth.
 */
async function authenticate(req: Request, requireApproved: boolean): Promise<void> {
  req.user = await userFromToken(bearerToken(req), requireApproved);
}

/**
 * The checks of `authenticate` for an access token that did not come in a header (the notification socket's handshake,
 * src/realtime/socket.ts): the same answers, so a socket is refused exactly when a request would be.
 */
export async function userFromToken(token: string | null | undefined, requireApproved: boolean): Promise<NonNullable<Request["user"]>> {
  if (!token) throw ApiError.unauthorized("Authentication token missing", "TOKEN_MISSING");

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired session", "TOKEN_INVALID");
  }
  if (!payload.userId) throw ApiError.unauthorized("Invalid or expired session", "TOKEN_INVALID");

  const user = await User.findById(payload.userId).select("role tenantId isActive passwordChangedAt").lean();
  if (!user) throw ApiError.unauthorized("Invalid or expired session", "TOKEN_INVALID");

  if (!user.isActive) {
    throw ApiError.forbidden("Your account has been disabled. Please contact your administrator.", "ACCOUNT_DISABLED");
  }

  // Tokens issued before the last password change are dead (compared in whole seconds, like `iat`).
  if (user.passwordChangedAt && (payload.iat ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw ApiError.unauthorized("Your password was changed. Please sign in again.", "TOKEN_INVALID");
  }

  if (user.tenantId) {
    const tenant = await Tenant.findById(user.tenantId).select("isActive approvalStatus").lean();
    if (!tenant || !tenant.isActive) {
      throw ApiError.forbidden(
        "This school account is suspended. Please contact the platform administrator.",
        "TENANT_INACTIVE"
      );
    }
    if (requireApproved && tenant.approvalStatus !== "approved") {
      throw ApiError.forbidden("Your school has not been approved yet.", "TENANT_NOT_APPROVED", {
        approvalStatus: tenant.approvalStatus,
      });
    }
  }

  return {
    userId: user._id.toString(),
    role: user.role,
    tenantId: user.tenantId ? user.tenantId.toString() : null,
  };
}

const MEDIUM_NOT_FOUND = () => ApiError.forbidden("That medium is not part of your school.", "MEDIUM_NOT_FOUND");

/**
 * Moving to another medium of the school (see MediumService): for this request every query of every module is about that side, because the
 * side is what `req.user.tenantId` now says. The school's administrator can open any of its mediums; a teacher, the ones they teach in.
 * Anything else is refused rather than ignored: quietly answering (or worse, writing) for the wrong medium would be the bigger harm.
 */
async function openMedium(req: Request): Promise<void> {
  const wanted = req.header("X-School-Medium");
  const user = req.user;
  if (!wanted || !user?.tenantId || wanted === user.tenantId) return;
  if (!Types.ObjectId.isValid(wanted)) throw MEDIUM_NOT_FOUND();
  const allowed =
    user.role === "school_admin"
      ? await Tenant.exists({ _id: wanted, parentTenantId: user.tenantId })
      : user.role === "teacher"
        ? await Teacher.exists({ tenantId: new Types.ObjectId(wanted), userId: new Types.ObjectId(user.userId), isActive: true })
        : null;
  if (!allowed) throw MEDIUM_NOT_FOUND();
  user.tenantId = wanted;
}

/** Default guard for business routes: signed in, account active, the school is approved, and on the medium the request names. */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  await authenticate(req, true);
  await openMedium(req);
  next();
});

/**
 * Signed in and active, but the school may still be in setup or waiting for approval. Only for
 * routes a school needs BEFORE approval: /auth/me and the onboarding endpoints.
 */
export const requireAuthLoose = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  await authenticate(req, false);
  next();
});

/** What the caller may do. Always placed after requireAuth / requireAuthLoose. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized("Authentication required", "TOKEN_MISSING"));
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden("You do not have permission to do this", "FORBIDDEN"));
    }
    next();
  };
}

export const requireSuperAdmin = requireRole("super_admin");
