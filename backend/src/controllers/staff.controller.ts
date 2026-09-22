import { Request, Response } from "express";
import { z } from "zod";
import { Staff, TeacherAllocation } from "../models/Staff";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { nextSequence } from "../models/Counter";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

export const listStaff = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.category) filter.category = req.query.category;
  const staff = await Staff.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: staff });
});

export const getStaff = asyncHandler(async (req: Request, res: Response) => {
  const staff = await Staff.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!staff) throw ApiError.notFound("Staff member not found");
  res.json({ success: true, data: staff });
});

const createStaffSchema = z.object({
  branchId: z.string(),
  name: z.string().min(2),
  category: z.enum(["teaching", "admin", "transport", "support"]),
  designation: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  qualification: z.string().optional(),
  aadhaarLast4: z.string().length(4).optional(),
  panLast4: z.string().length(4).optional(),
  salaryGrade: z.string().optional(),
});

export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const payload = createStaffSchema.parse(req.body);
  const tenantId = req.user?.role === "super_admin" ? req.body.tenantId : req.user?.tenantId;
  const seq = await nextSequence(`branch:${payload.branchId}:staff`);
  const employeeId = `EMP-${String(seq).padStart(4, "0")}`;

  const staff = await Staff.create({ ...payload, tenantId, employeeId });
  res.status(201).json({ success: true, data: staff });
});

export const updateStaff = asyncHandler(async (req: Request, res: Response) => {
  const staff = await Staff.findOneAndUpdate({ _id: req.params.id, ...scopeFilter(req) }, req.body, {
    new: true,
    runValidators: true,
  });
  if (!staff) throw ApiError.notFound("Staff member not found");
  res.json({ success: true, data: staff });
});

// ---- Teacher-Subject-Class allocation matrix (FR-3.3) ----
const allocationSchema = z.object({
  branchId: z.string(),
  staffId: z.string(),
  classId: z.string(),
  sectionId: z.string(),
  subjectId: z.string(),
  isClassTeacher: z.boolean().optional(),
});

export const listAllocations = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.staffId) filter.staffId = req.query.staffId;
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;
  const allocations = await TeacherAllocation.find(filter)
    .populate("staffId", "name")
    .populate("classId", "name")
    .populate("sectionId", "name")
    .populate("subjectId", "name");
  res.json({ success: true, data: allocations });
});

export const createAllocation = asyncHandler(async (req: Request, res: Response) => {
  const payload = allocationSchema.parse(req.body);
  const tenantId = req.user?.role === "super_admin" ? req.body.tenantId : req.user?.tenantId;
  const allocation = await TeacherAllocation.create({ ...payload, tenantId });
  res.status(201).json({ success: true, data: allocation });
});

export const removeAllocation = asyncHandler(async (req: Request, res: Response) => {
  const allocation = await TeacherAllocation.findOneAndDelete({ _id: req.params.id, ...scopeFilter(req) });
  if (!allocation) throw ApiError.notFound("Allocation not found");
  res.json({ success: true, data: { _id: req.params.id } });
});
