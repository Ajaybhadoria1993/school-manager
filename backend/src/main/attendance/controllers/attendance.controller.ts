import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import { Types } from "mongoose";
import { Teacher } from "../../staff/models/Teacher";
import type { ApplyStaffLeaveInput, DayQuery, DecideStaffLeaveInput, MonthQuery, MyDayQuery, SetTeacherDayInput, StaffLeaveQuery, StaffSheetQuery, StudentsQuery, TeacherSheetQuery } from "../schemas/attendance.schemas";
import { StaffLeaveService } from "../services/staffLeave.service";
import { StaffAttendanceService } from "../services/staff.service";
import { StudentAttendanceService } from "../services/student.service";
import { StudentDayService } from "../services/studentDay.service";
import { TeacherAttendanceService } from "../services/teacher.service";

function who(req: Request): { tenantId: string; userId: string } {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return { tenantId: req.user.tenantId, userId: req.user.userId };
}

export const getStudentsAttendance = asyncHandler(async (req: Request, res: Response) => sendOk(res, await StudentAttendanceService.range(who(req).tenantId, req.validatedQuery as StudentsQuery)));
export const getTeachersAttendance = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TeacherAttendanceService.sheet(who(req).tenantId, req.validatedQuery as TeacherSheetQuery)));
export const getMyDay = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await TeacherAttendanceService.myDay(tenantId, userId, req.validatedQuery as MyDayQuery));
});
/** 201 when this tap made the mark, 200 when it was already there. */
export const markMePresent = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  const day = await TeacherAttendanceService.checkIn(tenantId, userId);
  return day.alreadyMarked ? sendOk(res, day, "You are already marked present") : sendCreated(res, day, "You are marked present");
});

/** The day of every class (or of the class picked), with the search. */
export const getStudentsDay = asyncHandler(async (req: Request, res: Response) => sendOk(res, await StudentDayService.day(who(req).tenantId, req.validatedQuery as DayQuery)));
export const getStudentsToday = asyncHandler(async (req: Request, res: Response) => sendOk(res, await StudentAttendanceService.today(who(req).tenantId)));
export const getMyMonth = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await TeacherAttendanceService.myMonth(tenantId, userId, req.validatedQuery as MonthQuery));
});

/** 404 before 400: a teacher who is not this school's is said so before the body is looked at. */
export const teacherExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const { teacherId } = req.validatedParams as { teacherId: string };
  if (!(await Teacher.exists({ _id: new Types.ObjectId(teacherId), tenantId: new Types.ObjectId(who(req).tenantId) }))) throw ApiError.notFound("Teacher not found", "TEACHER_NOT_FOUND");
  next();
});
// ---- The staff's attendance (2026-11-22) -------------------------------------------------------------------------------------------------
export const getStaffAttendance = asyncHandler(async (req: Request, res: Response) => sendOk(res, await StaffAttendanceService.sheet(who(req).tenantId, req.validatedQuery as StaffSheetQuery)));
export const getMyStaffDay = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await StaffAttendanceService.myDay(tenantId, userId, req.validatedQuery as MyDayQuery));
});
/** 201 when this tap made the mark, 200 when it was already there. */
export const markStaffPresent = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  const day = await StaffAttendanceService.checkIn(tenantId, userId);
  return day.alreadyMarked ? sendOk(res, day, "You are already marked present") : sendCreated(res, day, "You are marked present");
});
export const getMyStaffMonth = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await StaffAttendanceService.myMonth(tenantId, userId, req.validatedQuery as MonthQuery));
});
export const setTeacherDay = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  const { teacherId } = req.validatedParams as { teacherId: string };
  return sendOk(res, await TeacherAttendanceService.setDay(tenantId, { userId, role: req.user!.role }, teacherId, req.validatedBody as SetTeacherDayInput), "Attendance saved");
});

// ---- Leave of the teachers and the staff (2026-11-24) ---------------------------------------------------------------------------------------

const caller = (req: Request) => ({ ...who(req), role: req.user!.role });

export const getMyLeaves = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  return sendOk(res, await StaffLeaveService.mine(c.tenantId, c));
});
export const applyMyLeave = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  return sendCreated(res, await StaffLeaveService.apply(c.tenantId, c, req.validatedBody as ApplyStaffLeaveInput), "Leave sent to the school");
});
export const cancelMyLeave = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  return sendOk(res, await StaffLeaveService.cancelMine(c.tenantId, c, (req.validatedParams as { id: string }).id), "Leave taken back");
});
export const listStaffLeaves = asyncHandler(async (req: Request, res: Response) => sendOk(res, await StaffLeaveService.list(who(req).tenantId, req.validatedQuery as StaffLeaveQuery)));
/** 404 before 400: the leave must be this school's before its answer is looked at. */
export const leaveExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await StaffLeaveService.exists(who(req).tenantId, (req.validatedParams as { id: string }).id))) throw ApiError.notFound("Leave not found", "LEAVE_NOT_FOUND");
  next();
});
export const decideStaffLeave = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const done = await StaffLeaveService.decide(c.tenantId, c, (req.validatedParams as { id: string }).id, req.validatedBody as DecideStaffLeaveInput);
  return sendOk(res, done, done.status === "approved" ? "Leave approved" : "Leave declined");
});
