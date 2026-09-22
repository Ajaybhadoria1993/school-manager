import { Request, Response } from "express";
import { z } from "zod";
import { Certificate, CertificateType } from "../models/Certificate";
import { Student } from "../models/Student";
import { Staff } from "../models/Staff";
import { Branch } from "../models/Branch";
import { FeeTransaction } from "../models/Fee";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { generateCertificateSerial } from "../utils/numbering";
import { computeStudentFeeSummary } from "../services/feeCalculation.service";
import { assertStudentAccess } from "../utils/studentAccess";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

async function assertNoDuesHold(student: InstanceType<typeof Student>, policyKey: "holdTCForDues") {
  const branch = await Branch.findById(student.branchId);
  if (!branch?.policies?.[policyKey]) return;
  const summary = await computeStudentFeeSummary(
    student._id.toString(),
    student.branchId.toString(),
    student.classId.toString(),
    student.academicYearId.toString()
  );
  if (summary.totals.outstanding > 0) {
    throw ApiError.forbidden(
      `Cannot issue while fees are outstanding (Rs.${summary.totals.outstanding} due). Clear dues first, or ask an Admin to disable the hold policy.`
    );
  }
}

// FR-8.1 + S-8.1: TC serial never repeats; optionally blocked while dues are outstanding.
const tcSchema = z.object({
  studentId: z.string(),
  reasonForLeaving: z.string().min(2),
  lastAttendanceDate: z.coerce.date(),
  conduct: z.string().default("Good"),
});

export const issueTransferCertificate = asyncHandler(async (req: Request, res: Response) => {
  const payload = tcSchema.parse(req.body);
  const student = await Student.findOne({ _id: payload.studentId, ...scopeFilter(req) });
  if (!student) throw ApiError.notFound("Student not found");

  await assertNoDuesHold(student, "holdTCForDues");

  const serialNumber = await generateCertificateSerial(student.branchId.toString(), "TC");
  const certificate = await Certificate.create({
    tenantId: student.tenantId,
    branchId: student.branchId,
    studentId: student._id,
    type: "transfer",
    serialNumber,
    data: {
      reasonForLeaving: payload.reasonForLeaving,
      lastAttendanceDate: payload.lastAttendanceDate.toISOString(),
      conduct: payload.conduct,
    },
    issuedBy: req.user?.userId,
  });

  student.status = "transferred";
  await student.save();

  res.status(201).json({ success: true, data: certificate });
});

// FR-8.2: on-demand, configurable purpose text.
const bonafideSchema = z.object({ studentId: z.string(), purpose: z.string().min(2) });

export const issueBonafideCertificate = asyncHandler(async (req: Request, res: Response) => {
  const payload = bonafideSchema.parse(req.body);
  const student = await Student.findOne({ _id: payload.studentId, ...scopeFilter(req) });
  if (!student) throw ApiError.notFound("Student not found");

  const serialNumber = await generateCertificateSerial(student.branchId.toString(), "BONAFIDE");
  const certificate = await Certificate.create({
    tenantId: student.tenantId,
    branchId: student.branchId,
    studentId: student._id,
    type: "bonafide",
    serialNumber,
    data: { purpose: payload.purpose },
    issuedBy: req.user?.userId,
  });

  res.status(201).json({ success: true, data: certificate });
});

// FR-8.3: amount must reconcile exactly with the fee ledger — computed
// directly from successful FeeTransaction records for the given FY, never
// hand-typed.
const feePaidSchema = z.object({ studentId: z.string(), financialYear: z.string() });

