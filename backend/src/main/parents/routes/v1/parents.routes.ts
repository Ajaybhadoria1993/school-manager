import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { applyLeaveSchema, childAttendanceQuerySchema, childDiaryQuerySchema, childLeaveParamsSchema } from "../../../classroom/schemas/classroom.schemas";
import { applyLeave, cancelLeave, getChild, getChildAttendance, getChildDiary, getChildTests, getChildTimetable, listChildLeaves, listChildren } from "../../controllers/parents.controller";

/**
 * `/api/v1/parent`: what a signed-in parent reads and sends (their children, one child's record, its published timetable, its leave).
 * Parents only; every read and write is of the parent's own children (ParentService.childOf), so anyone else's child is not found.
 */
const router = Router();

// Strict auth: the school must be approved.
router.use(requireAuth, requireRole("parent"));

router.get("/children", listChildren);
router.get("/children/:id", getChild);
router.get("/children/:id/timetable", getChildTimetable);
// Leave for the child (docs/parent-teacher-flow.md, phase 2): send one, see them, take back one still waiting.
router.get("/children/:id/leaves", listChildLeaves);
router.post("/children/:id/leaves", validate(applyLeaveSchema), applyLeave);
router.post("/children/:id/leaves/:leaveId/cancel", validate(childLeaveParamsSchema, "params"), cancelLeave);
// Attendance (phase 3): the child's days of a month and the year's tally.
router.get("/children/:id/attendance", validate(childAttendanceQuerySchema, "query"), getChildAttendance);
// The diary of a day and the tests (phases 4 and 5).
router.get("/children/:id/diary", validate(childDiaryQuerySchema, "query"), getChildDiary);
router.get("/children/:id/tests", getChildTests);

export default router;
