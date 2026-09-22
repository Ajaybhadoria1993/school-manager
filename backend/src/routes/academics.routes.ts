import { Router } from "express";
import { ClassMaster, Section, Subject } from "../models/ClassSection";
import { crudFactory } from "../utils/crudFactory";
import { requireAuth, requireRole } from "../middleware/auth";
import { getPromotionPreview, promoteStudents } from "../controllers/promotion.controller";

const router = Router();
const classCtrl = crudFactory(ClassMaster);
const sectionCtrl = crudFactory(Section);
const subjectCtrl = crudFactory(Subject);

router.use(requireAuth);

router.get("/classes", classCtrl.list);
router.post("/classes", requireRole("super_admin", "school_admin"), classCtrl.create);
router.patch("/classes/:id", requireRole("super_admin", "school_admin"), classCtrl.update);
router.delete("/classes/:id", requireRole("super_admin", "school_admin"), classCtrl.remove);

router.get("/sections", sectionCtrl.list);
router.post("/sections", requireRole("super_admin", "school_admin"), sectionCtrl.create);
router.patch("/sections/:id", requireRole("super_admin", "school_admin"), sectionCtrl.update);
router.delete("/sections/:id", requireRole("super_admin", "school_admin"), sectionCtrl.remove);

router.get("/subjects", subjectCtrl.list);
router.post("/subjects", requireRole("super_admin", "school_admin"), subjectCtrl.create);
router.patch("/subjects/:id", requireRole("super_admin", "school_admin"), subjectCtrl.update);
router.delete("/subjects/:id", requireRole("super_admin", "school_admin"), subjectCtrl.remove);

router.get("/promote/preview", requireRole("super_admin", "school_admin"), getPromotionPreview);
router.post("/promote", requireRole("super_admin", "school_admin"), promoteStudents);

export default router;
