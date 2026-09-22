import { Request, Response } from "express";
import { z } from "zod";
import { TimetableSlot } from "../models/Timetable";
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

export const listTimetable = asyncHandler(async (req: Request, res: Response) => {
  const { sectionId } = req.query;
  if (!sectionId) throw ApiError.badRequest("sectionId is required");
  const slots = await TimetableSlot.find({ ...scopeFilter(req), sectionId })
    .populate("subjectId", "name")
    .populate("staffId", "name")
    .sort({ dayOfWeek: 1, periodNumber: 1 });
  res.json({ success: true, data: slots });
});

// A teacher's own weekly schedule across every section they teach.
export const myTimetable = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user?.userId);
  if (!user?.staffProfileId) return res.json({ success: true, data: [] });

  const slots = await TimetableSlot.find({ ...scopeFilter(req), staffId: user.staffProfileId })
    .populate("subjectId", "name")
    .populate("sectionId", "name")
    .sort({ dayOfWeek: 1, periodNumber: 1 });
  res.json({ success: true, data: slots });
});

const slotSchema = z.object({
  academicYearId: z.string(),
  sectionId: z.string(),
  dayOfWeek: z.number().min(0).max(6),
  periodNumber: z.number().min(1),
  startTime: z.string(),
  endTime: z.string(),
  isBreak: z.boolean().default(false),
  subjectId: z.string().optional(),
  staffId: z.string().optional(),
});

// FR-6.1: blocks saving a slot that would double-book a teacher in the same
// period on the same day, across any section in the branch.
export const upsertSlot = asyncHandler(async (req: Request, res: Response) => {
  const payload = slotSchema.parse(req.body);
  const tenantId = req.user?.role === "super_admin" ? req.body.tenantId : req.user?.tenantId;
  const branchId = req.body.branchId ?? req.user?.branchId;

  if (!payload.isBreak && payload.staffId) {
    const conflict = await TimetableSlot.findOne({
      branchId,
      academicYearId: payload.academicYearId,
      dayOfWeek: payload.dayOfWeek,
      periodNumber: payload.periodNumber,
      staffId: payload.staffId,
      sectionId: { $ne: payload.sectionId },
    }).populate("sectionId", "name");
    if (conflict) {
      throw ApiError.conflict(
        `This teacher is already scheduled for ${(conflict.sectionId as unknown as { name: string }).name} at this period`
      );
    }
  }

  const slot = await TimetableSlot.findOneAndUpdate(
    { sectionId: payload.sectionId, dayOfWeek: payload.dayOfWeek, periodNumber: payload.periodNumber },
    { ...payload, tenantId, branchId },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(201).json({ success: true, data: slot });
});

export const deleteSlot = asyncHandler(async (req: Request, res: Response) => {
  const slot = await TimetableSlot.findOneAndDelete({ _id: req.params.id, ...scopeFilter(req) });
  if (!slot) throw ApiError.notFound("Slot not found");
  res.json({ success: true, data: { _id: req.params.id } });
});
