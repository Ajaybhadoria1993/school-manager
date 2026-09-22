import { Request, Response } from "express";
import { z } from "zod";
import { Homework } from "../models/Homework";
import { Student } from "../models/Student";
import { Guardian } from "../models/Guardian";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { notifyWithFallback } from "../services/notification.service";
import { assertStudentAccess } from "../utils/studentAccess";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

export const listHomework = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;
  const items = await Homework.find(filter)
    .populate("subjectId", "name")
    .populate("assignedBy", "name")
    .sort({ dueDate: -1 });
  res.json({ success: true, data: items });
});

// A student/parent's homework feed for a given child — filters to homework
// published on or after the student's admission date so late joiners don't
// see history from before they enrolled (S-6.6).
export const listHomeworkForStudent = asyncHandler(async (req: Request, res: Response) => {
  const isFamily = req.user?.role === "parent" || req.user?.role === "student";
  if (isFamily) await assertStudentAccess(req, req.params.studentId);

  const student = isFamily
    ? await Student.findById(req.params.studentId)
    : await Student.findOne({ _id: req.params.studentId, ...scopeFilter(req) });
  if (!student) throw ApiError.notFound("Student not found");
  const items = await Homework.find({
    sectionId: student.sectionId,
    publishedAt: { $gte: student.admissionDate },
  })
    .populate("subjectId", "name")
    .sort({ dueDate: -1 });
  res.json({ success: true, data: items });
});

const createSchema = z.object({
  academicYearId: z.string(),
  classId: z.string(),
  sectionId: z.string(),
  subjectId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  attachmentUrl: z.string().url().optional(),
  dueDate: z.coerce.date(),
});

// FR-6.2 acceptance criteria: parent/student notified upon publish — homework
// here is published immediately on creation (no separate draft state), so
// the notification fires as part of this call.
export const createHomework = asyncHandler(async (req: Request, res: Response) => {
  const payload = createSchema.parse(req.body);
  const tenantId = req.user?.tenantId;
  const branchId = req.user?.branchId;

  const user = await User.findById(req.user?.userId);
  if (!user?.staffProfileId) throw ApiError.badRequest("No staff profile linked to this account");

  const homework = await Homework.create({
    ...payload,
    tenantId,
    branchId,
    assignedBy: user.staffProfileId,
  });

  const students = await Student.find({ sectionId: payload.sectionId, status: "active" });
  const guardianIds = students.flatMap((s) => s.guardians.map((g) => g.guardianId));
  const guardians = await Guardian.find({ _id: { $in: guardianIds } });
  await Promise.all(
    guardians.map((guardian) =>
      notifyWithFallback(
        guardian.phone,
        "homework_published",
        `New homework "${payload.title}" published, due ${payload.dueDate.toLocaleDateString("en-IN")}.`
      )
    )
  );

  res.status(201).json({ success: true, data: homework });
});

export const deleteHomework = asyncHandler(async (req: Request, res: Response) => {
  const homework = await Homework.findOneAndDelete({ _id: req.params.id, ...scopeFilter(req) });
  if (!homework) throw ApiError.notFound("Homework not found");
  res.json({ success: true, data: { _id: req.params.id } });
});
