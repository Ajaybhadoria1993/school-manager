import { Router } from "express";
import { listUsers, createUser, deactivateUser, reactivateUser } from "../controllers/user.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/", requireRole("super_admin", "school_admin", "principal"), listUsers);
router.post("/", requireRole("super_admin", "school_admin"), createUser);
router.patch("/:id/deactivate", requireRole("super_admin", "school_admin"), deactivateUser);
router.patch("/:id/reactivate", requireRole("super_admin", "school_admin"), reactivateUser);

export default router;
