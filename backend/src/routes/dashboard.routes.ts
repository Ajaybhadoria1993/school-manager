import { Router } from "express";
import { schoolDashboard, platformDashboard } from "../controllers/dashboard.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/school", schoolDashboard);
router.get("/platform", requireRole("super_admin"), platformDashboard);

export default router;