export const issueFeePaidCertificate = asyncHandler(async (req: Request, res: Response) => {
  const payload = feePaidSchema.parse(req.body);
  const student = await Student.findOne({ _id: payload.studentId, ...scopeFilter(req) });
  if (!student) throw ApiError.notFound("Student not found");

  const [startYear] = payload.financialYear.split("-");
  const start = new Date(`${startYear}-04-01T00:00:00.000Z`);
  const end = new Date(`${Number(startYear) + 1}-04-01T00:00:00.000Z`);

  const transactions = await FeeTransaction.find({
    studentId: student._id,
    status: "success",
    paidAt: { $gte: start, $lt: end },
  });
  const totalPaid = transactions.reduce((sum, t) => sum + t.amount, 0);

  const serialNumber = await generateCertificateSerial(student.branchId.toString(), "FEEPAID");
  const certificate = await Certificate.create({
    tenantId: student.tenantId,
    branchId: student.branchId,
    studentId: student._id,
    type: "fee_paid",
    serialNumber,
    data: { financialYear: payload.financialYear, totalPaid },
    issuedBy: req.user?.userId,
  });

  res.status(201).json({ success: true, data: certificate });
});

// S-8.2: re-issuance is version controlled — the old serial is retired
// (status: superseded, never deleted) and a new certificate gets a new,
// never-reused serial, linked back via `supersedes`.
export const reissueCertificate = asyncHandler(async (req: Request, res: Response) => {
  const original = await Certificate.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!original) throw ApiError.notFound("Certificate not found");

  original.status = "superseded";
  await original.save();

  const typeCode = original.type === "transfer" ? "TC" : original.type === "bonafide" ? "BONAFIDE" : "FEEPAID";
  const serialNumber = await generateCertificateSerial(original.branchId.toString(), typeCode);

  const reissued = await Certificate.create({
    tenantId: original.tenantId,
    branchId: original.branchId,
    studentId: original.studentId,
    type: original.type,
    serialNumber,
    data: { ...original.data, ...req.body },
    issuedBy: req.user?.userId,
    supersedes: original._id,
  });

  res.status(201).json({ success: true, data: reissued });
});

const STAFF_ROLES = new Set(["super_admin", "school_admin", "principal", "accountant"]);

export const listCertificates = asyncHandler(async (req: Request, res: Response) => {
  const studentId = String(req.query.studentId ?? "");
  if (!studentId) throw ApiError.badRequest("studentId is required");
  if (!(req.user && STAFF_ROLES.has(req.user.role))) {
    await assertStudentAccess(req, studentId);
  }

  const type = req.query.type as CertificateType | undefined;
  const filter: Record<string, unknown> = { ...scopeFilter(req), studentId };
  if (type) filter.type = type;

  const certificates = await Certificate.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: certificates });
});

export const getCertificate = asyncHandler(async (req: Request, res: Response) => {
  const certificate = await Certificate.findOne({ _id: req.params.id, ...scopeFilter(req) }).populate(
    "studentId",
    "firstName lastName admissionNumber classId sectionId dob"
  );
  if (!certificate) throw ApiError.notFound("Certificate not found");
  if (!(req.user && STAFF_ROLES.has(req.user.role))) {
    await assertStudentAccess(req, certificate.studentId._id.toString());
  }
  const branch = await Branch.findById(certificate.branchId);
  res.json({ success: true, data: { ...certificate.toObject(), branchName: branch?.name } });
});

// ---- ID Cards (FR-8.4) — generated on demand, not a serially-tracked document ----
export const getStudentIdCard = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role === "parent" || req.user?.role === "student") {
    await assertStudentAccess(req, req.params.studentId);
  }
  const student = await Student.findOne({ _id: req.params.studentId, ...scopeFilter(req) })
    .populate("classId", "name")
    .populate("sectionId", "name");
  if (!student) throw ApiError.notFound("Student not found");
  const branch = await Branch.findById(student.branchId);
  res.json({ success: true, data: { student, branch } });
});

export const getStaffIdCard = asyncHandler(async (req: Request, res: Response) => {
  const staff = await Staff.findOne({ _id: req.params.staffId, ...scopeFilter(req) });
  if (!staff) throw ApiError.notFound("Staff member not found");
  const branch = await Branch.findById(staff.branchId);
  res.json({ success: true, data: { staff, branch } });
});
