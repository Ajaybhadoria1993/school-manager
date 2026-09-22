import { Router } from "express";
import { Branch } from "../models/Branch";
import { crudFactory } from "../utils/crudFactory";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
const ctrl = crudFactory(Branch, { scopeToBranch: false });

router.use(requireAuth);
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.post("/", requireRole("super_admin", "school_admin"), ctrl.create);
router.patch("/:id", requireRole("super_admin", "school_admin"), ctrl.update);
router.delete("/:id", requireRole("super_admin"), ctrl.remove);

export default router;
