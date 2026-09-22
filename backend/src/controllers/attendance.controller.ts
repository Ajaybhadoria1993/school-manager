import { Request, Response } from "express";
import { z } from "zod";
import { Attendance, AttendanceStatus } from "../models/Attendance";
import { Student } from "../models/Student";
import { Guardian } from "../models/Guardian";
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

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const markSchema = z.object({
  branchId: z.string(),
  academicYearId: z.string(),
  classId: z.string(),
  sectionId: z.string(),
  date: z.coerce.date(),
  isBackfilled: z.boolean().optional(),
  entries: z
    .array(
      z.object({
        studentId: z.string(),
        status: z.enum(["present", "absent", "late", "half_day", "excused"]),
      })
    )
    .min(1),
});

async function notifyGuardiansIfAbsent(studentId: string, status: AttendanceStatus, date: Date) {
  if (status !== "absent") return;
  const student = await Student.findById(studentId).populate("guardians.guardianId");
  if (!student) return;
  const guardianIds = student.guardians.map((g) => g.guardianId);
  const guardians = await Guardian.find({ _id: { $in: guardianIds } });
  const dateLabel = date.toLocaleDateString("en-IN");
  await Promise.all(
    guardians.map((guardian) =>
      notifyWithFallback(
        guardian.phone,
        "attendance_absent",
        `${student.firstName} ${student.lastName} was marked ABSENT on ${dateLabel}.`
      )
    )
  );
}

// FR-4.1 + FR-4.2: bulk mark daily (or period-wise, reusing the same shape)
// attendance for a whole section in one call; upserts so re-submitting the
// same day corrects rather than duplicates.
export const markAttendance = asyncHandler(async (req: Request, res: Response) => {
  const payload = markSchema.parse(req.body);
  const tenantId = req.user?.tenantId;
  const day = startOfDay(payload.date);

  // Each entry targets a distinct studentId, so upserting the whole section
  // in parallel is safe (no two entries ever write the same document) and
  // avoids one DB round-trip per student on what can be a 40+ student class.
  const results = await Promise.all(
    payload.entries.map((entry) =>
      Attendance.findOneAndUpdate(
        { studentId: entry.studentId, date: day },
        {
          tenantId,
          branchId: payload.branchId,
          academicYearId: payload.academicYearId,
          classId: payload.classId,
          sectionId: payload.sectionId,
          studentId: entry.studentId,
          date: day,
          status: entry.status,
          markedBy: req.user?.userId,
          isBackfilled: payload.isBackfilled ?? false,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );

  // FR-4.3: notify within the request cycle (fire synchronously so failures surface in dev)
  await Promise.all(
    results.map(async (doc) => {
      await notifyGuardiansIfAbsent(doc.studentId.toString(), doc.status, day);
      if (doc.status === "absent") {
        doc.notifiedAt = new Date();
        await doc.save();
      }
    })
  );

  res.status(201).json({ success: true, data: results });
});

export const listAttendanceByDay = asyncHandler(async (req: Request, res: Response) => {
  const { sectionId, date } = req.query;
  if (!sectionId || !date) throw ApiError.badRequest("sectionId and date are required");

  const records = await Attendance.find({
    ...scopeFilter(req),
    sectionId,
    date: startOfDay(new Date(String(date))),
  }).populate("studentId", "firstName lastName admissionNumber rollNumber");

  res.json({ success: true, data: records });
});

// FR-4.4: monthly/term attendance percentage, recalculated on read so
// corrections are always reflected without a separate reconciliation job.
export const studentAttendanceSummary = asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  if (req.user?.role === "parent" || req.user?.role === "student") {
    await assertStudentAccess(req, studentId);
  } else {
    const student = await Student.findOne({ _id: studentId, ...scopeFilter(req) });
    if (!student) throw ApiError.notFound("Student not found");
  }

  const month = Number(req.query.month ?? new Date().getMonth() + 1);
  const year = Number(req.query.year ?? new Date().getFullYear());

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const records = await Attendance.find({ studentId, date: { $gte: start, $lt: end } });

  const countable = records.filter((r) => r.status !== "excused");
  const present = countable.filter((r) => r.status === "present" || r.status === "late").length;
  const halfDay = countable.filter((r) => r.status === "half_day").length;
  const totalMarked = countable.length;
  const effectivePresent = present + halfDay * 0.5;
  const percentage = totalMarked === 0 ? 0 : Math.round((effectivePresent / totalMarked) * 1000) / 10;

  res.json({
    success: true,
    data: {
      month,
      year,
      totalMarked,
      present,
      absent: countable.filter((r) => r.status === "absent").length,
      halfDay,
      excused: records.length - countable.length,
      percentage,
    },
  });
});

const correctSchema = z.object({
  status: z.enum(["present", "absent", "late", "half_day", "excused"]),
  correctionNote: z.string().min(1),
});

// S-4.2: teacher/admin correction after the absence alert already went out —
// sends a correction notice when the status actually changes.
export const correctAttendance = asyncHandler(async (req: Request, res: Response) => {
  const payload = correctSchema.parse(req.body);
  const record = await Attendance.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!record) throw ApiError.notFound("Attendance record not found");

  const previousStatus = record.status;
  record.status = payload.status;
  record.correctionNote = payload.correctionNote;
  record.correctedAt = new Date();
  await record.save();

  if (previousStatus !== payload.status) {
    const student = await Student.findById(record.studentId).populate("guardians.guardianId");
    if (student) {
      const guardians = await Guardian.find({ _id: { $in: student.guardians.map((g) => g.guardianId) } });
      for (const guardian of guardians) {
        await notifyWithFallback(
          guardian.phone,
          "attendance_correction",
          `Correction: ${student.firstName} ${student.lastName}'s attendance on ${record.date.toLocaleDateString(
            "en-IN"
          )} was updated from ${previousStatus.toUpperCase()} to ${payload.status.toUpperCase()}.`
        );
      }
    }
  }

  res.json({ success: true, data: record });
});
