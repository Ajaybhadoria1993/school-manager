import { Request } from "express";
import { Guardian } from "../models/Guardian";
import { User } from "../models/User";
import { ApiError } from "./ApiError";

const STAFF_ROLES = new Set(["super_admin", "school_admin", "principal", "teacher", "accountant"]);

/**
 * Guards any :studentId-scoped endpoint against cross-family data leakage.
 * Staff roles are already tenant/branch-scoped by each query's own filter,
 * so this only needs to gate "parent" (must own the child) and "student"
 * (must be themselves) — anything else is denied outright.
 */
export async function assertStudentAccess(req: Request, studentId: string): Promise<void> {
  if (req.user && STAFF_ROLES.has(req.user.role)) return;

  if (req.user?.role === "student") {
    const user = await User.findById(req.user.userId);
    if (user?.studentProfileId?.toString() === studentId) return;
    throw ApiError.forbidden();
  }

  if (req.user?.role === "parent") {
    const user = await User.findById(req.user.userId);
    const guardian = user?.guardianProfileId ? await Guardian.findById(user.guardianProfileId) : null;
    if (guardian?.studentIds.some((id) => id.toString() === studentId)) return;
    throw ApiError.forbidden();
  }

  throw ApiError.forbidden();
}
