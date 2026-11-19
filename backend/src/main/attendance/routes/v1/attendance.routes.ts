import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requireSchoolPermission } from "../../../../middleware/permission";
import { validate } from "../../../../middleware/validate";
import { yearView } from "../../../../middleware/yearView";
import { ATTENDANCE_READERS } from "../../constants";
import { getMyDay, getMyMonth, getStudentsAttendance, getStudentsToday, getTeachersAttendance, markMePresent, setTeacherDay, teacherExists } from "../../controllers/attendance.controller";
import { monthQuerySchema, myDayQuerySchema, rangeQuerySchema, setTeacherDaySchema, studentsQuerySchema, teacherIdParamSchema } from "../../schemas/attendance.schemas";

/**
 * `/api/v1/attendance`: attendance for the people who run the school (the students of any class and the teachers, for any days) and a
 * teacher's own mark. The students' attendance is TAKEN in `/api/v1/classroom/attendance` (by the class teacher); this reads it.
 */
const router = Router();

// Strict auth: the school must be approved. yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it.
router.use(requireAuth, yearView);

// Who may look follows the school's Permissions (docs/permissions.md); a teacher reads only their own day below.
const readers = requireSchoolPermission("attendance.view");
const teacherSheets = requireSchoolPermission("attendance.teachers");

router.get("/students", readers, validate(studentsQuerySchema, "query"), getStudentsAttendance);
// Which classes have not taken today's attendance.
router.get("/students/today", readers, getStudentsToday);
router.get("/teachers", teacherSheets, validate(rangeQuerySchema, "query"), getTeachersAttendance);

// A teacher's own day and the mark that says they came. Declared after "/teachers" so "me" is not taken for anything else.
router.get("/teachers/me", requireRole("teacher"), validate(myDayQuerySchema, "query"), getMyDay);
router.post("/teachers/me/present", requireRole("teacher"), markMePresent);
router.get("/teachers/me/month", requireRole("teacher"), validate(monthQuerySchema, "query"), getMyMonth);

// The school marks or corrects a teacher's day (Present with the time, Absent, Leave): 404 before 400.
router.put("/teachers/:teacherId/day", teacherSheets, validate(teacherIdParamSchema, "params"), teacherExists, validate(setTeacherDaySchema), setTeacherDay);

export default router;
