import { Request, Response } from "express";
import { z } from "zod";
import { User, hashPassword, ALL_ROLES } from "../models/User";
import { Guardian } from "../models/Guardian";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  return filter;
}

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.role) filter.role = req.query.role;
  const users = await User.find(filter)
    .select("-passwordHash")
    .populate("staffProfileId", "name designation")
    .populate("guardianProfileId", "name phone")
    .populate("studentProfileId", "firstName lastName admissionNumber")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: users });
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(6),
  role: z.enum(ALL_ROLES as [string, ...string[]]).refine((r) => r !== "super_admin", {
    message: "super_admin accounts can only be created via platform bootstrap",
  }),
  branchId: z.string().optional(),
  staffProfileId: z.string().optional(),
  guardianProfileId: z.string().optional(),
  studentProfileId: z.string().optional(),
});

// School Admin creates login accounts for staff/parents/students and links
// them to their operational profile (Staff/Guardian/Student) so the app can
// resolve "my classes" / "my children" / "my report card" at login time.
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const payload = createUserSchema.parse(req.body);
  const tenantId = req.user?.role === "super_admin" ? req.body.tenantId : req.user?.tenantId;
  if (!tenantId) throw ApiError.badRequest("tenantId is required");

  const passwordHash = await hashPassword(payload.password);
  const user = await User.create({
    ...payload,
    email: payload.email.toLowerCase(),
    passwordHash,
    tenantId,
    branchId: payload.branchId ?? req.user?.branchId ?? null,
  });

  if (payload.role === "parent" && payload.guardianProfileId) {
    await Guardian.findByIdAndUpdate(payload.guardianProfileId, { userId: user._id });
  }

  res.status(201).json({
    success: true,
    data: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
});

export const deactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, ...scopeFilter(req) },
    { isActive: false },
    { new: true }
  ).select("-passwordHash");
  if (!user) throw ApiError.notFound("User not found");
  res.json({ success: true, data: user });
});

export const reactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, ...scopeFilter(req) },
    { isActive: true },
    { new: true }
  ).select("-passwordHash");
  if (!user) throw ApiError.notFound("User not found");
  res.json({ success: true, data: user });
});
