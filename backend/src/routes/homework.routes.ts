import { Router } from "express";
import { listHomework, listHomeworkForStudent, createHomework, deleteHomework } from "../controllers/homework.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/", listHomework);
router.get("/student/:studentId", listHomeworkForStudent);
router.post("/", requireRole("teacher", "school_admin", "principal", "super_admin"), createHomework);
router.delete("/:id", requireRole("teacher", "school_admin", "principal", "super_admin"), deleteHomework);

export default router;
