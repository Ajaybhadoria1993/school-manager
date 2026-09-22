import { Router } from "express";
import {
  markAttendance,
  listAttendanceByDay,
  studentAttendanceSummary,
  correctAttendance,
} from "../controllers/attendance.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.post("/mark", requireRole("teacher", "school_admin", "principal", "super_admin"), markAttendance);
router.get("/by-day", listAttendanceByDay);
router.get("/student/:studentId/summary", studentAttendanceSummary);
router.patch("/:id/correct", requireRole("school_admin", "principal", "super_admin"), correctAttendance);

export default router;
