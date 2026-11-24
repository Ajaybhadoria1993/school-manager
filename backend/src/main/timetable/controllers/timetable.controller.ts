import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type { UnitQuery } from "../../subjects/schemas/subjects.schemas";
import type { ArrangementInput, ArrangementQuery, AttendanceCoverInput, HandBackInput, AutofillBody, ClassDayInput, CopyBody, CreateScheduleInput, OverviewQuery, ReplaceTeacherBody, SaveGridInput, SchoolDayInput, SpecialDayInput, TeacherPeriodsInput, UnitBody, UpdateScheduleInput } from "../schemas/timetable.schemas";
import { ArrangementService } from "../services/arrangement.service";
import { GridService } from "../services/grid.service";
import { OverviewService } from "../services/overview.service";
import { ScheduleService } from "../services/schedule.service";
import { SpecialDayService } from "../services/specialDay.service";
import { TeacherPeriodsService } from "../services/teacherPeriods.service";
import { TeacherTimetableService } from "../services/teacherView.service";
import { ToolsService } from "../services/tools.service";

/** The caller's own school, taken from the signed-in user, never from the request. */
export function tenantOf(req: Request): string {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
}

export const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
export const body = <T>(req: Request) => req.validatedBody as T;

/** 404 before 400: the timing must be this school's before its body is read. */
export const scheduleExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await ScheduleService.exists(tenantOf(req), idOf(req)))) throw ApiError.notFound("Timing not found", "SCHEDULE_NOT_FOUND");
  next();
});

export const listSchedules = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ScheduleService.list(tenantOf(req)));
});

export const createSchedule = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await ScheduleService.create(tenantOf(req), body<CreateScheduleInput>(req)), "Timing saved");
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ScheduleService.update(tenantOf(req), idOf(req), body<UpdateScheduleInput>(req)), "Timing saved");
});

export const getGrid = asyncHandler(async (req: Request, res: Response) => {
  const { classId, sectionId } = req.validatedQuery as UnitQuery;
  return sendOk(res, await GridService.get(tenantOf(req), req.user!.role, classId, sectionId === "none" ? null : sectionId));
});

export const saveGrid = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await GridService.save(tenantOf(req), req.user!.userId, body<SaveGridInput>(req)), "Timetable saved");
});

/** A teacher is given a subject of a class and its days and periods, in one request (a teacher's page, Assign class). */
export const placeTeacherPeriods = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherPeriodsService.assign(tenantOf(req), req.user!.userId, body<TeacherPeriodsInput>(req)), "Teacher saved");
});

export const publishGrid = asyncHandler(async (req: Request, res: Response) => {
  const { classId, sectionId } = body<UnitBody>(req);
  return sendOk(res, await GridService.publish(tenantOf(req), req.user!.userId, classId, sectionId), "Timetable published");
});

export const unpublishGrid = asyncHandler(async (req: Request, res: Response) => {
  const { classId, sectionId } = body<UnitBody>(req);
  return sendOk(res, await GridService.unpublish(tenantOf(req), classId, sectionId), "Timetable taken back to a draft");
});

export const autofillGrid = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ToolsService.autofill(tenantOf(req), body<AutofillBody>(req)));
});

export const copyGrid = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ToolsService.copy(tenantOf(req), req.user!.userId, body<CopyBody>(req)), "Timetable copied");
});

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await OverviewService.get(tenantOf(req), req.validatedQuery as OverviewQuery));
});

export const listPublished = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await OverviewService.published(tenantOf(req)));
});

export const getTeacherWeek = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await TeacherTimetableService.get(tenantOf(req), req.user!.role, idOf(req)));
});

export const replaceTeacher = asyncHandler(async (req: Request, res: Response) => {
  const result = await TeacherTimetableService.replace(tenantOf(req), idOf(req), body<ReplaceTeacherBody>(req));
  return sendOk(res, result, "The classes were given to the other teacher");
});

/** The school's whole week in one save (see ScheduleService.replaceSchoolDay); answers with every timing as it is now. */
export const saveSchoolDay = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ScheduleService.replaceSchoolDay(tenantOf(req), body<SchoolDayInput>(req)), "Timings saved");
});

/** A class's own days in one save (see ScheduleService.replaceClassDay); answers with every timing as it is now. */
export const saveClassDay = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ScheduleService.replaceClassDay(tenantOf(req), body<ClassDayInput>(req)), "The class's periods are saved");
});

/** A department follows the school's timing again (its own timings go). */
export const removeDepartmentDay = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ScheduleService.removeDepartmentDay(tenantOf(req), idOf(req)), "The department follows the school's timing again");
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
  await ScheduleService.remove(tenantOf(req), idOf(req));
  return sendOk(res, { id: idOf(req) }, "Timing deleted");
});

// ---- Special days and the day's arrangement (2026-11-22) ------------------------------------------------------------------------------------

/** 404 before 400: the special day must be this school's before its body is read. */
export const specialDayExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await SpecialDayService.exists(tenantOf(req), idOf(req)))) throw ApiError.notFound("Special day not found", "SPECIAL_DAY_NOT_FOUND");
  next();
});

export const listSpecialDays = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await SpecialDayService.list(tenantOf(req)));
});

export const createSpecialDay = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await SpecialDayService.create(tenantOf(req), req.user!.userId, body<SpecialDayInput>(req)), "Special day saved");
});

export const updateSpecialDay = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await SpecialDayService.update(tenantOf(req), req.user!.userId, idOf(req), body<SpecialDayInput>(req)), "Special day saved");
});

export const deleteSpecialDay = asyncHandler(async (req: Request, res: Response) => {
  await SpecialDayService.remove(tenantOf(req), req.user!.userId, idOf(req));
  return sendOk(res, null, "Special day taken off");
});

export const getArrangement = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ArrangementService.get(tenantOf(req), (req.validatedQuery as ArrangementQuery).date));
});

export const saveArrangement = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ArrangementService.set(tenantOf(req), req.user!.userId, body<ArrangementInput>(req)), "Arrangement saved");
});

export const handBackPeriod = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ArrangementService.handBack(tenantOf(req), req.user!.userId, body<HandBackInput>(req)), "Period handed back");
});

export const saveAttendanceCover = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ArrangementService.setAttendanceCover(tenantOf(req), req.user!.userId, body<AttendanceCoverInput>(req)), "Attendance arrangement saved");
});
