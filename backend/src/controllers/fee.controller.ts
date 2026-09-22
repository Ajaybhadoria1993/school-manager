import { Request, Response } from "express";
import { z } from "zod";
import { FeeStructure, FeeConcession, FeeTransaction } from "../models/Fee";
import { Student } from "../models/Student";
import { Guardian } from "../models/Guardian";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { generateReceiptNumber } from "../utils/numbering";
import { computeStudentFeeSummary, computeStudentFeeSummaryAllYears } from "../services/feeCalculation.service";
import { notifyWithFallback } from "../services/notification.service";
import { createOrder, verifySignature } from "../services/razorpay.service";
import { env } from "../config/env";
import { assertStudentAccess } from "../utils/studentAccess";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

function financialYearLabel(date = new Date()) {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

// ---------------- Fee Structure ----------------
const structureSchema = z.object({
  branchId: z.string(),
  classId: z.string(),
  academicYearId: z.string(),
  name: z.string().default("Standard Fee Structure"),
  installments: z
    .array(
      z.object({
        name: z.string(),
        dueDate: z.coerce.date(),
        items: z.array(z.object({ feeHeadId: z.string(), amount: z.number().min(0) })).min(1),
      })
    )
    .min(1),
});

export const upsertFeeStructure = asyncHandler(async (req: Request, res: Response) => {
  const payload = structureSchema.parse(req.body);
  const tenantId = req.user?.role === "super_admin" ? req.body.tenantId : req.user?.tenantId;

  const structure = await FeeStructure.findOneAndUpdate(
    { branchId: payload.branchId, classId: payload.classId, academicYearId: payload.academicYearId },
    { ...payload, tenantId },
    { new: true, upsert: true, runValidators: true }
  );
  res.status(201).json({ success: true, data: structure });
});

export const listFeeStructures = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.academicYearId) filter.academicYearId = req.query.academicYearId;
  const structures = await FeeStructure.find(filter)
    .populate("classId", "name")
    .populate("installments.items.feeHeadId", "name");
  res.json({ success: true, data: structures });
});

// ---------------- Fee Concession ----------------
const concessionSchema = z.object({
  studentId: z.string(),
  academicYearId: z.string(),
  feeHeadId: z.string().optional(),
  type: z.enum(["flat", "percentage"]),
  value: z.number().min(0),
  reason: z.string().min(2),
});

export const createConcession = asyncHandler(async (req: Request, res: Response) => {
  const payload = concessionSchema.parse(req.body);
  const tenantId = req.user?.role === "super_admin" ? req.body.tenantId : req.user?.tenantId;
  const branchId = req.body.branchId ?? req.user?.branchId;
  if (!branchId) throw ApiError.badRequest("branchId is required");

  const concession = await FeeConcession.create({
    ...payload,
    tenantId,
    branchId,
    approvedBy: req.user?.userId,
  });
  res.status(201).json({ success: true, data: concession });
});

export const listConcessions = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.studentId) filter.studentId = req.query.studentId;
  const concessions = await FeeConcession.find(filter).populate("feeHeadId", "name");
  res.json({ success: true, data: concessions });
});

// ---------------- Student Fee Summary ----------------
export const getStudentFeeSummary = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role === "parent" || req.user?.role === "student") {
    await assertStudentAccess(req, req.params.studentId);
  }
  const student = await Student.findOne({ _id: req.params.studentId, ...scopeFilter(req) });
  if (!student) throw ApiError.notFound("Student not found");

  const summary = await computeStudentFeeSummary(
    student._id.toString(),
    student.branchId.toString(),
    student.classId.toString(),
    student.academicYearId.toString()
  );
  res.json({ success: true, data: summary });
});

// ---------------- Offline Collection (Cash / Cheque / DD) ----------------
const collectSchema = z.object({
  studentId: z.string(),
  installmentName: z.string(),
  amount: z.number().positive(),
  mode: z.enum(["cash", "cheque", "dd"]),
  chequeNumber: z.string().optional(),
  bankName: z.string().optional(),
  remarks: z.string().optional(),
});

