import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { FULL_ACCESS_ROLES } from "../main/permissions/constants";
import { PermissionService } from "../main/permissions/services/permission.service";

/** A login that works on its own classes or children, not on the school: a teacher, a parent, a student. */
const OWN_ONLY_ROLES: readonly string[] = ["teacher", "parent", "student"];

/**
 * What the caller may do, by the school's own Permissions (the page of that name): the school admin and the principal always; anyone else
 * when their kind of person has ANY of the keys given. Always placed after requireAuth. The list is read once per request.
 */
export function requirePermission(...keys: string[]) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) throw ApiError.unauthorized("Authentication required", "TOKEN_MISSING");
    if (FULL_ACCESS_ROLES.includes(user.role)) return next();
    const granted = (user.permissions ??= await PermissionService.grantedTo(user));
    if (!keys.some((k) => granted.includes(k))) throw ApiError.forbidden("You do not have permission to do this", "FORBIDDEN");
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
 * by it even when their kind has the permission, because what they may do is about their own classes or children (and has its own route).
 */
export function requireSchoolPermission(...keys: string[]) {
  const allowed = requirePermission(...keys);
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user && OWN_ONLY_ROLES.includes(req.user.role)) return next(ApiError.forbidden("You do not have permission to do this", "FORBIDDEN"));
    allowed(req, res, next);
  };
}
