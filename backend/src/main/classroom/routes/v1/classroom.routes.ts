import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission } from "../../../../middleware/permission";
import { yearView } from "../../../../middleware/yearView";
import { validate } from "../../../../middleware/validate";
import {
  addTest,
  attendanceSheet,
  createEvent,
  decideLeave,
  deleteEvent,
  diaryDay,
  getTest,
  listCalendar,
  listLeaves,
  listMyClasses,
  listTests,
  removeTest,
  saveAttendance,
  saveDiary,
  saveMarks,
  setStandardHoliday,
  updateEvent,
} from "../../controllers/classroom.controller";
import {
  addTestSchema,
  saveDiarySchema,
  saveMarksSchema,
  unitDayQuerySchema,
  unitQuerySchema,
  attendanceQuerySchema,
  calendarQuerySchema,
  createEventSchema,
  decideLeaveSchema,
  idParamSchema,
  leaveQuerySchema,
  saveAttendanceSchema,
  setStandardShownSchema,
  standardKeyParamSchema,
  updateEventSchema,
} from "../../schemas/classroom.schemas";

/**
 * `/api/v1/classroom`: the daily flow of parents and teachers (docs/parent-teacher-flow.md): the calendar, leave, attendance, the diary,
 * tests and marks. Each route says who may use it; every read and write is of the caller's school only.
 */
const router = Router();

// Strict auth: the school must be approved.
// yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
router.use(requireAuth, yearView);

/** Who may do what follows the school's Permissions (docs/permissions.md). */
const SEE_CALENDAR = requirePermission("calendar.view");
const CHANGE_CALENDAR = requirePermission("calendar.manage");

// ---- Calendar: holidays and events ----------------------------------------------------------------------------------------------------
router.get("/calendar", SEE_CALENDAR, validate(calendarQuerySchema, "query"), listCalendar);
router.post("/calendar", CHANGE_CALENDAR, validate(createEventSchema), createEvent);
router.patch("/calendar/:id", CHANGE_CALENDAR, validate(idParamSchema, "params"), validate(updateEventSchema), updateEvent);
router.delete("/calendar/:id", CHANGE_CALENDAR, validate(idParamSchema, "params"), deleteEvent);
// The standard holidays (Diwali, Holi...): the school takes a festival off its calendar or brings it back.
router.put("/calendar/standard/:key", CHANGE_CALENDAR, validate(standardKeyParamSchema, "params"), validate(setStandardShownSchema), setStandardHoliday);

// ---- Leave: what parents sent; a class teacher sees their classes', the people who run the school every one --------------------------
router.get("/leaves", requirePermission("leaves.view"), validate(leaveQuerySchema, "query"), listLeaves);
router.post("/leaves/:id/decide", requirePermission("leaves.decide"), validate(idParamSchema, "params"), validate(decideLeaveSchema), decideLeave);

// ---- A teacher's own classes (their home): class teacher of, and the classes they teach a subject in ------------------------------------
router.get("/my-classes", requireRole("teacher"), listMyClasses);

// ---- Attendance: a class's (or section's) day, by its class teacher or the people who run the school ----------------------------------
router.get("/attendance", requirePermission("attendance.view"), validate(attendanceQuerySchema, "query"), attendanceSheet);
router.put("/attendance", requirePermission("attendance.mark"), validate(saveAttendanceSchema), saveAttendance);

// ---- Diary: what was taught and the homework, per subject and day (the subject's teacher, the class teacher, the school) --------------
router.get("/diary", requirePermission("classwork.view"), validate(unitDayQuerySchema, "query"), diaryDay);
router.put("/diary", requirePermission("classwork.manage"), validate(saveDiarySchema), saveDiary);

// ---- Tests and marks ------------------------------------------------------------------------------------------------------------------
router.get("/tests", requirePermission("classwork.view"), validate(unitQuerySchema, "query"), listTests);
router.post("/tests", requirePermission("classwork.manage"), validate(addTestSchema), addTest);
router.get("/tests/:id", requirePermission("classwork.view"), validate(idParamSchema, "params"), getTest);
router.put("/tests/:id/marks", requirePermission("classwork.manage"), validate(idParamSchema, "params"), validate(saveMarksSchema), saveMarks);
router.delete("/tests/:id", requirePermission("classwork.manage"), validate(idParamSchema, "params"), removeTest);

export default router;
