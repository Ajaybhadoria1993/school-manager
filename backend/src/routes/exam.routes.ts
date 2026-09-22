import { Router } from "express";
import {
  createExam,
  listExams,
  addExamSubject,
  listExamSubjects,
  getMarksSheet,
  saveMarks,
  submitMarks,
  reopenMarks,
} from "../controllers/exam.controller";
import {
  getReportCard,
  listReportCardsForExam,
  updateRemarks,
  publishReportCard,
  publishAllForExam,
} from "../controllers/reportCard.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", listExams);
router.post("/", requireRole("super_admin", "school_admin", "principal"), createExam);

router.get("/:examId/subjects", listExamSubjects);
router.post("/:examId/subjects", requireRole("super_admin", "school_admin", "principal"), addExamSubject);

router.get("/subjects/:examSubjectId/marks", requireRole("super_admin", "school_admin", "principal", "teacher"), getMarksSheet);
router.post("/subjects/:examSubjectId/marks", requireRole("teacher", "school_admin", "principal", "super_admin"), saveMarks);
router.patch("/subjects/:examSubjectId/submit", requireRole("teacher", "school_admin", "principal", "super_admin"), submitMarks);
router.patch("/subjects/:examSubjectId/reopen", requireRole("principal", "school_admin", "super_admin"), reopenMarks);

router.get("/:examId/report-cards", requireRole("super_admin", "school_admin", "principal", "teacher"), listReportCardsForExam);
router.get("/:examId/report-cards/:studentId", getReportCard);
router.patch("/:examId/report-cards/:studentId/remarks", requireRole("teacher", "school_admin", "principal", "super_admin"), updateRemarks);
router.post("/:examId/report-cards/:studentId/publish", requireRole("principal", "school_admin", "super_admin"), publishReportCard);
router.post("/:examId/report-cards/publish-all", requireRole("principal", "school_admin", "super_admin"), publishAllForExam);

export default router;
