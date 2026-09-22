import { Request, Response } from "express";
import { z } from "zod";
import { Notice, NoticeRead } from "../models/Notice";
import { Student } from "../models/Student";
import { Guardian } from "../models/Guardian";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { notifyWithFallback } from "../services/notification.service";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  audienceType: z.enum(["all", "class", "section"]),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
});

// FR-7.1: publish to all/class/section. Teachers may only target a section
// (their own class), per the FRD's flagged "configurable per school policy" note.
export const createNotice = asyncHandler(async (req: Request, res: Response) => {
  const payload = createSchema.parse(req.body);
  if (req.user?.role === "teacher" && payload.audienceType !== "section") {
    throw ApiError.forbidden("Teachers can only publish notices to a specific section");
  }
  if (payload.audienceType === "class" && !payload.classId) throw ApiError.badRequest("classId is required");
  if (payload.audienceType === "section" && !payload.sectionId) throw ApiError.badRequest("sectionId is required");

  const notice = await Notice.create({
    ...payload,
    tenantId: req.user?.tenantId,
    branchId: req.user?.branchId,
    createdBy: req.user?.userId,
  });

  const studentFilter: Record<string, unknown> = { branchId: req.user?.branchId, status: "active" };
  if (payload.audienceType === "class") studentFilter.classId = payload.classId;
  if (payload.audienceType === "section") studentFilter.sectionId = payload.sectionId;
  const students = await Student.find(studentFilter);
  const guardianIds = [...new Set(students.flatMap((s) => s.guardians.map((g) => g.guardianId.toString())))];
  const guardians = await Guardian.find({ _id: { $in: guardianIds } });
  await Promise.all(
    guardians.map((guardian) => notifyWithFallback(guardian.phone, "notice_published", `New notice: "${payload.title}"`))
  );

  res.status(201).json({ success: true, data: notice });
});

// Parents/students see only notices relevant to their child's / own class-section.
export const listNotices = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };

  if (req.user?.role === "parent" || req.user?.role === "student") {
    const user = await User.findById(req.user.userId);
    let classIds: string[] = [];
    let sectionIds: string[] = [];

    if (req.user.role === "parent" && user?.guardianProfileId) {
      const guardian = await Guardian.findById(user.guardianProfileId);
      const students = await Student.find({ _id: { $in: guardian?.studentIds ?? [] } });
      classIds = students.map((s) => s.classId.toString());
      sectionIds = students.map((s) => s.sectionId.toString());
    } else if (req.user.role === "student" && user?.studentProfileId) {
      const student = await Student.findById(user.studentProfileId);
      if (student) {
        classIds = [student.classId.toString()];
        sectionIds = [student.sectionId.toString()];
      }
    }

    filter.$or = [
      { audienceType: "all" },
      { audienceType: "class", classId: { $in: classIds } },
      { audienceType: "section", sectionId: { $in: sectionIds } },
    ];
  }

  const notices = await Notice.find(filter).populate("createdBy", "name role").sort({ publishedAt: -1 }).limit(100);
  res.json({ success: true, data: notices });
});

export const markNoticeRead = asyncHandler(async (req: Request, res: Response) => {
  const notice = await Notice.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!notice) throw ApiError.notFound("Notice not found");

  await NoticeRead.findOneAndUpdate(
    { noticeId: notice._id, userId: req.user?.userId },
    { readAt: new Date() },
    { upsert: true }
  );
  res.json({ success: true, data: { read: true } });
});

// FR-7.1 acceptance criteria: read-receipt tracking available to sender.
export const getReadReceipts = asyncHandler(async (req: Request, res: Response) => {
  const notice = await Notice.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!notice) throw ApiError.notFound("Notice not found");

  const studentFilter: Record<string, unknown> = { branchId: notice.branchId, status: "active" };
  if (notice.audienceType === "class") studentFilter.classId = notice.classId;
  if (notice.audienceType === "section") studentFilter.sectionId = notice.sectionId;
  const students = await Student.find(studentFilter);
  const guardianIds = [...new Set(students.flatMap((s) => s.guardians.map((g) => g.guardianId.toString())))];
  const guardians = await Guardian.find({ _id: { $in: guardianIds }, userId: { $ne: null } });
  const eligibleUserIds = guardians.map((g) => g.userId?.toString()).filter(Boolean);

  const reads = await NoticeRead.find({ noticeId: notice._id }).populate("userId", "name role");

  res.json({
    success: true,
    data: {
      totalEligible: eligibleUserIds.length,
      totalRead: reads.filter((r) => eligibleUserIds.includes(r.userId._id.toString())).length,
      readers: reads.map((r) => ({ name: (r.userId as unknown as { name: string })?.name, readAt: r.readAt })),
    },
  });
});
