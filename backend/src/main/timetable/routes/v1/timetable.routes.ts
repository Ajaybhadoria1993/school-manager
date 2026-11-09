import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { yearView } from "../../../../middleware/yearView";
import { validate } from "../../../../middleware/validate";
import { teacherExists } from "../../../staff/controllers/staff.controller";
import { unitQuerySchema } from "../../../subjects/schemas/subjects.schemas";
import {
  autofillGrid,
  copyGrid,
  createSchedule,
  deleteSchedule,
  getGrid,
  getOverview,
  getTeacherWeek,
  listPublished,
  listSchedules,
  publishGrid,
  removeDepartmentDay,
  saveClassDay,
  replaceTeacher,
  saveGrid,
  saveSchoolDay,
  scheduleExists,
  unpublishGrid,
  updateSchedule,
} from "../../controllers/timetable.controller";
import { TIMETABLE_READERS, TIMETABLE_WRITERS } from "../../constants";
import {
  autofillSchema,
  classDaySchema,
  copySchema,
  createScheduleSchema,
  idParamSchema,
  overviewQuerySchema,
  replaceTeacherSchema,
  saveGridSchema,
  schoolDaySchema,
  unitBodySchema,
  updateScheduleSchema,
} from "../../schemas/timetable.schemas";

const router = Router();

// Strict auth: the school must be approved. yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
router.use(requireAuth, yearView);

router.get("/schedules", requireRole(...TIMETABLE_READERS), listSchedules);
// One class's (or section's) weekly timetable; a teacher sees only published ones.
router.get("/grid", requireRole(...TIMETABLE_READERS), validate(unitQuerySchema, "query"), getGrid);
// The classes whose timetable is published (what a teacher may open), and one teacher's week across the school.
router.get("/published", requireRole(...TIMETABLE_READERS), listPublished);
router.get("/teachers/:id", requireRole(...TIMETABLE_READERS), validate(idParamSchema, "params"), teacherExists, getTeacherWeek);

router.use(requireRole(...TIMETABLE_WRITERS));
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
router.post("/grid/publish", validate(unitBodySchema), publishGrid);
router.post("/grid/unpublish", validate(unitBodySchema), unpublishGrid);
// The program fills the empty periods (nothing is saved); one section's timetable is given to the class's other sections.
router.post("/grid/autofill", validate(autofillSchema), autofillGrid);
router.post("/grid/copy", validate(copySchema), copyGrid);

// A teacher who has left: their classes and lessons go to another teacher.
router.post("/teachers/:id/replace", validate(idParamSchema, "params"), teacherExists, validate(replaceTeacherSchema), replaceTeacher);

export default router;
