import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type { Caller } from "../../classroom/services/leave.service";
import type { AddPapersInput, ClassExamsQuery, CreateExamInput, ListExamsQuery, MarksSheetQuery, SaveExamMarksInput, UpdateExamInput, UpdatePaperInput } from "../schemas/exams.schemas";
import { ExamService } from "../services/exam.service";
import { MarksService } from "../services/marks.service";
import { PaperService } from "../services/paper.service";
import { ClassExamsService } from "../services/view.service";

function tenantOf(req: Request): string {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
}
/** Who is doing it: they are not told of it themselves. */
const actorOf = (req: Request): string => req.user!.userId;
const body = <T>(req: Request) => req.validatedBody as T;
const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
const paperIdOf = (req: Request) => (req.validatedParams as { paperId: string }).paperId;

/** 404 before 400: an exam that is not the caller's school's is said so before its body is looked at. */
export const examExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  await ExamService.find(tenantOf(req), idOf(req));
  next();
});

export const listExams = asyncHandler(async (req: Request, res: Response) => sendOk(res, await ExamService.list(tenantOf(req), req.validatedQuery as ListExamsQuery)));
export const getExam = asyncHandler(async (req: Request, res: Response) => sendOk(res, await ExamService.get(tenantOf(req), idOf(req))));
export const createExam = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await ExamService.create(tenantOf(req), body<CreateExamInput>(req), actorOf(req)), "Exam scheduled"));
export const updateExam = asyncHandler(async (req: Request, res: Response) => sendOk(res, await ExamService.update(tenantOf(req), idOf(req), body<UpdateExamInput>(req), actorOf(req)), "Saved"));
export const deleteExam = asyncHandler(async (req: Request, res: Response) => {
  await ExamService.remove(tenantOf(req), idOf(req), actorOf(req));
  return sendOk(res, { id: idOf(req) }, "Exam taken away");
});

export const addPapers = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await PaperService.add(tenantOf(req), idOf(req), body<AddPapersInput>(req), actorOf(req)), "Timetable added"));
export const updatePaper = asyncHandler(async (req: Request, res: Response) => sendOk(res, await PaperService.update(tenantOf(req), idOf(req), paperIdOf(req), body<UpdatePaperInput>(req), actorOf(req)), "Saved"));
export const deletePaper = asyncHandler(async (req: Request, res: Response) => {
  await PaperService.remove(tenantOf(req), idOf(req), paperIdOf(req), actorOf(req));
  return sendOk(res, { id: paperIdOf(req) }, "Paper taken away");
});

// ---- A class, its marks, and a child (2026-11-06) --------------------------------------------------------------------------------------
const callerOf = (req: Request): Caller => {
  if (!req.user) throw ApiError.unauthorized("Please sign in", "UNAUTHORIZED");
  return { userId: req.user.userId, role: req.user.role };
};
const marksPaperIdOf = (req: Request) => (req.validatedParams as { paperId: string }).paperId;

export const getClassExams = asyncHandler(async (req: Request, res: Response) => sendOk(res, await ClassExamsService.get(tenantOf(req), callerOf(req), req.validatedQuery as ClassExamsQuery)));
export const getMarksSheet = asyncHandler(async (req: Request, res: Response) => sendOk(res, await MarksService.sheet(tenantOf(req), callerOf(req), marksPaperIdOf(req), req.validatedQuery as MarksSheetQuery)));
export const saveMarks = asyncHandler(async (req: Request, res: Response) => sendOk(res, await MarksService.save(tenantOf(req), callerOf(req), marksPaperIdOf(req), body<SaveExamMarksInput>(req)), "Marks saved"));
