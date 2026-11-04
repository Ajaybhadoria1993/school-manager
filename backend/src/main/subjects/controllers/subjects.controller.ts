import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type { AssignTeacherInput, CreateSubjectInput, ListSubjectsQuery, QuickAddInput, SaveAllotmentsInput, UnitQuery, UpdateSubjectInput } from "../schemas/subjects.schemas";
import { AllotmentService } from "../services/allotment.service";
import { SubjectService } from "../services/subject.service";

/** The caller's own school, taken from the signed-in user, never from the request. */
export function tenantOf(req: Request): string {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
}

const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
const body = <T>(req: Request) => req.validatedBody as T;

/** 404 before 400: the subject must be this school's before its body is read. */
export const subjectExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await SubjectService.exists(tenantOf(req), idOf(req)))) throw ApiError.notFound("Subject not found", "SUBJECT_NOT_FOUND");
  next();
});

export const listSubjects = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await SubjectService.list(tenantOf(req), req.validatedQuery as ListSubjectsQuery));
});

export const createSubject = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await SubjectService.create(tenantOf(req), body<CreateSubjectInput>(req)), "Subject added");
});

export const quickAddSubjects = asyncHandler(async (req: Request, res: Response) => {
  const result = await SubjectService.quickAdd(tenantOf(req), body<QuickAddInput>(req).names);
  return sendCreated(res, result, "Subjects added");
});

export const getAllotments = asyncHandler(async (req: Request, res: Response) => {
  const { classId, sectionId } = req.validatedQuery as UnitQuery;
  return sendOk(res, await AllotmentService.get(tenantOf(req), classId, sectionId === "none" ? null : sectionId));
});

export const saveAllotments = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await AllotmentService.save(tenantOf(req), body<SaveAllotmentsInput>(req)), "Subjects saved");
});

export const updateSubject = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await SubjectService.update(tenantOf(req), idOf(req), body<UpdateSubjectInput>(req)), "Subject saved");
});

/** The teacher of one subject of one unit (a teacher's page, a class's page). */
export const assignAllotmentTeacher = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await AllotmentService.assignTeacher(tenantOf(req), req.validatedBody as AssignTeacherInput), "Teacher saved");
});
