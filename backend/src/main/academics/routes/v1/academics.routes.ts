import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { yearView } from "../../../../middleware/yearView";
import {
  academicSettings,
  activateAcademicYear,
  addClassesToDepartment,
  assignDepartment,
  createClass,
  createDepartment,
  createNextAcademicYear,
  createSection,
  currentAcademicYear,
  deleteClass,
  deleteDepartment,
  deleteSection,
  getClass,
  getStructure,
  listAcademicYears,
  listClasses,
  quickSetup,
  renameDepartment,
  setUpFirstAcademicYear,
  updateAcademicSettings,
  updateClass,
  updateSection,
} from "../../controllers/academics.controller";
import {
  academicSettingsSchema,
  addClassesSchema,
  assignDepartmentSchema,
  createClassSchema,
  createSectionSchema,
  departmentSchema,
  idParamSchema,
  listClassesQuerySchema,
  quickSetupSchema,
  updateClassSchema,
  updateSectionSchema,
} from "../../schemas/academics.schemas";
import { academicYearInputSchema, nextAcademicYearSchema } from "../../schemas/academicYear.schemas";

const router = Router();

// Strict auth: the school must be approved. The platform owner has no school, so none of this is for them.
// yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
router.use(requireAuth, yearView);

// Anyone who works at the school may look at the layout (teachers will need it for attendance and marks).
const readers = requireRole("school_admin", "principal", "accountant", "teacher");
router.get("/structure", readers, getStructure);
router.get("/classes", readers, validate(listClassesQuerySchema, "query"), listClasses);
router.get("/classes/:id", readers, validate(idParamSchema, "params"), getClass);
// The school's current session, for the dashboard and every screen that shows it.
router.get("/academic-years/current", readers, currentAcademicYear);
// Every year of the school, newest first (the next one waiting, the running one, the closed ones).
router.get("/academic-years", readers, listAcademicYears);
// The school's switches for its academic data (is a section's seats and room required...).
router.get("/settings", readers, academicSettings);

// Changing it is for the people who run the school. Widen this list when a "vice principal" role exists.
router.use(requireRole("school_admin", "principal"));

router.post("/quick-setup", validate(quickSetupSchema), quickSetup);
router.put("/settings", validate(academicSettingsSchema), updateAcademicSettings);

// Only for a school that has no academic year at all (approved before academic years existed): names the running session, once.
router.post("/academic-years/initial", validate(academicYearInputSchema), setUpFirstAcademicYear);
// The next session: made waiting, with the running year's sections copied; switching it on closes the running year (the school admin only).
router.post("/academic-years", validate(nextAcademicYearSchema), createNextAcademicYear);
router.post("/academic-years/:id/activate", requireRole("school_admin"), validate(idParamSchema, "params"), activateAcademicYear);

router.post("/departments", validate(departmentSchema), createDepartment);
// Fixed path before "/:id".
router.post("/departments/assign", validate(assignDepartmentSchema), assignDepartment);
router.post("/departments/:id/classes", validate(idParamSchema, "params"), validate(addClassesSchema), addClassesToDepartment);
router.patch("/departments/:id", validate(idParamSchema, "params"), validate(departmentSchema), renameDepartment);
router.delete("/departments/:id", validate(idParamSchema, "params"), deleteDepartment);

router.post("/classes", validate(createClassSchema), createClass);
router.patch("/classes/:id", validate(idParamSchema, "params"), validate(updateClassSchema), updateClass);
router.delete("/classes/:id", validate(idParamSchema, "params"), deleteClass);

router.post("/classes/:id/sections", validate(idParamSchema, "params"), validate(createSectionSchema), createSection);
router.patch("/sections/:id", validate(idParamSchema, "params"), validate(updateSectionSchema), updateSection);
router.delete("/sections/:id", validate(idParamSchema, "params"), deleteSection);

export default router;
