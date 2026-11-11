import { TeacherMediumService } from "../services/teacherMedium.service";
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendFile, sendOk } from "../../../utils/response";
import { readSheet } from "../../students/services/sheetReader";
import { MAX_TEACHER_IMPORT_ROWS, STAFF_WRITERS } from "../constants";
import type { ChangeUsernameInput, CreateStaffMemberInput, CreateTeacherInput, ImportTeachersInput, ListStaffMembersQuery, UpdateStaffMemberInput, UpdateTeacherSettingsInput, ListTeachersQuery, LoginAccountInput, ResetPasswordInput, SetClassTeacherInput, UpdateTeacherInput, UsernameCheckQuery } from "../schemas/staff.schemas";
import { ClassTeacherService } from "../services/classTeacher.service";
import { StaffMemberService } from "../services/staffMember.service";
import { TeacherExportService } from "../services/teacherExport.service";
import { TeacherImportService } from "../services/teacherImport.service";
import { TeacherService } from "../services/teacher.service";
import { TeacherSettingsService } from "../services/teacherSettings.service";
import { TeacherSheetService } from "../services/teacherSheet.service";
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

export const listTeacherMediums = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherMediumService.list(tenantOf(req), idOf(req)));
});

export const addTeacherToMedium = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await TeacherMediumService.add(tenantOf(req), idOf(req), body<{ mediumId: string }>(req).mediumId), "Added");
});

export const createTeacherLogin = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await TeacherService.createLogin(tenantOf(req), idOf(req), body<LoginAccountInput>(req)), "Login made");
});

export const resetTeacherPassword = asyncHandler(async (req: Request, res: Response) => {
  await TeacherService.resetPassword(tenantOf(req), idOf(req), body<ResetPasswordInput>(req).password);
  return sendOk(res, {}, "Password changed");
});

/** The sample spreadsheet for a bulk upload of teachers, made for this school (its subjects listed). */
export const teachersTemplate = asyncHandler(async (req: Request, res: Response) => {
  return sendFile(res, await TeacherSheetService.template(tenantOf(req)));
});

/** An uploaded teachers file read into column titles and rows of text, for the screen to match the columns. Nothing is saved. */
export const readTeachersFile = asyncHandler(async (req: Request, res: Response) => {
  tenantOf(req);
  if (!req.file) {
    throw ApiError.badRequest("Choose a file to upload.", "IMPORT_FILE_MISSING", [{ path: "file", message: "Choose a file to upload" }]);
  }
  return sendOk(res, await readSheet(req.file.originalname, req.file.buffer, { noun: "teachers", titleExamples: "Name, Mobile, Gender", maxRows: MAX_TEACHER_IMPORT_ROWS }));
});

/** A part of a bulk upload: each row is made as a teacher with a login, or refused with its reasons. */
export const importTeachers = asyncHandler(async (req: Request, res: Response) => {
  const result = await TeacherImportService.run(tenantOf(req), body<ImportTeachersInput>(req));
  return sendOk(res, result, result.ok === 1 ? "1 teacher added" : `${result.ok} teachers added`);
});

/** The teachers the list shows (its tab, search and filters) as an Excel file; for the people who run the school only. */
export const exportTeachers = asyncHandler(async (req: Request, res: Response) => {
  return sendFile(res, await TeacherExportService.export(tenantOf(req), req.validatedQuery as ListTeachersQuery));
});

/** The school's own fields for its teachers. */
export const getTeacherSettings = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherSettingsService.get(tenantOf(req)));
});

export const updateTeacherSettings = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherSettingsService.update(tenantOf(req), req.user?.userId ?? null, body<UpdateTeacherSettingsInput>(req)), "Fields saved");
});

// ---- Staff members: the people who work for the school without teaching -------------------------------------------------------------

/** 404 before 400: the staff member must be this school's before its body is read. */
export const staffMemberExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await StaffMemberService.exists(tenantOf(req), idOf(req)))) throw ApiError.notFound("Staff member not found", "STAFF_NOT_FOUND");
  next();
});

export const listStaffMembers = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StaffMemberService.list(tenantOf(req), req.validatedQuery as ListStaffMembersQuery));
});

export const getStaffMember = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StaffMemberService.get(tenantOf(req), idOf(req)));
});

export const createStaffMember = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await StaffMemberService.create(tenantOf(req), body<CreateStaffMemberInput>(req), req.user?.userId ?? null), "Staff member added");
});

export const updateStaffMember = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StaffMemberService.update(tenantOf(req), idOf(req), body<UpdateStaffMemberInput>(req)), "Staff member saved");
});

/** A login for a person added before the school made logins itself. */
export const makeStaffLogin = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await StaffMemberService.makeLogin(tenantOf(req), idOf(req), body<LoginAccountInput>(req)), "Login made");
});

export const resetStaffPassword = asyncHandler(async (req: Request, res: Response) => {
  await StaffMemberService.resetPassword(tenantOf(req), idOf(req), body<ResetPasswordInput>(req).password);
  return sendOk(res, {}, "Password changed");
});

export const changeStaffUsername = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StaffMemberService.changeUsername(tenantOf(req), idOf(req), body<ChangeUsernameInput>(req).username), "Username changed");
});

/** Takes away a person who has no login. */
export const removeStaffMember = asyncHandler(async (req: Request, res: Response) => {
  await StaffMemberService.remove(tenantOf(req), idOf(req));
  return sendOk(res, {}, "Staff member removed");
});
