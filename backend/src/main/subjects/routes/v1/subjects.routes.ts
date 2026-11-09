import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { yearView } from "../../../../middleware/yearView";
import { validate } from "../../../../middleware/validate";
import { assignAllotmentTeacher, createSubject, getAllotments, listSubjects, quickAddSubjects, saveAllotments, saveUnitTeachers, subjectExists, updateSubject } from "../../controllers/subjects.controller";
import { SUBJECT_READERS, SUBJECT_WRITERS } from "../../constants";
import {
  assignTeacherSchema,
  saveUnitTeachersSchema,
  createSubjectSchema,
  idParamSchema,
  listSubjectsQuerySchema,
  quickAddSchema,
  saveAllotmentsSchema,
  unitQuerySchema,
  updateSubjectSchema,
} from "../../schemas/subjects.schemas";

const router = Router();

// Strict auth: the school must be approved.
// yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
router.use(requireAuth, yearView);

router.get("/", requireRole(...SUBJECT_READERS), validate(listSubjectsQuerySchema, "query"), listSubjects);
// What one class (or section) studies: the subjects, the periods a week and the teacher of each.
router.get("/allotments", requireRole(...SUBJECT_READERS), validate(unitQuerySchema, "query"), getAllotments);

router.use(requireRole(...SUBJECT_WRITERS));
router.put("/allotments", validate(saveAllotmentsSchema), saveAllotments);
// One subject's teacher, the rest of the list as it is (a teacher's page and a class's page give classes this way).
router.put("/allotments/teacher", validate(assignTeacherSchema), assignAllotmentTeacher);
// The class teacher and every subject's main and backup teachers of one class, together (its page's Save): all or nothing.
router.put("/allotments/teachers", validate(saveUnitTeachersSchema), saveUnitTeachers);
router.post("/", validate(createSubjectSchema), createSubject);
// Fixed paths before "/:id".
router.post("/quick-add", validate(quickAddSchema), quickAddSubjects);
router.patch("/:id", validate(idParamSchema, "params"), subjectExists, validate(updateSubjectSchema), updateSubject);

export default router;
