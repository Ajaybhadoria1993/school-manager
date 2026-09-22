import { Request, Response } from "express";
import { z } from "zod";
import { Exam, ExamSubject, Mark } from "../models/Exam";
import { Student } from "../models/Student";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

// ---- Exams ----
const examSchema = z.object({
  academicYearId: z.string(),
  classId: z.string(),
  name: z.string().min(1),
  examType: z.enum(["unit_test", "mid_term", "final", "other"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const createExam = asyncHandler(async (req: Request, res: Response) => {
  const payload = examSchema.parse(req.body);
  const tenantId = req.user?.tenantId;
  const branchId = req.user?.branchId;
  const exam = await Exam.create({ ...payload, tenantId, branchId });
  res.status(201).json({ success: true, data: exam });
});

export const listExams = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.academicYearId) filter.academicYearId = req.query.academicYearId;
  const exams = await Exam.find(filter).populate("classId", "name").sort({ startDate: -1 });
  res.json({ success: true, data: exams });
});

// ---- Exam Subjects (papers) ----
const examSubjectSchema = z.object({
  subjectId: z.string(),
  examDate: z.coerce.date().optional(),
  maxInternal: z.number().min(0).default(0),
  maxWritten: z.number().min(1),
});

export const addExamSubject = asyncHandler(async (req: Request, res: Response) => {
  const payload = examSubjectSchema.parse(req.body);
  const exam = await Exam.findOne({ _id: req.params.examId, ...scopeFilter(req) });
  if (!exam) throw ApiError.notFound("Exam not found");

  const examSubject = await ExamSubject.findOneAndUpdate(
    { examId: exam._id, subjectId: payload.subjectId },
    { ...payload, tenantId: exam.tenantId, branchId: exam.branchId, examId: exam._id },
    { new: true, upsert: true, runValidators: true }
  );
  res.status(201).json({ success: true, data: examSubject });
});

export const listExamSubjects = asyncHandler(async (req: Request, res: Response) => {
  const subjects = await ExamSubject.find({ examId: req.params.examId, ...scopeFilter(req) }).populate(
    "subjectId",
    "name"
  );
  res.json({ success: true, data: subjects });
});

// ---- Marks entry ----
export const getMarksSheet = asyncHandler(async (req: Request, res: Response) => {
  const { sectionId } = req.query;
  if (!sectionId) throw ApiError.badRequest("sectionId is required");

  const examSubject = await ExamSubject.findOne({ _id: req.params.examSubjectId, ...scopeFilter(req) }).populate(
    "subjectId",
    "name"
  );
  if (!examSubject) throw ApiError.notFound("Exam subject not found");

  const [students, marks] = await Promise.all([
    Student.find({ sectionId, status: "active" }).sort({ rollNumber: 1, firstName: 1 }),
    Mark.find({ examSubjectId: examSubject._id }),
  ]);

  const marksByStudent = new Map(marks.map((m) => [m.studentId.toString(), m]));

  res.json({
    success: true,
    data: {
      examSubject,
      rows: students.map((s) => {
        const mark = marksByStudent.get(s._id.toString());
        return {
          studentId: s._id,
          name: `${s.firstName} ${s.lastName}`,
          rollNumber: s.rollNumber,
          internalMarks: mark?.internalMarks ?? 0,
          writtenMarks: mark?.writtenMarks ?? 0,
          isAbsent: mark?.isAbsent ?? false,
        };
      }),
    },
  });
});

const bulkMarksSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.string(),
        internalMarks: z.number().min(0).default(0),
        writtenMarks: z.number().min(0).default(0),
        isAbsent: z.boolean().default(false),
      })
    )
    .min(1),
});

// FR-6.4: total is auto-computed on read from internal+written; entry is
// blocked once the paper is locked (submitted), matching the acceptance
// criteria that marks lock after submission unless a Principal reopens them.
export const saveMarks = asyncHandler(async (req: Request, res: Response) => {
  const examSubject = await ExamSubject.findOne({ _id: req.params.examSubjectId, ...scopeFilter(req) });
  if (!examSubject) throw ApiError.notFound("Exam subject not found");
  if (examSubject.isLocked) throw ApiError.badRequest("Marks are locked for this subject. Ask a Principal to reopen them.");

  const payload = bulkMarksSchema.parse(req.body);
  const results = [];
  for (const entry of payload.entries) {
    if (entry.writtenMarks > examSubject.maxWritten || entry.internalMarks > examSubject.maxInternal) {
      throw ApiError.badRequest(`Marks for a student exceed the maximum (Internal ${examSubject.maxInternal}, Written ${examSubject.maxWritten})`);
    }
    const mark = await Mark.findOneAndUpdate(
      { examSubjectId: examSubject._id, studentId: entry.studentId },
      {
        tenantId: examSubject.tenantId,
        branchId: examSubject.branchId,
        examSubjectId: examSubject._id,
        studentId: entry.studentId,
        internalMarks: entry.isAbsent ? 0 : entry.internalMarks,
        writtenMarks: entry.isAbsent ? 0 : entry.writtenMarks,
        isAbsent: entry.isAbsent,
        enteredBy: req.user?.userId,
      },
      { upsert: true, new: true, runValidators: true }
    );
    results.push(mark);
  }

  res.status(201).json({ success: true, data: results });
});

export const submitMarks = asyncHandler(async (req: Request, res: Response) => {
  const examSubject = await ExamSubject.findOne({ _id: req.params.examSubjectId, ...scopeFilter(req) });
  if (!examSubject) throw ApiError.notFound("Exam subject not found");
  examSubject.isLocked = true;
  examSubject.lockedAt = new Date();
  await examSubject.save();
  res.json({ success: true, data: examSubject });
});

export const reopenMarks = asyncHandler(async (req: Request, res: Response) => {
  const examSubject = await ExamSubject.findOne({ _id: req.params.examSubjectId, ...scopeFilter(req) });
  if (!examSubject) throw ApiError.notFound("Exam subject not found");
  examSubject.isLocked = false;
  examSubject.lockedAt = undefined;
  await examSubject.save();
  res.json({ success: true, data: examSubject });
});
