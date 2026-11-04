import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { ApiError } from "../../../../utils/ApiError";
import { MAX_IMPORT_FILE_BYTES, STUDENT_APPROVERS, STUDENT_READERS, STUDENT_WRITERS } from "../../constants";
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
router.use(requireAuth);

// Who may look and who may admit or change: one list each, in ../../constants.ts (a "reception" role is added there).
const readers = requireRole(...STUDENT_READERS);
const writers = requireRole(...STUDENT_WRITERS);
const approvers = requireRole(...STUDENT_APPROVERS);

/**
 * One spreadsheet in the "file" field, kept in memory only while it is read (it is never stored), up to 5 MB. A file that is too big or
 * sent another way is refused with a message for the person, like any other wrong field.
 */
const spreadsheet = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1, fields: 5 } });
function importFile(req: Request, res: Response, next: NextFunction) {
  spreadsheet.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `The file is bigger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB. Split it into smaller files.`
          : "Upload one spreadsheet file.";
      return next(ApiError.badRequest(message, err.code === "LIMIT_FILE_SIZE" ? "IMPORT_FILE_TOO_BIG" : "IMPORT_FILE_MISSING", [{ path: "file", message }]));
    }
    next(err);
  });
}

// Fixed paths before "/:id".
router.get("/", readers, validate(listStudentsQuerySchema, "query"), listStudents);
router.get("/capacity", readers, capacity);
// The classes at a glance (students, sections, seats), filtered by the server: a department, one class, part of a class name.
router.get("/class-overview", readers, validate(classOverviewQuerySchema, "query"), classOverview);
// The students as a spreadsheet (with the list's filters).
router.get("/export", readers, validate(exportStudentsQuerySchema, "query"), exportStudents);
router.get("/export/preview", readers, validate(exportStudentsQuerySchema, "query"), exportPreview);
// How this school keeps its students' records: what the admission form needs, and the export's columns and headings.
router.get("/settings", readers, getSettings);
router.put("/settings", writers, validate(updateStudentSettingsSchema), updateSettings);
// Active and inactive students: a student who leaves is made inactive (never deleted) and is active again with one click.
router.post("/deactivate", writers, validate(deactivateStudentsSchema), deactivateStudents);
router.get("/inactive", writers, validate(listInactiveQuerySchema, "query"), listInactive);
router.post("/reactivate", writers, validate(reactivateStudentsSchema), reactivateStudents);
// Promotion to the next academic year: a list that whoever admits prepares and sends, and only the school admin approves.
router.get("/promotions", writers, validate(promotionQuerySchema, "query"), getPromotion);
router.post("/promotions", writers, validate(startPromotionSchema), startPromotion);
router.patch("/promotions/:id", writers, validate(idParamSchema, "params"), validate(updatePromotionSchema), updatePromotion);
router.post("/promotions/:id/submit", writers, validate(idParamSchema, "params"), submitPromotion);
router.post("/promotions/:id/reject", approvers, validate(idParamSchema, "params"), validate(rejectPromotionSchema), rejectPromotion);
router.post("/promotions/:id/approve", approvers, validate(idParamSchema, "params"), validate(approvePromotionSchema), approvePromotion);
router.post("/promotions/:id/cancel", writers, validate(idParamSchema, "params"), cancelPromotion);
// Bringing many students in at once: the sample file, reading an uploaded file, then checking and admitting its rows in parts.
router.get("/import/template", writers, importTemplate);
router.post("/import/read", writers, importFile, readImportFile);
router.post("/import", writers, validate(importStudentsSchema), importStudents);
router.post("/import/match", writers, validate(matchImportSchema), matchImportRows);
// A POST, so a mobile number never appears in an address (or in a log of addresses).
router.post("/guardians/lookup", writers, validate(lookupGuardianSchema), lookupGuardian);
router.patch("/guardians/:id", writers, validate(idParamSchema, "params"), guardianExists, validateForSchool(updateGuardianSchemaFor), updateGuardian);
// A parent's login (one for all their children): make it, another username, a new password. The password is never sent back later.
router.post("/guardians/:id/login", writers, validate(idParamSchema, "params"), guardianExists, validate(loginAccountSchema), createGuardianLogin);
router.patch("/guardians/:id/login", writers, validate(idParamSchema, "params"), guardianExists, validate(changeUsernameSchema), changeGuardianUsername);
router.post("/guardians/:id/reset-password", writers, validate(idParamSchema, "params"), guardianExists, validate(resetPasswordSchema), resetGuardianPassword);

// An admission and a change are held to what this school needs (its settings); the previous school by the class (Class 1 to 12 only).
router.post("/", writers, validateForSchool(admitSchemaFor, "body"), admitStudent);
router.get("/:id", readers, validate(idParamSchema, "params"), getStudent);
router.patch("/:id", writers, validate(idParamSchema, "params"), studentExists, validateForSchool(updateSchemaFor, "student"), updateStudent);
// Leaving for another school: inactive, with the transfer certificate kept (nothing is deleted).
router.post("/:id/transfer-out", writers, validate(idParamSchema, "params"), studentExists, validate(transferOutSchema), transferOutStudent);
router.patch("/:id/enrolment", writers, validate(idParamSchema, "params"), studentExists, validate(moveStudentSchema), moveStudent);

export default router;
