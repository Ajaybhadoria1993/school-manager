import { Request, Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { LeaveRequest, LeaveBalance, Substitution, LeaveType } from "../models/Leave";
import { Staff, TeacherAllocation } from "../models/Staff";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

const DEFAULT_ALLOCATIONS: { leaveType: LeaveType; allocated: number }[] = [
  { leaveType: "casual", allocated: 12 },
  { leaveType: "sick", allocated: 10 },
  { leaveType: "earned", allocated: 15 },
];

function daysBetweenInclusive(start: Date, end: Date) {
  const ms = new Date(end).setUTCHours(0, 0, 0, 0) - new Date(start).setUTCHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

async function resolveStaffIdForUser(req: Request): Promise<string> {
  // School Admin / Principal applying leave "for" a staff member pass staffId explicitly;
  // a teacher/staff member applying for themselves is resolved from their own login
  // (staffProfileId lives on the User document, not the JWT payload).
  if (req.body.staffId && req.user?.role !== "teacher") return req.body.staffId;
  const user = await User.findById(req.user?.userId);
  if (user?.staffProfileId) return user.staffProfileId.toString();
  if (req.body.staffId) return req.body.staffId;
  throw ApiError.badRequest("No staff profile linked to this account; pass staffId explicitly");
}

async function ensureLeaveBalance(staffId: string, tenantId: string, branchId: string, year: number) {
  let balance = await LeaveBalance.findOne({ staffId, year });
  if (!balance) {
    balance = await LeaveBalance.create({
      tenantId,
      branchId,
      staffId,
      year,
      allocations: DEFAULT_ALLOCATIONS.map((a) => ({ ...a, used: 0 })),
    });
  }
  return balance;
}

const applySchema = z.object({
  staffId: z.string().optional(),
  leaveType: z.enum(["casual", "sick", "earned", "other"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().min(2),
});

export const applyLeave = asyncHandler(async (req: Request, res: Response) => {
  const payload = applySchema.parse(req.body);
  if (payload.endDate < payload.startDate) throw ApiError.badRequest("endDate cannot be before startDate");

  const staffId = await resolveStaffIdForUser(req);
  const staff = await Staff.findById(staffId);
  if (!staff) throw ApiError.notFound("Staff profile not found");

  const request = await LeaveRequest.create({
    tenantId: staff.tenantId,
    branchId: staff.branchId,
    staffId,
    leaveType: payload.leaveType,
    startDate: payload.startDate,
    endDate: payload.endDate,
    reason: payload.reason,
    status: "pending",
    appliedBy: req.user?.userId,
  });

  res.status(201).json({ success: true, data: request });
});

export const listLeaveRequests = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.status) filter.status = req.query.status;

  if (req.user?.role === "teacher") {
    const user = await User.findById(req.user.userId);
    if (!user?.staffProfileId) return res.json({ success: true, data: [] });
    filter.staffId = user.staffProfileId;
  } else if (req.query.staffId) {
    filter.staffId = req.query.staffId;
  }

  const requests = await LeaveRequest.find(filter)
    .populate("staffId", "name employeeId category designation")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: requests });
});

const decisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  decisionNote: z.string().optional(),
});

// FR-3.5 acceptance criteria: requester sees status, approver notified (implicit —
// visible immediately via the list endpoint), leave balance auto-updated on approval.
export const decideLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const payload = decisionSchema.parse(req.body);
  const request = await LeaveRequest.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!request) throw ApiError.notFound("Leave request not found");
  if (request.status !== "pending") throw ApiError.badRequest("This request has already been decided");

  request.status = payload.status;
  request.decidedBy = new mongoose.Types.ObjectId(req.user!.userId);
  request.decisionNote = payload.decisionNote;
  request.decidedAt = new Date();
  await request.save();

  if (payload.status === "approved") {
    const year = new Date(request.startDate).getFullYear();
    const balance = await ensureLeaveBalance(
      request.staffId.toString(),
      request.tenantId.toString(),
      request.branchId.toString(),
      year
    );
    const days = daysBetweenInclusive(request.startDate, request.endDate);
    const entry = balance.allocations.find((a) => a.leaveType === request.leaveType);
    if (entry) entry.used += days;
    else balance.allocations.push({ leaveType: request.leaveType, allocated: 0, used: days });
    await balance.save();
  }

  res.json({ success: true, data: request });
});

export const getLeaveBalance = asyncHandler(async (req: Request, res: Response) => {
  const staffId = req.params.staffId;
  const year = Number(req.query.year ?? new Date().getFullYear());
  const staff = await Staff.findById(staffId);
  if (!staff) throw ApiError.notFound("Staff not found");
  const balance = await ensureLeaveBalance(staffId, staff.tenantId.toString(), staff.branchId.toString(), year);
  res.json({ success: true, data: balance });
});

// FR-3.4: once a teaching staff member's leave is approved, surface their
// class/subject allocations for that period so Admin/Principal can assign a
// substitute per allocation (the substitute then only sees that slot).
export const getSubstitutionCandidates = asyncHandler(async (req: Request, res: Response) => {
  const request = await LeaveRequest.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!request) throw ApiError.notFound("Leave request not found");

  const [allocations, existing, otherTeachers] = await Promise.all([
    TeacherAllocation.find({ staffId: request.staffId })
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name"),
    Substitution.find({ leaveRequestId: request._id }),
    Staff.find({ branchId: request.branchId, category: "teaching", isActive: true, _id: { $ne: request.staffId } }),
  ]);

  res.json({
    success: true,
    data: {
      leaveRequest: request,
      allocations,
      existingSubstitutions: existing,
      availableTeachers: otherTeachers,
    },
  });
});

const assignSchema = z.object({
  allocationId: z.string(),
  substituteStaffId: z.string(),
});

export const assignSubstitute = asyncHandler(async (req: Request, res: Response) => {
  const payload = assignSchema.parse(req.body);
  const request = await LeaveRequest.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!request) throw ApiError.notFound("Leave request not found");
  if (request.status !== "approved") throw ApiError.badRequest("Leave must be approved before assigning a substitute");

  const substitution = await Substitution.findOneAndUpdate(
    { leaveRequestId: request._id, allocationId: payload.allocationId },
    {
      tenantId: request.tenantId,
      branchId: request.branchId,
      leaveRequestId: request._id,
      originalStaffId: request.staffId,
      substituteStaffId: payload.substituteStaffId,
      allocationId: payload.allocationId,
      startDate: request.startDate,
      endDate: request.endDate,
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.status(201).json({ success: true, data: substitution });
});

// A substitute teacher's temporary view: which allocations they're covering right now.
export const myActiveSubstitutions = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user?.userId);
  if (!user?.staffProfileId) return res.json({ success: true, data: [] });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const subs = await Substitution.find({
    substituteStaffId: user.staffProfileId,
    startDate: { $lte: today },
    endDate: { $gte: today },
  })
    .populate("allocationId")
    .populate("originalStaffId", "name");

  res.json({ success: true, data: subs });
});
