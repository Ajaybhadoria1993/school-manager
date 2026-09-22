import { Router } from "express";
import {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  listAllocations,
  createAllocation,
  removeAllocation,
} from "../controllers/staff.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/", listStaff);
router.get("/:id", getStaff);
router.post("/", requireRole("super_admin", "school_admin"), createStaff);
router.patch("/:id", requireRole("super_admin", "school_admin"), updateStaff);

router.get("/allocations/list", listAllocations);
router.post("/allocations", requireRole("super_admin", "school_admin", "principal"), createAllocation);
router.delete("/allocations/:id", requireRole("super_admin", "school_admin", "principal"), removeAllocation);

export default router;
