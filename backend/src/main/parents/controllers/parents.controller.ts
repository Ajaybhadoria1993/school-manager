import { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type { ApplyLeaveInput, ChildAttendanceQuery } from "../../classroom/schemas/classroom.schemas";
import { AttendanceService } from "../../classroom/services/attendance.service";
import { LeaveService } from "../../classroom/services/leave.service";
import { WorkService } from "../../classroom/services/work.service";
import type { ChildExamsQuery } from "../../exams/schemas/exams.schemas";
import { ChildExamsService } from "../../exams/services/view.service";
import { ParentService } from "../services/parent.service";

function who(req: Request): { tenantId: string; userId: string } {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return { tenantId: req.user.tenantId, userId: req.user.userId };
}
const idOf = (req: Request) => String(req.params.id);

export const listChildren = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await ParentService.children(tenantId, userId));
});

export const getChild = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await ParentService.child(tenantId, userId, idOf(req)));
});

export const getChildTimetable = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await ParentService.timetable(tenantId, userId, idOf(req)));
});

// ---- Leave ---------------------------------------------------------------------------------------------------------------------------
export const listChildLeaves = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await LeaveService.ofChild(tenantId, userId, idOf(req)));
});

export const applyLeave = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendCreated(res, await LeaveService.apply(tenantId, userId, idOf(req), req.validatedBody as ApplyLeaveInput), "Leave sent");
});

export const cancelLeave = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  const { id, leaveId } = req.validatedParams as { id: string; leaveId: string };
  return sendOk(res, await LeaveService.cancel(tenantId, userId, id, leaveId), "Leave taken back");
});

// ---- Attendance ----------------------------------------------------------------------------------------------------------------------
export const getChildAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await AttendanceService.ofChild(tenantId, userId, idOf(req), req.validatedQuery as ChildAttendanceQuery));
});

// ---- Diary and tests -----------------------------------------------------------------------------------------------------------------
export const getChildDiary = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await WorkService.childDiary(tenantId, userId, idOf(req), (req.validatedQuery as { date?: string }).date));
});

export const getChildTests = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await WorkService.childTests(tenantId, userId, idOf(req)));
});

// ---- Exams (2026-11-06) ---------------------------------------------------------------------------------------------------------------
export const getChildExams = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = who(req);
  return sendOk(res, await ChildExamsService.get(tenantId, userId, idOf(req), req.validatedQuery as ChildExamsQuery));
});
