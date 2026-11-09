import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { yearView } from "../../../../middleware/yearView";
import { validate } from "../../../../middleware/validate";
import { EXAM_READERS, EXAM_WRITERS } from "../../constants";
import { addPapers, createExam, deleteExam, deletePaper, examExists, getClassExams, getExam, getMarksSheet, listExams, saveMarks, updateExam, updatePaper } from "../../controllers/exams.controller";
import {
  addPapersSchema,
  classExamsQuerySchema,
  createExamSchema,
  examIdParamSchema,
  listExamsQuerySchema,
  marksSheetQuerySchema,
  paperIdParamSchema,
  paperParamsSchema,
  saveExamMarksSchema,
  updateExamSchema,
  updatePaperSchema,
} from "../../schemas/exams.schemas";

/**
 * `/api/v1/exams`: Test & Exam (Manage school): the school's exams and tests of the active year, and what each class writes on which
 * day. Only the people who run the school (EXAM_WRITERS) schedule them; the teachers of a class read its exams and enter marks (the
 * "/class" and "/papers/:paperId/marks" routes); a parent reads their child's at `/api/v1/parent/children/:id/exams`. Every read and
 * write is of the caller's school only.
 */
const router = Router();

// Strict auth: the school must be approved.
// yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
router.use(requireAuth, yearView);

const readers = requireRole(...EXAM_READERS);
const writers = requireRole(...EXAM_WRITERS);
// The teachers of a class read its exams and enter the marks of the subjects they teach (what each may do is the service's rule: access.ts).
const classPeople = requireRole(...EXAM_WRITERS, "teacher");

// A class's exams, its papers with the marks counts, and the exam days of its week; a paper's marks sheet and the marks (2026-11-06).
// Declared before "/:id" so "class" and "papers" are not taken for an exam's id.
router.get("/class", classPeople, validate(classExamsQuerySchema, "query"), getClassExams);
router.get("/papers/:paperId/marks", classPeople, validate(paperIdParamSchema, "params"), validate(marksSheetQuerySchema, "query"), getMarksSheet);
router.put("/papers/:paperId/marks", classPeople, validate(paperIdParamSchema, "params"), validate(saveExamMarksSchema), saveMarks);

router.get("/", readers, validate(listExamsQuerySchema, "query"), listExams);
router.post("/", writers, validate(createExamSchema), createExam);
router.get("/:id", readers, validate(examIdParamSchema, "params"), getExam);
router.patch("/:id", writers, validate(examIdParamSchema, "params"), examExists, validate(updateExamSchema), updateExam);
router.delete("/:id", writers, validate(examIdParamSchema, "params"), deleteExam);

// The papers of an exam: a timetable for some classes added at once, then changed or taken away one by one.
router.post("/:id/papers", writers, validate(examIdParamSchema, "params"), examExists, validate(addPapersSchema), addPapers);
router.patch("/:id/papers/:paperId", writers, validate(paperParamsSchema, "params"), examExists, validate(updatePaperSchema), updatePaper);
router.delete("/:id/papers/:paperId", writers, validate(paperParamsSchema, "params"), deletePaper);

export default router;
