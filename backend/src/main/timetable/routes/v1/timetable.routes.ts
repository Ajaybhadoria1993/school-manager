import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission } from "../../../../middleware/permission";
import { yearView } from "../../../../middleware/yearView";
import { validate } from "../../../../middleware/validate";
import { teacherExists } from "../../../staff/controllers/staff.controller";
import { unitQuerySchema } from "../../../subjects/schemas/subjects.schemas";
import {
  autofillGrid,
  copyGrid,
  createSchedule,
  createSpecialDay,
  deleteSchedule,
  deleteSpecialDay,
  getArrangement,
  getGrid,
  getOverview,
  getTeacherWeek,
  listPublished,
  listSchedules,
  listSpecialDays,
  placeTeacherPeriods,
  publishGrid,
  removeDepartmentDay,
  saveArrangement,
  saveAttendanceCover,
  handBackPeriod,
  saveClassDay,
  replaceTeacher,
  saveGrid,
  saveSchoolDay,
  scheduleExists,
  specialDayExists,
  unpublishGrid,
  updateSchedule,
  updateSpecialDay,
} from "../../controllers/timetable.controller";
import { TIMETABLE_READERS, TIMETABLE_WRITERS } from "../../constants";
import {
  arrangementQuerySchema,
  arrangementSchema,
  attendanceCoverSchema,
  handBackSchema,
  autofillSchema,
  classDaySchema,
  copySchema,
  createScheduleSchema,
  idParamSchema,
  overviewQuerySchema,
  replaceTeacherSchema,
  saveGridSchema,
  schoolDaySchema,
  specialDaySchema,
  teacherPeriodsSchema,
  unitBodySchema,
  updateScheduleSchema,
} from "../../schemas/timetable.schemas";

const router = Router();

// Strict auth: the school must be approved. yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
router.use(requireAuth, yearView);

router.get("/schedules", requirePermission("timetable.view", "timetable.edit"), listSchedules);
// One class's (or section's) weekly timetable; a teacher sees only published ones.
router.get("/grid", requirePermission("timetable.view", "timetable.edit"), validate(unitQuerySchema, "query"), getGrid);
// The classes whose timetable is published (what a teacher may open), and one teacher's week across the school.
router.get("/published", requirePermission("timetable.view", "timetable.edit"), listPublished);
router.get("/teachers/:id", requirePermission("timetable.view", "timetable.edit"), validate(idParamSchema, "params"), teacherExists, getTeacherWeek);

router.use(requirePermission("timetable.edit"));
// The set-up in one read: the timings, and each class or section with where it stands.
router.get("/overview", validate(overviewQuerySchema, "query"), getOverview);

router.post("/schedules", validate(createScheduleSchema), createSchedule);
router.patch("/schedules/:id", validate(idParamSchema, "params"), scheduleExists, validate(updateScheduleSchema), updateSchedule);
router.delete("/schedules/:id", validate(idParamSchema, "params"), scheduleExists, deleteSchedule);
// A week in one save, for all classes or for one department (`departmentId`): the days that are the same become one timing.
router.put("/school-day", validate(schoolDaySchema), saveSchoolDay);
// A class's own days (more or fewer periods, a holiday) in one save; no days: it follows the school's timing again.
router.put("/class-day", validate(classDaySchema), saveClassDay);
// A department follows the school's timing again.
router.delete("/school-day/:id", validate(idParamSchema, "params"), removeDepartmentDay);

router.put("/grid", validate(saveGridSchema), saveGrid);
// A teacher is given a subject of a class and its days and periods in one request: the subject's teacher and the lessons, all or nothing.
router.put("/teacher-periods", validate(teacherPeriodsSchema), placeTeacherPeriods);
router.post("/grid/publish", validate(unitBodySchema), publishGrid);
router.post("/grid/unpublish", validate(unitBodySchema), unpublishGrid);
// The program fills the empty periods (nothing is saved); one section's timetable is given to the class's other sections.
router.post("/grid/autofill", validate(autofillSchema), autofillGrid);
router.post("/grid/copy", validate(copySchema), copyGrid);

// Days with a timing of their own (a PTM, a half day), for the whole school or some classes (2026-11-22).
router.get("/special-days", listSpecialDays);
router.post("/special-days", validate(specialDaySchema), createSpecialDay);
router.patch("/special-days/:id", validate(idParamSchema, "params"), specialDayExists, validate(specialDaySchema), updateSpecialDay);
router.delete("/special-days/:id", validate(idParamSchema, "params"), specialDayExists, deleteSpecialDay);

// The day's arrangement: who is away, their lessons and the teachers free then; a substitute for a lesson, for that day only (2026-11-22).
router.get("/arrangements", validate(arrangementQuerySchema, "query"), getArrangement);
router.put("/arrangements", validate(arrangementSchema), saveArrangement);
// Who takes a class's student attendance on a day its class teacher is away (2026-11-24).
router.put("/arrangements/attendance", validate(attendanceCoverSchema), saveAttendanceCover);
// The teacher who was away has come and takes the rest of a period the substitute is taking (2026-11-24).
router.post("/arrangements/hand-back", validate(handBackSchema), handBackPeriod);

// A teacher who has left: their classes and lessons go to another teacher.
router.post("/teachers/:id/replace", validate(idParamSchema, "params"), teacherExists, validate(replaceTeacherSchema), replaceTeacher);

export default router;
