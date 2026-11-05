import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import { STAFF_WRITERS } from "../constants";
import type { ChangeUsernameInput, CreateTeacherInput, ListTeachersQuery, LoginAccountInput, ResetPasswordInput, SetClassTeacherInput, UpdateTeacherInput, UsernameCheckQuery } from "../schemas/staff.schemas";
import { ClassTeacherService } from "../services/classTeacher.service";
import { TeacherService } from "../services/teacher.service";
import { checkUsername } from "../services/usernames.service";

/** The caller's own school, taken from the signed-in user, never from the request. */
function tenantOf(req: Request): string {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
}

const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
const body = <T>(req: Request) => req.validatedBody as T;

/** 404 before 400: the teacher must be this school's before its body is read. */
export const teacherExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await TeacherService.exists(tenantOf(req), idOf(req)))) throw ApiError.notFound("Teacher not found", "TEACHER_NOT_FOUND");
  next();
});

export const listTeachers = asyncHandler(async (req: Request, res: Response) => {
  // A teacher looking at the list sees their colleagues' names and what they take, not their birthdays or logins.
  const colleague = !(STAFF_WRITERS as readonly string[]).includes(req.user?.role ?? "");
  return sendOk(res, await TeacherService.list(tenantOf(req), req.validatedQuery as ListTeachersQuery, colleague));
});

export const getTeacherSummary = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherService.summary(tenantOf(req)));
});

export const getMyTeacher = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized("Authentication required");
  return sendOk(res, await TeacherService.mine(tenantOf(req), req.user.userId));
});

export const getTeacher = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherService.get(tenantOf(req), idOf(req)));
});

export const createTeacher = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await TeacherService.create(tenantOf(req), body<CreateTeacherInput>(req)), "Teacher added");
});

export const updateTeacher = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherService.update(tenantOf(req), idOf(req), body<UpdateTeacherInput>(req)), "Teacher saved");
});

export const getTeacherClasses = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherService.classes(tenantOf(req), idOf(req)));
});

export const changeTeacherUsername = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherService.changeUsername(tenantOf(req), idOf(req), body<ChangeUsernameInput>(req).username), "Username changed");
});

export const setClassTeacher = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ClassTeacherService.set(tenantOf(req), body<SetClassTeacherInput>(req), req.user!.userId), "Class teacher saved");
});

export const checkUsernameFree = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await checkUsername((req.validatedQuery as UsernameCheckQuery).username));
});

export const createTeacherLogin = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await TeacherService.createLogin(tenantOf(req), idOf(req), body<LoginAccountInput>(req)), "Login made");
});

export const resetTeacherPassword = asyncHandler(async (req: Request, res: Response) => {
  await TeacherService.resetPassword(tenantOf(req), idOf(req), body<ResetPasswordInput>(req).password);
  return sendOk(res, {}, "Password changed");
});
