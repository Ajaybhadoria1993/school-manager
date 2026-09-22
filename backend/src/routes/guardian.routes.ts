import { Router } from "express";
import { searchGuardians, getGuardian } from "../controllers/guardian.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/", requireRole("super_admin", "school_admin", "principal", "accountant", "teacher"), searchGuardians);
router.get("/:id", requireRole("super_admin", "school_admin", "principal", "accountant", "teacher"), getGuardian);

export default router;
