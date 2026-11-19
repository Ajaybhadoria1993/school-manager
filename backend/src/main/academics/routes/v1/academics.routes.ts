import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission } from "../../../../middleware/permission";
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
  deactivateClass,
  deactivateDepartment,
  deleteSection,
  divideClass,
  getClass,
  getStructure,
  listAcademicYears,
  listClasses,
  quickSetup,
  reactivateClass,
  reactivateDepartment,
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
  divideClassSchema,
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

// Anyone whose work is about students, attendance, leave, timetables, exams or the dashboard may look at the layout (the classes to choose from).
const readers = requirePermission("students.view", "attendance.view", "leaves.view", "classwork.view", "exams.view", "exams.manage", "timetable.view", "timetable.edit", "dashboard.view", "teachers.view", "classes.view", "years.manage");
router.get("/structure", readers, getStructure);
router.get("/classes", readers, validate(listClassesQuerySchema, "query"), listClasses);
router.get("/classes/:id", readers, validate(idParamSchema, "params"), getClass);
// The school's current session, for the dashboard and every screen that shows it.
router.get("/academic-years/current", readers, currentAcademicYear);
// Every year of the school, newest first (the next one waiting, the running one, the closed ones).
router.get("/academic-years", readers, listAcademicYears);
// The school's switches for its academic data (is a section's seats and room required...).
router.get("/settings", readers, academicSettings);

// Changing it follows the school's Permissions (classes.manage for the classes, sections and departments; years.manage for the sessions).
const classMakers = requirePermission("classes.manage");
const yearMakers = requirePermission("years.manage");

router.post("/quick-setup", classMakers, validate(quickSetupSchema), quickSetup);
router.put("/settings", classMakers, validate(academicSettingsSchema), updateAcademicSettings);

// Only for a school that has no academic year at all (approved before academic years existed): names the running session, once.
router.post("/academic-years/initial", yearMakers, validate(academicYearInputSchema), setUpFirstAcademicYear);
// The next session: made waiting, with the running year's sections copied; switching it on closes the running year (the school admin only).
router.post("/academic-years", yearMakers, validate(nextAcademicYearSchema), createNextAcademicYear);
router.post("/academic-years/:id/activate", requireRole("school_admin"), validate(idParamSchema, "params"), activateAcademicYear);

router.post("/departments", classMakers, validate(departmentSchema), createDepartment);
// Fixed path before "/:id".
router.post("/departments/assign", classMakers, validate(assignDepartmentSchema), assignDepartment);
router.post("/departments/:id/classes", classMakers, validate(idParamSchema, "params"), validate(addClassesSchema), addClassesToDepartment);
router.patch("/departments/:id", classMakers, validate(idParamSchema, "params"), validate(departmentSchema), renameDepartment);
// A department and a class are never deleted (their students and history belong to them): they are made inactive, and active again.
router.post("/departments/:id/deactivate", classMakers, validate(idParamSchema, "params"), deactivateDepartment);
router.post("/departments/:id/reactivate", classMakers, validate(idParamSchema, "params"), reactivateDepartment);

router.post("/classes", classMakers, validate(createClassSchema), createClass);
router.patch("/classes/:id", classMakers, validate(idParamSchema, "params"), validate(updateClassSchema), updateClass);
router.post("/classes/:id/deactivate", classMakers, validate(idParamSchema, "params"), deactivateClass);
router.post("/classes/:id/reactivate", classMakers, validate(idParamSchema, "params"), reactivateClass);

// A class with no sections, and students sitting in it, is divided into sections: they are made and the students shared out.
router.post("/classes/:id/divide", classMakers, validate(idParamSchema, "params"), validate(divideClassSchema), divideClass);
router.post("/classes/:id/sections", classMakers, validate(idParamSchema, "params"), validate(createSectionSchema), createSection);
router.patch("/sections/:id", classMakers, validate(idParamSchema, "params"), validate(updateSectionSchema), updateSection);
router.delete("/sections/:id", classMakers, validate(idParamSchema, "params"), deleteSection);

export default router;
