import { Router } from "express";
import { listTimetable, myTimetable, upsertSlot, deleteSlot } from "../controllers/timetable.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/", listTimetable);
router.get("/mine", myTimetable);
router.post("/", requireRole("super_admin", "school_admin", "principal"), upsertSlot);
router.delete("/:id", requireRole("super_admin", "school_admin", "principal"), deleteSlot);

export default router;
