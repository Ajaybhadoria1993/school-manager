import { Router } from "express";
import authRoutes from "../main/auth/routes/v1/auth.routes";
import tenantRoutes from "../main/tenants/routes/v1/tenants.routes";
import onboardingRoutes from "../main/onboarding/routes/v1/onboarding.routes";
import academicsRoutes from "../main/academics/routes/v1/academics.routes";
import studentsRoutes from "../main/students/routes/v1/students.routes";
import subjectsRoutes from "../main/subjects/routes/v1/subjects.routes";
import staffRoutes from "../main/staff/routes/v1/staff.routes";
import timetableRoutes from "../main/timetable/routes/v1/timetable.routes";
import parentRoutes from "../main/parents/routes/v1/parents.routes";
import classroomRoutes from "../main/classroom/routes/v1/classroom.routes";
import notificationRoutes from "../main/notifications/routes/v1/notifications.routes";

// One line per feature module. Add new modules here as they are built.
const router = Router();

router.use("/auth", authRoutes);
router.use("/tenants", tenantRoutes);
router.use("/onboarding", onboardingRoutes);
router.use("/academics", academicsRoutes);
router.use("/students", studentsRoutes);
router.use("/subjects", subjectsRoutes);
router.use("/staff", staffRoutes);
router.use("/timetable", timetableRoutes);
// A signed-in parent's own reads: their children, a child's record and published timetable.
router.use("/parent", parentRoutes);
// The daily flow of parents and teachers: calendar, leave, attendance, diary, tests (docs/parent-teacher-flow.md).
router.use("/classroom", classroomRoutes);
// The signed-in person's bell; new ones also come live on the socket (docs/notifications.md).
router.use("/notifications", notificationRoutes);

export default router;
