import { Router } from "express";
import {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  listMyChildren,
} from "../controllers/student.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/my-children", listMyChildren);
router.get("/", listStudents);
router.get("/:id", getStudent);
router.post("/", requireRole("super_admin", "school_admin", "principal"), createStudent);
router.patch("/:id", requireRole("super_admin", "school_admin", "principal"), updateStudent);

export default router;
