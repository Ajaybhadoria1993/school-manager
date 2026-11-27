import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission } from "../../../../middleware/permission";
import { yearView } from "../../../../middleware/yearView";
import { validate } from "../../../../middleware/validate";
import { studentsQuerySchema } from "../../../attendance/schemas/attendance.schemas";
import {
  addTest,
  attendanceRegister,
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
  markStudentAttendance,
  removeTest,
  saveAttendance,
  saveDiary,
  saveMarks,
  saveSyllabus,
  syllabusSources,
  teachingFile,
  getReminder,
  saveReminder,
  setStandardHoliday,
  teachingLog,
  teachingProgress,
  updateEvent,
} from "../../controllers/classroom.controller";
import {
  addTestSchema,
  saveDiarySchema,
  saveMarksSchema,
  saveSyllabusSchema,
  progressLogQuerySchema,
  progressQuerySchema,
  syllabusSourcesQuerySchema,
  reminderSchema,
  unitDayQuerySchema,
  unitQuerySchema,
  attendanceQuerySchema,
  calendarQuerySchema,
  createEventSchema,
  decideLeaveSchema,
  idParamSchema,
  leaveQuerySchema,
  markStudentSchema,
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
// One class or section's register for the days asked (its class teacher's page; the school may look).
router.get("/attendance/register", requirePermission("attendance.view"), validate(studentsQuerySchema, "query"), attendanceRegister);
// Only the class teacher of the class takes attendance (the service says who may): the whole day, or one child on one day.
router.put("/attendance", requirePermission("attendance.mark"), validate(saveAttendanceSchema), saveAttendance);
// One child on one day, from a cell of the register: only that child's mark is written.
router.put("/attendance/student", requirePermission("attendance.mark"), validate(markStudentSchema), markStudentAttendance);

// ---- Diary: what was taught and the homework, per subject and day (the subject's teacher, the class teacher, the school) --------------
router.get("/diary", requirePermission("classwork.view"), validate(unitDayQuerySchema, "query"), diaryDay);
router.put("/diary", requirePermission("classwork.manage"), validate(saveDiarySchema), saveDiary);

// ---- Chapters of a subject, and teaching progress (docs/teaching-progress.md) ---------------------------------------------------------
router.put("/syllabus", requirePermission("classwork.manage"), validate(saveSyllabusSchema), saveSyllabus);
// The lists a subject's chapters can be copied from (another section, an earlier year).
router.get("/syllabus/sources", requirePermission("classwork.manage"), validate(syllabusSourcesQuerySchema, "query"), syllabusSources);
// The school (and staff it allows) every class; a teacher their classes as class teacher and the subjects they teach (the service decides).
const SEE_PROGRESS = requirePermission("classwork.view", "progress.view");
router.get("/progress", SEE_PROGRESS, validate(progressQuerySchema, "query"), teachingProgress);
router.get("/progress/log", SEE_PROGRESS, validate(progressLogQuerySchema, "query"), teachingLog);
router.get("/progress/export", SEE_PROGRESS, validate(progressQuerySchema, "query"), teachingFile);
// Whether and when teachers who have not written the diary are reminded: the people who run the school choose.
const RUNS_SCHOOL = requireRole("school_admin", "principal");
router.get("/reminder", RUNS_SCHOOL, getReminder);
router.put("/reminder", RUNS_SCHOOL, validate(reminderSchema), saveReminder);

// ---- Tests and marks ------------------------------------------------------------------------------------------------------------------
router.get("/tests", requirePermission("classwork.view"), validate(unitQuerySchema, "query"), listTests);
router.post("/tests", requirePermission("classwork.manage"), validate(addTestSchema), addTest);
router.get("/tests/:id", requirePermission("classwork.view"), validate(idParamSchema, "params"), getTest);
router.put("/tests/:id/marks", requirePermission("classwork.manage"), validate(idParamSchema, "params"), validate(saveMarksSchema), saveMarks);
router.delete("/tests/:id", requirePermission("classwork.manage"), validate(idParamSchema, "params"), removeTest);

export default router;
