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
import examRoutes from "../main/exams/routes/v1/exams.routes";
import attendanceRoutes from "../main/attendance/routes/v1/attendance.routes";
import dashboardRoutes from "../main/dashboard/routes/v1/dashboard.routes";
import transportRoutes from "../main/transport/routes/v1/transport.routes";
import feesRoutes from "../main/fees/routes/v1/fees.routes";
import permissionRoutes from "../main/permissions/routes/v1/permissions.routes";
import publicRoutes from "../main/tenants/routes/v1/public.routes";

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
// Test & Exam (Manage school): exams and tests of the year, and what each class writes on which day.
router.use("/exams", examRoutes);
// Attendance for the people who run the school (students of any class, teachers) and a teacher's own mark.
router.use("/attendance", attendanceRoutes);
// The school home page's numbers (students, teachers, today's attendance, what needs attention) in one answer.
router.use("/dashboard", dashboardRoutes);
// Transport: the school's vehicles, drivers and attendants, and routes with their stops.
router.use("/transport", transportRoutes);
// Fees (set-up only): the fee heads, each class's fee chart for a session, the concessions and the fee rules.
router.use("/fees", feesRoutes);
// What each kind of person of the school (Receptionist, Teacher, Parent...) may do: the Permissions page.
router.use("/permissions", permissionRoutes);
// What needs no sign-in: a school's logo, for an image tag.
router.use("/public", publicRoutes);

export default router;