// FR-5.5 + FR-5.6: Accountant counter collection with immediate,
// sequentially-numbered digital receipt (S-5.2 partial payments allowed —
// amount need not equal the full outstanding installment).
export const collectOfflinePayment = asyncHandler(async (req: Request, res: Response) => {
  const payload = collectSchema.parse(req.body);
  if ((payload.mode === "cheque" || payload.mode === "dd") && !payload.chequeNumber) {
    throw ApiError.badRequest("chequeNumber is required for cheque/DD payments");
  }

  const student = await Student.findOne({ _id: payload.studentId, ...scopeFilter(req) });
  if (!student) throw ApiError.notFound("Student not found");

  const summary = await computeStudentFeeSummary(
    student._id.toString(),
    student.branchId.toString(),
    student.classId.toString(),
    student.academicYearId.toString()
  );
  if (!summary.feeStructureId) throw ApiError.badRequest("No fee structure configured for this class/year");

  const installment = summary.installments.find((i) => i.name === payload.installmentName);
  if (!installment) throw ApiError.badRequest(`"${payload.installmentName}" is not an installment on this student's fee structure`);
  if (payload.amount > installment.outstanding) {
    throw ApiError.badRequest(
      `Amount (Rs.${payload.amount}) exceeds the outstanding balance for ${payload.installmentName} (Rs.${installment.outstanding}). To pay ahead, collect against a later installment instead.`
    );
  }

  const receiptNumber = await generateReceiptNumber(student.branchId.toString(), financialYearLabel());

  const transaction = await FeeTransaction.create({
    tenantId: student.tenantId,
    branchId: student.branchId,
    studentId: student._id,
    academicYearId: student.academicYearId,
    feeStructureId: summary.feeStructureId,
    installmentName: payload.installmentName,
    amount: payload.amount,
    mode: payload.mode,
    status: "success",
    receiptNumber,
    chequeDetails:
      payload.mode === "cheque" || payload.mode === "dd"
        ? { chequeNumber: payload.chequeNumber!, bankName: payload.bankName ?? "" }
        : undefined,
    collectedBy: req.user?.userId,
    paidAt: new Date(),
    remarks: payload.remarks,
  });

  res.status(201).json({ success: true, data: transaction });
});

// S-5.3: cheque bounce after receipt issued -> reverse the credit (excluded
// from "success" sums so the due reopens automatically), log a configurable
// bounce fine, and notify the guardian.
const bounceSchema = z.object({
  reason: z.string().min(2),
  bounceFine: z.number().min(0).default(0),
});

export const markChequeBounced = asyncHandler(async (req: Request, res: Response) => {
  const payload = bounceSchema.parse(req.body);
  const transaction = await FeeTransaction.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!transaction) throw ApiError.notFound("Transaction not found");
  if (transaction.mode !== "cheque" && transaction.mode !== "dd") {
    throw ApiError.badRequest("Only cheque/DD transactions can bounce");
  }

  transaction.status = "bounced";
  transaction.chequeDetails = {
    ...transaction.chequeDetails,
    chequeNumber: transaction.chequeDetails?.chequeNumber ?? "",
    bankName: transaction.chequeDetails?.bankName ?? "",
    bouncedAt: new Date(),
    bounceReason: payload.reason,
    bounceFine: payload.bounceFine,
  };
  await transaction.save();

  const student = await Student.findById(transaction.studentId).populate("guardians.guardianId");
  if (student) {
    const guardians = await Guardian.find({ _id: { $in: student.guardians.map((g) => g.guardianId) } });
    await Promise.all(
      guardians.map((guardian) =>
        notifyWithFallback(
          guardian.phone,
          "cheque_bounce",
          `Cheque #${transaction.chequeDetails!.chequeNumber} for ${student.firstName} ${student.lastName} (Receipt ${transaction.receiptNumber}) has bounced. Reason: ${payload.reason}. Please clear the due amount${
            payload.bounceFine ? ` plus a bounce fine of Rs.${payload.bounceFine}` : ""
          } at the earliest.`
        )
      )
    );
  }

  res.json({ success: true, data: transaction });
});

export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.studentId) filter.studentId = req.query.studentId;
  if (req.query.status) filter.status = req.query.status;
  const transactions = await FeeTransaction.find(filter)
    .populate("studentId", "firstName lastName admissionNumber")
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, data: transactions });
});

// ---------------- Online Payment (Razorpay) ----------------
const createOrderSchema = z.object({
  studentId: z.string(),
  installmentName: z.string(),
  amount: z.number().positive(),
});

