import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import type { AccessTokenPayload } from "../utils/authUtils";
import { FULL_ACCESS_ROLES } from "../main/permissions/constants";
import { PermissionService, type Access } from "../main/permissions/services/permission.service";

const FORBIDDEN = () => ApiError.forbidden("You do not have permission to do this", "FORBIDDEN");

/** What the signed-in person may do, read once per request and kept on it (`permissions`, and which of them work on the whole school). */
export async function loadAccess(user: AccessTokenPayload): Promise<Access> {
  if (!user.permissions || !user.schoolPermissions) {
    const access = await PermissionService.accessOf(user);
    user.permissions = access.permissions;
    user.schoolPermissions = access.schoolPermissions;
  }
  return { permissions: user.permissions, schoolPermissions: user.schoolPermissions };
}

/**
 * What the caller may do, by the school's own Permissions (the page of that name): the school admin and the principal always; anyone else
 * when their kind of person has ANY of the keys given. Always placed after requireAuth. The list is read once per request.
 */
export function requirePermission(...keys: string[]) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) throw ApiError.unauthorized("Authentication required", "TOKEN_MISSING");
    if (FULL_ACCESS_ROLES.includes(user.role)) return next();
    const { permissions } = await loadAccess(user);
    if (!keys.some((k) => permissions.includes(k))) throw FORBIDDEN();
    next();
  });
}

/** Anyone of these roles (as before permissions), or whoever the school gave ANY of the permissions. */
export function requireRoleOrPermission(roles: readonly string[], ...keys: string[]) {
  const allowed = requirePermission(...keys);
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user && roles.includes(req.user.role)) return next();
    allowed(req, res, next);
  };
}

/**
 * Like requirePermission, for a page about the WHOLE school (every class's attendance, the list of exams): a teacher or a parent is not let in
 * by their kind's list, because what they may do is about their own classes or children (and has its own route). A teacher who is also on the
 * staff (a Coordinator who takes a class) is let in by what their staff role's list gives (2026-11-26).
 */
export function requireSchoolPermission(...keys: string[]) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) throw ApiError.unauthorized("Authentication required", "TOKEN_MISSING");
    if (FULL_ACCESS_ROLES.includes(user.role)) return next();
    const { schoolPermissions } = await loadAccess(user);
    if (!keys.some((k) => schoolPermissions.includes(k))) throw FORBIDDEN();
    next();
  });
}
