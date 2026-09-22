import { Request, Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Student } from "../models/Student";
import { ClassMaster, Section } from "../models/ClassSection";
import { AcademicYear } from "../models/AcademicYear";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

// Per-class active headcount for the year being rolled over, so the Admin
// UI can build the "Class 5 -> Class 6" mapping without a separate lookup.
// Uses find() + in-memory grouping rather than an aggregate $match, since
// Mongoose auto-casts string ids to ObjectId for find() filters but not for
// raw aggregate stages.
export const getPromotionPreview = asyncHandler(async (req: Request, res: Response) => {
  const academicYearId = String(req.query.academicYearId ?? "");
  if (!academicYearId) throw ApiError.badRequest("academicYearId is required");

  const [students, classes] = await Promise.all([
    Student.find({ ...scopeFilter(req), academicYearId, status: "active" }).select("classId"),
    ClassMaster.find({ ...scopeFilter(req) }).sort({ order: 1 }),
  ]);

  const result = classes.map((c) => ({
    classId: c._id,
    className: c.name,
    activeStudentCount: students.filter((s) => s.classId.toString() === c._id.toString()).length,
  }));

  res.json({ success: true, data: result });
});

const promoteSchema = z.object({
  fromAcademicYearId: z.string(),
  toAcademicYearId: z.string(),
  classMapping: z
    .array(
      z.object({
        fromClassId: z.string(),
        toClassId: z.string().nullable(), // null = graduating class -> alumni
      })
    )
    .min(1),
});

// S-1.4: academic year rollover. Each student's (year, class, section) is
// snapshotted into promotionHistory before being overwritten, so past fee
// dues and attendance stay attributable to the year they happened in —
// nothing about a prior year is deleted or renumbered.
export const promoteStudents = asyncHandler(async (req: Request, res: Response) => {
  const payload = promoteSchema.parse(req.body);

  const [fromYear, toYear] = await Promise.all([
    AcademicYear.findOne({ _id: payload.fromAcademicYearId, ...scopeFilter(req) }),
    AcademicYear.findOne({ _id: payload.toAcademicYearId, ...scopeFilter(req) }),
  ]);
  if (!fromYear || !toYear) throw ApiError.badRequest("Invalid academic year(s)");
  if (fromYear.branchId.toString() !== toYear.branchId.toString()) {
    throw ApiError.badRequest("Both academic years must belong to the same branch");
  }

  const mappingByClass = new Map(payload.classMapping.map((m) => [m.fromClassId, m.toClassId]));
  const students = await Student.find({
    ...scopeFilter(req),
    academicYearId: payload.fromAcademicYearId,
    status: "active",
  });

  let promoted = 0;
  let graduated = 0;
  const skipped: { studentId: string; name: string; reason: string }[] = [];

  // Cache target sections per (toClassId, sectionName) to avoid N repeated queries.
  const sectionCache = new Map<string, string | null>();

  for (const student of students) {
    if (!mappingByClass.has(student.classId.toString())) {
      skipped.push({ studentId: student._id.toString(), name: `${student.firstName} ${student.lastName}`, reason: "No class mapping provided" });
      continue;
    }

    const toClassId = mappingByClass.get(student.classId.toString());
    if (toClassId === null) {
      student.status = "alumni";
      await student.save();
      graduated += 1;
      continue;
    }

    const currentSection = await Section.findById(student.sectionId);
    const cacheKey = `${toClassId}:${currentSection?.name ?? ""}`;
    if (!sectionCache.has(cacheKey)) {
      const target = await Section.findOne({ classId: toClassId, name: currentSection?.name });
      sectionCache.set(cacheKey, target?._id.toString() ?? null);
    }
    const targetSectionId = sectionCache.get(cacheKey);

    if (!targetSectionId) {
      skipped.push({
        studentId: student._id.toString(),
        name: `${student.firstName} ${student.lastName}`,
        reason: `No matching section "${currentSection?.name}" found in the target class`,
      });
      continue;
    }

    student.promotionHistory.push({
      academicYearId: student.academicYearId,
      classId: student.classId,
      sectionId: student.sectionId,
      promotedAt: new Date(),
    });
    student.academicYearId = toYear._id;
    student.classId = new mongoose.Types.ObjectId(toClassId);
    student.sectionId = new mongoose.Types.ObjectId(targetSectionId);
    student.rollNumber = undefined;
    await student.save();
    promoted += 1;
  }

  // The rollover is also the natural signal to flip which year is "active"
  // for forms elsewhere (admissions, attendance, fee structures default to it).
  fromYear.isActive = false;
  toYear.isActive = true;
  await Promise.all([fromYear.save(), toYear.save()]);

  res.json({ success: true, data: { promoted, graduated, skipped, totalProcessed: students.length } });
});
