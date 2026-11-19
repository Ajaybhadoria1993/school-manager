import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission } from "../../../../middleware/permission";
import { validate } from "../../../../middleware/validate";
import { applyLeaveSchema, childAttendanceQuerySchema, childDiaryQuerySchema, childLeaveParamsSchema } from "../../../classroom/schemas/classroom.schemas";
import { reportQuerySchema } from "../../../documents/schemas/documents.schemas";
import { childExamsQuerySchema } from "../../../exams/schemas/exams.schemas";
import { applyLeave, cancelLeave, getChild, getChildAttendance, getChildBus, getChildDiary, getChildExams, getChildAdmitCard, getChildFees, getChildIdCard, getChildReportCard, getChildTests, getChildTimetable, listChildLeaves, listChildren } from "../../controllers/parents.controller";

/**
 * `/api/v1/parent`: what a signed-in parent reads and sends (their children, one child's record, its published timetable, its leave).
 * Parents only; every read and write is of the parent's own children (ParentService.childOf), so anyone else's child is not found.
 */
const router = Router();

// Strict auth: the school must be approved.
router.use(requireAuth, requireRole("parent"));

router.get("/children", listChildren);
router.get("/children/:id", getChild);
router.get("/children/:id/timetable", requirePermission("child.timetable"), getChildTimetable);
// Leave for the child (docs/parent-teacher-flow.md, phase 2): send one, see them, take back one still waiting.
router.get("/children/:id/leaves", requirePermission("child.leave"), listChildLeaves);
router.post("/children/:id/leaves", requirePermission("child.leave"), validate(applyLeaveSchema), applyLeave);
router.post("/children/:id/leaves/:leaveId/cancel", requirePermission("child.leave"), validate(childLeaveParamsSchema, "params"), cancelLeave);
// Attendance (phase 3): the child's days of a month and the year's tally.
router.get("/children/:id/attendance", requirePermission("child.attendance"), validate(childAttendanceQuerySchema, "query"), getChildAttendance);
// The diary of a day and the tests (phases 4 and 5).
router.get("/children/:id/diary", requirePermission("child.diary"), validate(childDiaryQuerySchema, "query"), getChildDiary);
router.get("/children/:id/tests", requirePermission("child.diary"), getChildTests);
// The exams of the child's class, the child's own results, and this week's exam days (2026-11-06).
router.get("/children/:id/exams", requirePermission("child.exams"), validate(childExamsQuerySchema, "query"), getChildExams);
// The child's school bus (route, stop, who drives, and where it is while it is live) and the child's fee chart (2026-11-19).
router.get("/children/:id/bus", requirePermission("child.transport"), getChildBus);
router.get("/children/:id/fees", requirePermission("child.fees"), getChildFees);
// The child's ID card and exam report card, to read and print (2026-11-19).
router.get("/children/:id/id-card", requirePermission("child.documents"), getChildIdCard);
router.get("/children/:id/admit-card", requirePermission("child.documents"), validate(reportQuerySchema, "query"), getChildAdmitCard);
router.get("/children/:id/report-card", requirePermission("child.documents"), validate(reportQuerySchema, "query"), getChildReportCard);

export default router;
