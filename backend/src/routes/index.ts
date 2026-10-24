import { Router } from "express";
import authRoutes from "../main/auth/routes/v1/auth.routes";
import tenantRoutes from "../main/tenants/routes/v1/tenants.routes";
import onboardingRoutes from "../main/onboarding/routes/v1/onboarding.routes";
import academicsRoutes from "../main/academics/routes/v1/academics.routes";
import studentsRoutes from "../main/students/routes/v1/students.routes";

// One line per feature module. Add new modules here as they are built.
const router = Router();

router.use("/auth", authRoutes);
router.use("/tenants", tenantRoutes);
router.use("/onboarding", onboardingRoutes);
router.use("/academics", academicsRoutes);
router.use("/students", studentsRoutes);

export default router;