// FR-5.4: UPI/Card/NetBanking via Razorpay. Gracefully reports "not
// configured" instead of crashing when RAZORPAY_* env vars are blank.
export const createOnlineOrder = asyncHandler(async (req: Request, res: Response) => {
  const payload = createOrderSchema.parse(req.body);
  // Checks are deliberately ordered request-correctness-first: ownership,
  // then whether the request itself is valid (student/installment/amount),
  // and only last whether the payment gateway happens to be configured —
  // a 503 must never mask a 403 or a 400 for an otherwise-bad request.
  if (req.user?.role === "parent") {
    await assertStudentAccess(req, payload.studentId);
  }
  const student = await Student.findOne({ _id: payload.studentId, ...scopeFilter(req) });
  if (!student) throw ApiError.notFound("Student not found");

  const summary = await computeStudentFeeSummary(
    student._id.toString(),
    student.branchId.toString(),
    student.classId.toString(),
    student.academicYearId.toString()
  );
  if (!summary.feeStructureId) throw ApiError.badRequest("No fee structure configured for this class/year");

  const installment = summary.installments.find((i) => i.name === payload.installmentName);
  if (!installment) throw ApiError.badRequest(`"${payload.installmentName}" is not an installment on this student's fee structure`);
  if (payload.amount > installment.outstanding) {
    throw ApiError.badRequest(`Amount exceeds the outstanding balance for ${payload.installmentName} (Rs.${installment.outstanding}).`);
  }

  if (!env.isRazorpayConfigured) {
    throw new ApiError(503, "Online payments are not configured yet. Use offline collection, or set RAZORPAY_KEY_ID/SECRET.");
  }

  const receiptNumber = await generateReceiptNumber(student.branchId.toString(), financialYearLabel());
  const order = await createOrder(payload.amount, receiptNumber);

  const transaction = await FeeTransaction.create({
    tenantId: student.tenantId,
    branchId: student.branchId,
    studentId: student._id,
    academicYearId: student.academicYearId,
    feeStructureId: summary.feeStructureId,
    installmentName: payload.installmentName,
    amount: payload.amount,
    mode: "upi",
    status: "pending",
    receiptNumber,
    gateway: { provider: "razorpay", orderId: order.id },
  });

  res.status(201).json({
    success: true,
    data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.razorpay.keyId, transactionId: transaction._id },
  });
});

const verifyPaymentSchema = z.object({
  transactionId: z.string(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

// FR-5.4 acceptance criteria: payment status updates in real time. This is
// the client-callback path; a server-to-server /webhook route below covers
// the case where the browser never returns (S-5.1).
export const verifyOnlinePayment = asyncHandler(async (req: Request, res: Response) => {
  const payload = verifyPaymentSchema.parse(req.body);
  const valid = verifySignature(payload.razorpayOrderId, payload.razorpayPaymentId, payload.razorpaySignature);
  if (!valid) throw ApiError.badRequest("Payment signature verification failed");

  const transaction = await FeeTransaction.findOne({ _id: payload.transactionId, ...scopeFilter(req) });
  if (!transaction) throw ApiError.notFound("Transaction not found");
  if (req.user?.role === "parent") {
    await assertStudentAccess(req, transaction.studentId.toString());
  }

  transaction.status = "success";
  transaction.paidAt = new Date();
  transaction.gateway = {
    provider: "razorpay",
    orderId: payload.razorpayOrderId,
    paymentId: payload.razorpayPaymentId,
    signature: payload.razorpaySignature,
  };
  await transaction.save();

  res.json({ success: true, data: transaction });
});

// ---------------- Fee Dashboard (FR-5.8) ----------------
export const feeDashboard = asyncHandler(async (req: Request, res: Response) => {
  const filter = scopeFilter(req);

  const [byMode, byStatus] = await Promise.all([
    FeeTransaction.aggregate([
      { $match: { ...filter, status: "success" } },
      { $group: { _id: "$mode", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    FeeTransaction.aggregate([
      { $match: filter },
      { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);

  const recent = await FeeTransaction.find({ ...filter, status: "success" })
    .populate("studentId", "firstName lastName admissionNumber")
    .sort({ createdAt: -1 })
    .limit(10);

  const collectedTotal = byMode.reduce((sum, m) => sum + m.total, 0);

  res.json({
    success: true,
    data: { collectedTotal, byMode, byStatus, recentTransactions: recent },
  });
});

// ---------------- Outstanding Dues Report ----------------
export const outstandingDuesReport = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req), status: "active" };
  if (req.query.classId) filter.classId = req.query.classId;

  const students = await Student.find(filter).populate("classId", "name").limit(500);

  // Read-only per-student computations with no shared state — safe (and, at
  // full-school scale, necessary) to run concurrently rather than one at a
  // time, which turned a 500-student report into 1500+ sequential queries.
  const rows = await Promise.all(
    students.map(async (student) => {
      // S-1.4: sum across every year the student has ever been in, so a due
      // left over from before a promotion isn't silently dropped just
      // because the student is now looked up by their new class/year.
      const yearEntries = [
        ...student.promotionHistory.map((p) => ({ academicYearId: p.academicYearId.toString(), classId: p.classId.toString() })),
        { academicYearId: student.academicYearId.toString(), classId: student.classId._id.toString() },
      ];
      const { totals, byYear } = await computeStudentFeeSummaryAllYears(student._id.toString(), student.branchId.toString(), yearEntries);
      if (totals.outstanding <= 0) return null;
      return {
        studentId: student._id,
        name: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        className: (student.classId as unknown as { name: string }).name,
        outstanding: totals.outstanding,
        overdueInstallments: byYear.flatMap((y) => y.installments.filter((i) => i.isOverdue).map((i) => i.name)),
        carriedForwardFromPriorYear: byYear.length > 1 && byYear.slice(0, -1).some((y) => y.totals.outstanding > 0),
      };
    })
  );
  const report = rows.filter((row): row is NonNullable<typeof row> => row !== null);

  res.json({ success: true, data: report });
});
