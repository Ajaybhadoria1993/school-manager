import { Request, Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { FeeRefund } from "../models/Fee";
import { Student } from "../models/Student";
import { Guardian } from "../models/Guardian";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { notifyWithFallback } from "../services/notification.service";
import { computeStudentFeeSummaryAllYears } from "../services/feeCalculation.service";
import { assertStudentAccess } from "../utils/studentAccess";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

async function totalPaidAcrossYears(student: InstanceType<typeof Student>): Promise<number> {
  const yearEntries = [
    ...student.promotionHistory.map((p) => ({ academicYearId: p.academicYearId.toString(), classId: p.classId.toString() })),
    { academicYearId: student.academicYearId.toString(), classId: student.classId.toString() },
  ];
  const { totals } = await computeStudentFeeSummaryAllYears(student._id.toString(), student.branchId.toString(), yearEntries);
  return totals.paid;
}

const createSchema = z.object({ studentId: z.string(), amount: z.number().positive(), reason: z.string().min(2) });

// S-5.5: a parent's refund request (e.g. withdrawal after paying annual fee
// upfront). Capped at what the student has actually paid across every year,
// minus refunds already approved/processed, so a refund can never exceed
// real money collected.
export const createRefundRequest = asyncHandler(async (req: Request, res: Response) => {
  const payload = createSchema.parse(req.body);
  const student = await Student.findOne({ _id: payload.studentId, ...scopeFilter(req) });
  if (!student) throw ApiError.notFound("Student not found");

  const [totalPaid, existingRefunds] = await Promise.all([
    totalPaidAcrossYears(student),
    FeeRefund.find({ studentId: student._id, status: { $in: ["pending", "approved", "processed"] } }),
  ]);
  const alreadyClaimed = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
  const available = totalPaid - alreadyClaimed;
  if (payload.amount > available) {
    throw ApiError.badRequest(`Refund amount exceeds what's available to refund (Rs.${Math.max(available, 0)})`);
  }

  const refund = await FeeRefund.create({
    tenantId: student.tenantId,
    branchId: student.branchId,
    studentId: student._id,
    amount: payload.amount,
    reason: payload.reason,
    requestedBy: req.user?.userId,
  });

  res.status(201).json({ success: true, data: refund });
});

export const listRefunds = asyncHandler(async (req: Request, res: Response) => {
  const studentId = req.query.studentId as string | undefined;
  if (studentId && (req.user?.role === "parent" || req.user?.role === "student")) {
    await assertStudentAccess(req, studentId);
  }
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (studentId) filter.studentId = studentId;
  if (req.query.status) filter.status = req.query.status;

  const refunds = await FeeRefund.find(filter)
    .populate("studentId", "firstName lastName admissionNumber")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: refunds });
});

const decisionSchema = z.object({ status: z.enum(["approved", "rejected"]), decisionNote: z.string().optional() });

// Approval step, kept separate from the accountant who requests and the
// accountant who later processes — mirrors the leave-request pattern so a
// single person can't both originate and approve a cash outflow.
export const decideRefund = asyncHandler(async (req: Request, res: Response) => {
  const payload = decisionSchema.parse(req.body);
  const refund = await FeeRefund.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!refund) throw ApiError.notFound("Refund request not found");
  if (refund.status !== "pending") throw ApiError.badRequest("This request has already been decided");

  refund.status = payload.status;
  refund.decidedBy = new mongoose.Types.ObjectId(req.user!.userId);
  refund.decisionNote = payload.decisionNote;
  refund.decidedAt = new Date();
  await refund.save();

  res.json({ success: true, data: refund });
});

const processSchema = z.object({
  refundMode: z.enum(["cash", "bank_transfer", "upi", "cheque"]),
  referenceNote: z.string().optional(),
});

export const processRefund = asyncHandler(async (req: Request, res: Response) => {
  const payload = processSchema.parse(req.body);
  const refund = await FeeRefund.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!refund) throw ApiError.notFound("Refund request not found");
  if (refund.status !== "approved") throw ApiError.badRequest("Refund must be approved before it can be processed");

  refund.status = "processed";
  refund.refundMode = payload.refundMode;
  refund.referenceNote = payload.referenceNote;
  refund.processedBy = new mongoose.Types.ObjectId(req.user!.userId);
  refund.processedAt = new Date();
  await refund.save();

  const student = await Student.findById(refund.studentId).populate("guardians.guardianId");
  if (student) {
    const guardians = await Guardian.find({ _id: { $in: student.guardians.map((g) => g.guardianId) } });
    await Promise.all(
      guardians.map((guardian) =>
        notifyWithFallback(
          guardian.phone,
          "refund_processed",
          `A refund of Rs.${refund.amount} for ${student.firstName} ${student.lastName} has been processed via ${payload.refundMode}.`
        )
      )
    );
  }

  res.json({ success: true, data: refund });
});
