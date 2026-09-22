import { Request, Response } from "express";
import { z } from "zod";
import { Student } from "../models/Student";
import { Guardian } from "../models/Guardian";
import { AcademicYear } from "../models/AcademicYear";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { generateAdmissionNumber, generateEnrollmentNumber } from "../utils/numbering";
import { assertStudentAccess } from "../utils/studentAccess";

const guardianInputSchema = z.object({
  existingGuardianId: z.string().optional(),
  name: z.string().min(2).optional(),
  relation: z.string().min(2),
  phone: z.string().min(6).optional(),
  email: z.string().email().optional(),
});

const createStudentSchema = z.object({
  branchId: z.string(),
  academicYearId: z.string(),
  classId: z.string(),
  sectionId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.coerce.date(),
  gender: z.enum(["male", "female", "other"]),
  category: z.string().optional(),
  house: z.string().optional(),
  apaarId: z.string().optional(),
  pen: z.string().optional(),
  apaarConsent: z
    .object({ granted: z.boolean(), guardianName: z.string() })
    .optional(),
  rollNumber: z.string().optional(),
  guardians: z.array(guardianInputSchema).min(1),
});

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  // Parents/students get the roster's full details this way; they have a
  // dedicated, ownership-scoped endpoint instead (see /students/my-children).
  if (req.user?.role === "parent" || req.user?.role === "student") throw ApiError.forbidden();

  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    filter.$text = { $search: String(req.query.q) };
  }

  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 25);

  const [items, total] = await Promise.all([
    Student.find(filter)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Student.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, meta: { total, page, limit } });
});

export const getStudent = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role === "parent" || req.user?.role === "student") {
    await assertStudentAccess(req, req.params.id);
  }
  const student = await Student.findOne({ _id: req.params.id, ...scopeFilter(req) })
    .populate("classId", "name")
    .populate("sectionId", "name")
    .populate("guardians.guardianId");
  if (!student) throw ApiError.notFound("Student not found");
  res.json({ success: true, data: student });
});

// Sibling switching (FR-2.4, FR-9.1): all children linked to the logged-in
// parent's guardian profile, so the app can switch context in one click.
export const listMyChildren = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== "parent") throw ApiError.forbidden();
  const guardian = await Guardian.findOne({ userId: req.user.userId });
  if (!guardian) return res.json({ success: true, data: [] });

  const students = await Student.find({ _id: { $in: guardian.studentIds } })
    .populate("classId", "name")
    .populate("sectionId", "name");
  res.json({ success: true, data: students });
});

export const createStudent = asyncHandler(async (req: Request, res: Response) => {
  const payload = createStudentSchema.parse(req.body);
  const tenantId = req.user?.role === "super_admin" ? req.body.tenantId : req.user?.tenantId;
  if (!tenantId) throw ApiError.badRequest("tenantId is required");

  const academicYear = await AcademicYear.findById(payload.academicYearId);
  if (!academicYear) throw ApiError.badRequest("Invalid academic year");

  const [admissionNumber, enrollmentNumber] = await Promise.all([
    generateAdmissionNumber(payload.branchId, academicYear.name),
    generateEnrollmentNumber(payload.branchId, academicYear.name),
  ]);

  // Resolve guardians: link to an existing guardian record, or create a new one.
  const guardianLinks: { guardianId: string; relation: string }[] = [];
  for (const g of payload.guardians) {
    if (g.existingGuardianId) {
      guardianLinks.push({ guardianId: g.existingGuardianId, relation: g.relation });
      continue;
    }
    if (!g.name || !g.phone) {
      throw ApiError.badRequest("New guardian requires name and phone");
    }
    const guardian = await Guardian.create({
      tenantId,
      name: g.name,
      relation: g.relation,
      phone: g.phone,
      email: g.email,
      isPrimary: guardianLinks.length === 0,
    });
    guardianLinks.push({ guardianId: guardian._id.toString(), relation: g.relation });
  }

  const student = await Student.create({
    tenantId,
    branchId: payload.branchId,
    academicYearId: payload.academicYearId,
    classId: payload.classId,
    sectionId: payload.sectionId,
    admissionNumber,
    enrollmentNumber,
    rollNumber: payload.rollNumber,
    firstName: payload.firstName,
    lastName: payload.lastName,
    dob: payload.dob,
    gender: payload.gender,
    category: payload.category,
    house: payload.house,
    apaarId: payload.apaarId,
    pen: payload.pen,
    apaarConsent: payload.apaarConsent
      ? { ...payload.apaarConsent, consentedAt: new Date() }
      : undefined,
    guardians: guardianLinks,
  });

  // Back-link the student on each guardian for sibling switching.
  await Guardian.updateMany(
    { _id: { $in: guardianLinks.map((g) => g.guardianId) } },
    { $addToSet: { studentIds: student._id } }
  );

  res.status(201).json({ success: true, data: student });
});

const updateStudentSchema = createStudentSchema.partial().extend({
  status: z.enum(["active", "inactive", "alumni", "transferred"]).optional(),
});

export const updateStudent = asyncHandler(async (req: Request, res: Response) => {
  const payload = updateStudentSchema.parse(req.body);
  const student = await Student.findOneAndUpdate(
    { _id: req.params.id, ...scopeFilter(req) },
    payload,
    { new: true, runValidators: true }
  );
  if (!student) throw ApiError.notFound("Student not found");
  res.json({ success: true, data: student });
});
