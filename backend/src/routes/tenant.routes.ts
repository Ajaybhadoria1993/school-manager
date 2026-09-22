import { Router } from "express";
import { onboardTenant, listTenants, updateTenant } from "../controllers/tenant.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("super_admin"));
router.get("/", listTenants);
router.post("/onboard", onboardTenant);
router.patch("/:id", updateTenant);

export default router;
