import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import { Types } from "mongoose";
import { Teacher } from "../../staff/models/Teacher";
import type { MonthQuery, MyDayQuery, RangeQuery, SetTeacherDayInput, StudentsQuery } from "../schemas/attendance.schemas";
import { StudentAttendanceService } from "../services/student.service";
import { TeacherAttendanceService } from "../services/teacher.service";

function who(req: Request): { tenantId: string; userId: string } {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return { tenantId: req.user.tenantId, userId: req.user.userId };
}

export const getStudentsAttendance = asyncHandler(async (req: Request, res: Response) => sendOk(res, await StudentAttendanceService.range(who(req).tenantId, req.validatedQuery as StudentsQuery)));
export const getTeachersAttendance = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TeacherAttendanceService.sheet(who(req).tenantId, req.validatedQuery as RangeQuery)));
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
export const setTeacherDay = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  const { teacherId } = req.validatedParams as { teacherId: string };
  return sendOk(res, await TeacherAttendanceService.setDay(tenantId, { userId, role: req.user!.role }, teacherId, req.validatedBody as SetTeacherDayInput), "Attendance saved");
});
