import { Router } from "express";
import {
  applyLeave,
  listLeaveRequests,
  decideLeaveRequest,
  getLeaveBalance,
  getSubstitutionCandidates,
  assignSubstitute,
  myActiveSubstitutions,
} from "../controllers/leave.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/", requireRole("teacher", "school_admin", "principal", "super_admin"), applyLeave);
router.get("/", listLeaveRequests);
router.patch("/:id/decide", requireRole("school_admin", "principal", "super_admin"), decideLeaveRequest);

router.get("/balance/:staffId", getLeaveBalance);

router.get("/:id/substitution-candidates", requireRole("school_admin", "principal", "super_admin"), getSubstitutionCandidates);
router.post("/:id/substitution", requireRole("school_admin", "principal", "super_admin"), assignSubstitute);

router.get("/substitutions/mine", myActiveSubstitutions);

export default router;
