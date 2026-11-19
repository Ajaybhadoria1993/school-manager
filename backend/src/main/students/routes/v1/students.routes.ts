import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission, requireSchoolPermission } from "../../../../middleware/permission";
import { importFile } from "../../../../middleware/uploadSheet";
import { validate } from "../../../../middleware/validate";
import { yearView } from "../../../../middleware/yearView";
import { STUDENT_APPROVERS, STUDENT_READERS, STUDENT_WRITERS } from "../../constants";
import { changeUsernameSchema, loginAccountSchema, resetPasswordSchema } from "../../../staff/schemas/staff.schemas";
import {
  admitStudent,
  approvePromotion,
  changeGuardianUsername,
  createGuardianLogin,
  resetGuardianPassword,
  cancelPromotion,
  capacity,
  classOverview,
  deactivateStudents,
  exportPreview,
  exportStudents,
  getPromotion,
  getSettings,
  getStudent,
  guardianExists,
  importStudents,
  matchImportRows,
  importTemplate,
  listStudents,
  lookupGuardian,
  moveStudent,
  listInactive,
  reactivateStudents,
  readImportFile,
  rejectPromotion,
  startPromotion,
  studentExists,
  submitPromotion,
  transferOutStudent,
  updateGuardian,
  updatePromotion,
  updateSettings,
  updateStudent,
  validateForSchool,
} from "../../controllers/students.controller";
import {
  admitSchemaFor,
  approvePromotionSchema,
  classOverviewQuerySchema,
  deactivateStudentsSchema,
  exportStudentsQuerySchema,
  idParamSchema,
  importStudentsSchema,
  matchImportSchema,
  listStudentsQuerySchema,
  listInactiveQuerySchema,
  lookupGuardianSchema,
  moveStudentSchema,
  promotionQuerySchema,
  reactivateStudentsSchema,
  rejectPromotionSchema,
  startPromotionSchema,
  transferOutSchema,
  updateGuardianSchemaFor,
  updatePromotionSchema,
  updateSchemaFor,
  updateStudentSettingsSchema,
} from "../../schemas/students.schemas";

const router = Router();

// Strict auth: the school must be approved. The platform owner has no school, so none of this is for them.
// yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
router.use(requireAuth, yearView);

// Who may do what follows the school's Permissions (docs/permissions.md): the school admin and the principal everything, anyone else by the
// kind of person they are. `writers` is what only the people who run the school do (the school's settings, the promotion, a parent's login).
const readers = requirePermission("students.view");
const adders = requirePermission("students.add");
const editors = requirePermission("students.edit");
const leavers = requirePermission("students.status");
// The Export page (the school's fields and Excel layout, with its preview and download) is for whoever may export or choose the fields.
const exporters = requirePermission("students.export", "students.settings");
const settingsMakers = requirePermission("students.settings");
const promoters = requirePermission("promotion.manage");
const approvers = requireRole(...STUDENT_APPROVERS);

// Fixed paths before "/:id".
router.get("/", readers, validate(listStudentsQuerySchema, "query"), listStudents);
router.get("/capacity", readers, capacity);
// The classes at a glance (students, sections, seats), filtered by the server: a department, one class, part of a class name.
router.get("/class-overview", requireSchoolPermission("students.view", "attendance.view", "classes.view"), validate(classOverviewQuerySchema, "query"), classOverview);
// The students as a spreadsheet (with the list's filters).
router.get("/export", exporters, validate(exportStudentsQuerySchema, "query"), exportStudents);
router.get("/export/preview", exporters, validate(exportStudentsQuerySchema, "query"), exportPreview);
// How this school keeps its students' records: what the admission form needs, and the export's columns and headings.
router.get("/settings", readers, getSettings);
router.put("/settings", settingsMakers, validate(updateStudentSettingsSchema), updateSettings);
// Active and inactive students: a student who leaves is made inactive (never deleted) and is active again with one click.
router.post("/deactivate", leavers, validate(deactivateStudentsSchema), deactivateStudents);
router.get("/inactive", leavers, validate(listInactiveQuerySchema, "query"), listInactive);
router.post("/reactivate", leavers, validate(reactivateStudentsSchema), reactivateStudents);
// Promotion to the next academic year: a list that whoever admits prepares and sends, and only the school admin approves.
router.get("/promotions", promoters, validate(promotionQuerySchema, "query"), getPromotion);
router.post("/promotions", promoters, validate(startPromotionSchema), startPromotion);
router.patch("/promotions/:id", promoters, validate(idParamSchema, "params"), validate(updatePromotionSchema), updatePromotion);
router.post("/promotions/:id/submit", promoters, validate(idParamSchema, "params"), submitPromotion);
router.post("/promotions/:id/reject", approvers, validate(idParamSchema, "params"), validate(rejectPromotionSchema), rejectPromotion);
router.post("/promotions/:id/approve", approvers, validate(idParamSchema, "params"), validate(approvePromotionSchema), approvePromotion);
router.post("/promotions/:id/cancel", promoters, validate(idParamSchema, "params"), cancelPromotion);
// Bringing many students in at once: the sample file, reading an uploaded file, then checking and admitting its rows in parts.
router.get("/import/template", adders, importTemplate);
router.post("/import/read", adders, importFile, readImportFile);
router.post("/import", adders, validate(importStudentsSchema), importStudents);
router.post("/import/match", adders, validate(matchImportSchema), matchImportRows);
// A POST, so a mobile number never appears in an address (or in a log of addresses).
router.post("/guardians/lookup", requirePermission("students.add", "students.edit"), validate(lookupGuardianSchema), lookupGuardian);
router.patch("/guardians/:id", editors, validate(idParamSchema, "params"), guardianExists, validateForSchool(updateGuardianSchemaFor), updateGuardian);
// A parent's login (one for all their children): make it, another username, a new password. The password is never sent back later.
router.post("/guardians/:id/login", adders, validate(idParamSchema, "params"), guardianExists, validate(loginAccountSchema), createGuardianLogin);
router.patch("/guardians/:id/login", editors, validate(idParamSchema, "params"), guardianExists, validate(changeUsernameSchema), changeGuardianUsername);
router.post("/guardians/:id/reset-password", editors, validate(idParamSchema, "params"), guardianExists, validate(resetPasswordSchema), resetGuardianPassword);

// An admission and a change are held to what this school needs (its settings); the previous school by the class (Class 1 to 12 only).
router.post("/", adders, validateForSchool(admitSchemaFor, "body"), admitStudent);
router.get("/:id", readers, validate(idParamSchema, "params"), getStudent);
router.patch("/:id", editors, validate(idParamSchema, "params"), studentExists, validateForSchool(updateSchemaFor, "student"), updateStudent);
// Leaving for another school: inactive, with the transfer certificate kept (nothing is deleted).
router.post("/:id/transfer-out", leavers, validate(idParamSchema, "params"), studentExists, validate(transferOutSchema), transferOutStudent);
router.patch("/:id/enrolment", editors, validate(idParamSchema, "params"), studentExists, validate(moveStudentSchema), moveStudent);

export default router;
