import { Request, Response } from "express";
import { z } from "zod";
import { Exam, ExamSubject, Mark, ReportCard } from "../models/Exam";
import { Student } from "../models/Student";
import { Branch } from "../models/Branch";
import { Attendance } from "../models/Attendance";
import { assertStudentAccess } from "../utils/studentAccess";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { gradeForPercentage } from "../utils/grading";
import { computeStudentFeeSummary } from "../services/feeCalculation.service";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

const STAFF_ROLES = new Set(["super_admin", "school_admin", "principal", "teacher", "accountant"]);

async function buildReportCard(examId: string, studentId: string) {
  const exam = await Exam.findById(examId);
  if (!exam) throw ApiError.notFound("Exam not found");
  const student = await Student.findById(studentId).populate("classId", "name").populate("sectionId", "name");
  if (!student) throw ApiError.notFound("Student not found");

  const examSubjects = await ExamSubject.find({ examId }).populate("subjectId", "name");
  const marks = await Mark.find({ examSubjectId: { $in: examSubjects.map((s) => s._id) }, studentId });
  const marksByExamSubject = new Map(marks.map((m) => [m.examSubjectId.toString(), m]));

  const subjects = examSubjects.map((es) => {
    const mark = marksByExamSubject.get(es._id.toString());
    const maxTotal = es.maxInternal + es.maxWritten;
    const isAbsent = mark?.isAbsent ?? false;
    const obtained = isAbsent ? null : (mark?.internalMarks ?? 0) + (mark?.writtenMarks ?? 0);
    return {
      subjectName: (es.subjectId as unknown as { name: string })?.name ?? "Subject",
      maxInternal: es.maxInternal,
      maxWritten: es.maxWritten,
      internalMarks: mark?.internalMarks ?? 0,
      writtenMarks: mark?.writtenMarks ?? 0,
      isAbsent,
      obtained,
      maxTotal,
      grade: isAbsent ? "AB" : gradeForPercentage(maxTotal ? ((obtained ?? 0) / maxTotal) * 100 : 0),
    };
  });

  const totalObtained = subjects.reduce((sum, s) => sum + (s.obtained ?? 0), 0);
  const totalMax = subjects.reduce((sum, s) => sum + s.maxTotal, 0);
  const percentage = totalMax ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;

  const attendanceAgg = await Attendance.aggregate([
    { $match: { studentId: student._id, date: { $lte: exam.endDate }, status: { $ne: "excused" } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const totalMarked = attendanceAgg.reduce((s, a) => s + a.count, 0);
  const present = attendanceAgg.find((a) => a._id === "present")?.count ?? 0;
  const late = attendanceAgg.find((a) => a._id === "late")?.count ?? 0;
  const halfDay = attendanceAgg.find((a) => a._id === "half_day")?.count ?? 0;
  const attendancePercentage = totalMarked ? Math.round(((present + late + halfDay * 0.5) / totalMarked) * 1000) / 10 : null;

  const reportCard = await ReportCard.findOne({ examId, studentId });

  return {
    exam,
    student: {
      id: student._id,
      name: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      className: (student.classId as unknown as { name: string })?.name,
      sectionName: (student.sectionId as unknown as { name: string })?.name,
    },
    subjects,
    totals: { obtained: totalObtained, max: totalMax, percentage, grade: gradeForPercentage(percentage) },
    attendancePercentage,
    status: reportCard?.status ?? "draft",
    teacherRemarks: reportCard?.teacherRemarks ?? "",
    publishedAt: reportCard?.publishedAt,
  };
}

// FR-6.6: not visible to parent/student until Published. S-6.4: optionally
// withheld further while fees are outstanding, per branch policy.
export const getReportCard = asyncHandler(async (req: Request, res: Response) => {
  const { examId, studentId } = req.params;
  const report = await buildReportCard(examId, studentId);

  const isStaff = req.user && STAFF_ROLES.has(req.user.role);
  if (!isStaff) {
    await assertStudentAccess(req, studentId);
    if (report.status !== "published") {
      throw ApiError.forbidden("This report card has not been published yet");
    }
    const student = await Student.findById(studentId);
    const branch = student ? await Branch.findById(student.branchId) : null;
    if (branch?.policies?.holdReportCardForDues && student) {
      const summary = await computeStudentFeeSummary(
        studentId,
        student.branchId.toString(),
        student.classId.toString(),
        student.academicYearId.toString()
      );
      if (summary.totals.outstanding > 0) {
        throw ApiError.forbidden(
          `Report card is on hold — please clear the outstanding fee of Rs.${summary.totals.outstanding} to view it.`
        );
      }
    }
  }

  res.json({ success: true, data: report });
});

// Bulk view for Principal/Teacher before publishing a whole class.
export const listReportCardsForExam = asyncHandler(async (req: Request, res: Response) => {
  const exam = await Exam.findOne({ _id: req.params.examId, ...scopeFilter(req) });
  if (!exam) throw ApiError.notFound("Exam not found");
  const students = await Student.find({ classId: exam.classId, status: "active" });
  const reports = await Promise.all(students.map((s) => buildReportCard(exam._id.toString(), s._id.toString())));
  res.json({ success: true, data: reports });
});

const remarksSchema = z.object({ teacherRemarks: z.string().max(1000) });

export const updateRemarks = asyncHandler(async (req: Request, res: Response) => {
  const payload = remarksSchema.parse(req.body);
  const exam = await Exam.findOne({ _id: req.params.examId, ...scopeFilter(req) });
  if (!exam) throw ApiError.notFound("Exam not found");

  const reportCard = await ReportCard.findOneAndUpdate(
    { examId: exam._id, studentId: req.params.studentId },
    {
      tenantId: exam.tenantId,
      branchId: exam.branchId,
      academicYearId: exam.academicYearId,
      examId: exam._id,
      studentId: req.params.studentId,
      teacherRemarks: payload.teacherRemarks,
    },
    { upsert: true, new: true, runValidators: true }
  );
  res.json({ success: true, data: reportCard });
});

// FR-6.6: Principal-only publish gate.
export const publishReportCard = asyncHandler(async (req: Request, res: Response) => {
  const exam = await Exam.findOne({ _id: req.params.examId, ...scopeFilter(req) });
  if (!exam) throw ApiError.notFound("Exam not found");

  const reportCard = await ReportCard.findOneAndUpdate(
    { examId: exam._id, studentId: req.params.studentId },
    {
      tenantId: exam.tenantId,
      branchId: exam.branchId,
      academicYearId: exam.academicYearId,
      examId: exam._id,
      studentId: req.params.studentId,
      status: "published",
      publishedBy: req.user?.userId,
      publishedAt: new Date(),
    },
    { upsert: true, new: true, runValidators: true }
  );
  res.json({ success: true, data: reportCard });
});

export const publishAllForExam = asyncHandler(async (req: Request, res: Response) => {
  const exam = await Exam.findOne({ _id: req.params.examId, ...scopeFilter(req) });
  if (!exam) throw ApiError.notFound("Exam not found");
  const students = await Student.find({ classId: exam.classId, status: "active" });

  const results = [];
  for (const s of students) {
    const rc = await ReportCard.findOneAndUpdate(
      { examId: exam._id, studentId: s._id },
      {
        tenantId: exam.tenantId,
        branchId: exam.branchId,
        academicYearId: exam.academicYearId,
        examId: exam._id,
        studentId: s._id,
        status: "published",
        publishedBy: req.user?.userId,
        publishedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    );
    results.push(rc);
  }
  res.json({ success: true, data: results });
});
