import { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type {
  AddTestInput,
  AttendanceQuery,
  CalendarQuery,
  CreateEventInput,
  DecideLeaveInput,
  LeaveQuery,
  SaveAttendanceInput,
  SaveDiaryInput,
  SaveMarksInput,
  UnitDayQuery,
  UnitQuery,
  UpdateEventInput,
} from "../schemas/classroom.schemas";
import { WorkService } from "../services/work.service";
import { myClasses, teacherOfUser } from "../services/access";
import { AttendanceService } from "../services/attendance.service";
import { CalendarService } from "../services/calendar.service";
import { LeaveService, type Caller } from "../services/leave.service";

export function tenantOf(req: Request): string {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
}
export const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
export const body = <T>(req: Request) => req.validatedBody as T;

// ---- Calendar ------------------------------------------------------------------------------------------------------------------------
export const listCalendar = asyncHandler(async (req: Request, res: Response) => sendOk(res, await CalendarService.list(tenantOf(req), req.validatedQuery as CalendarQuery)));
export const createEvent = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await CalendarService.create(tenantOf(req), body<CreateEventInput>(req)), "Added to the calendar"));
export const updateEvent = asyncHandler(async (req: Request, res: Response) => sendOk(res, await CalendarService.update(tenantOf(req), idOf(req), body<UpdateEventInput>(req)), "Saved"));
export const deleteEvent = asyncHandler(async (req: Request, res: Response) => {
  await CalendarService.remove(tenantOf(req), idOf(req));
  return sendOk(res, { id: idOf(req) }, "Taken off the calendar");
});

/** Who is asking (their login and role), for the reads and answers that depend on it. */
export const callerOf = (req: Request): Caller => ({ userId: req.user!.userId, role: req.user!.role });

// ---- Leave (the school's side) --------------------------------------------------------------------------------------------------------
export const listLeaves = asyncHandler(async (req: Request, res: Response) => sendOk(res, await LeaveService.inbox(tenantOf(req), callerOf(req), req.validatedQuery as LeaveQuery)));
// ---- A teacher's own classes ---------------------------------------------------------------------------------------------------------
export const listMyClasses = asyncHandler(async (req: Request, res: Response) => {
  const teacher = await teacherOfUser(tenantOf(req), req.user!.userId);
  return sendOk(res, { items: teacher ? await myClasses(tenantOf(req), teacher._id) : [] });
});

// ---- Attendance ----------------------------------------------------------------------------------------------------------------------
export const attendanceSheet = asyncHandler(async (req: Request, res: Response) => sendOk(res, await AttendanceService.sheet(tenantOf(req), callerOf(req), req.validatedQuery as AttendanceQuery)));
export const saveAttendance = asyncHandler(async (req: Request, res: Response) => {
  const day = await AttendanceService.save(tenantOf(req), callerOf(req), body<SaveAttendanceInput>(req));
  return sendOk(res, day, "Attendance saved");
});

export const decideLeave = asyncHandler(async (req: Request, res: Response) => {
  const answered = await LeaveService.decide(tenantOf(req), callerOf(req), idOf(req), body<DecideLeaveInput>(req));
  return sendOk(res, answered, answered.status === "approved" ? "Leave approved" : "Leave declined");
});

// ---- Diary ---------------------------------------------------------------------------------------------------------------------------
export const diaryDay = asyncHandler(async (req: Request, res: Response) => sendOk(res, await WorkService.diaryDay(tenantOf(req), callerOf(req), req.validatedQuery as UnitDayQuery)));
export const saveDiary = asyncHandler(async (req: Request, res: Response) => sendOk(res, await WorkService.saveDiary(tenantOf(req), callerOf(req), body<SaveDiaryInput>(req)), "Diary saved"));

// ---- Tests and marks -----------------------------------------------------------------------------------------------------------------
export const listTests = asyncHandler(async (req: Request, res: Response) => sendOk(res, await WorkService.tests(tenantOf(req), callerOf(req), req.validatedQuery as UnitQuery)));
export const addTest = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await WorkService.addTest(tenantOf(req), callerOf(req), body<AddTestInput>(req)), "Test added"));
export const getTest = asyncHandler(async (req: Request, res: Response) => sendOk(res, await WorkService.test(tenantOf(req), callerOf(req), idOf(req))));
export const saveMarks = asyncHandler(async (req: Request, res: Response) => sendOk(res, await WorkService.saveMarks(tenantOf(req), callerOf(req), idOf(req), body<SaveMarksInput>(req)), "Marks saved"));
export const removeTest = asyncHandler(async (req: Request, res: Response) => {
  await WorkService.removeTest(tenantOf(req), callerOf(req), idOf(req));
  return sendOk(res, { id: idOf(req) }, "Test taken away");
});
