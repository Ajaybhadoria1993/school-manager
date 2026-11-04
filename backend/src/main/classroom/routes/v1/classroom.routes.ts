import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
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
  updateEventSchema,
} from "../../schemas/classroom.schemas";

/**
 * `/api/v1/classroom`: the daily flow of parents and teachers (docs/parent-teacher-flow.md): the calendar, leave, attendance, the diary,
 * tests and marks. Each route says who may use it; every read and write is of the caller's school only.
 */
const router = Router();

// Strict auth: the school must be approved.
router.use(requireAuth);

/** Everyone of the school reads; the people who run it write. */
const SCHOOL_PEOPLE = requireRole("school_admin", "principal", "accountant", "teacher", "parent");
const RUNNERS = requireRole("school_admin", "principal");

// ---- Calendar: holidays and events ----------------------------------------------------------------------------------------------------
router.get("/calendar", SCHOOL_PEOPLE, validate(calendarQuerySchema, "query"), listCalendar);
router.post("/calendar", RUNNERS, validate(createEventSchema), createEvent);
router.patch("/calendar/:id", RUNNERS, validate(idParamSchema, "params"), validate(updateEventSchema), updateEvent);
router.delete("/calendar/:id", RUNNERS, validate(idParamSchema, "params"), deleteEvent);

// ---- Leave: what parents sent; a class teacher sees their classes', the people who run the school every one --------------------------
const STAFF = requireRole("school_admin", "principal", "teacher");
router.get("/leaves", STAFF, validate(leaveQuerySchema, "query"), listLeaves);
router.post("/leaves/:id/decide", STAFF, validate(idParamSchema, "params"), validate(decideLeaveSchema), decideLeave);

// ---- A teacher's own classes (their home): class teacher of, and the classes they teach a subject in ------------------------------------
router.get("/my-classes", requireRole("teacher"), listMyClasses);

// ---- Attendance: a class's (or section's) day, by its class teacher or the people who run the school ----------------------------------
router.get("/attendance", STAFF, validate(attendanceQuerySchema, "query"), attendanceSheet);
router.put("/attendance", STAFF, validate(saveAttendanceSchema), saveAttendance);

// ---- Diary: what was taught and the homework, per subject and day (the subject's teacher, the class teacher, the school) --------------
router.get("/diary", STAFF, validate(unitDayQuerySchema, "query"), diaryDay);
router.put("/diary", STAFF, validate(saveDiarySchema), saveDiary);

// ---- Tests and marks ------------------------------------------------------------------------------------------------------------------
router.get("/tests", STAFF, validate(unitQuerySchema, "query"), listTests);
router.post("/tests", STAFF, validate(addTestSchema), addTest);
router.get("/tests/:id", STAFF, validate(idParamSchema, "params"), getTest);
router.put("/tests/:id/marks", STAFF, validate(idParamSchema, "params"), validate(saveMarksSchema), saveMarks);
router.delete("/tests/:id", STAFF, validate(idParamSchema, "params"), removeTest);

export default router;
