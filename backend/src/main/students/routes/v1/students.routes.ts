import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { ApiError } from "../../../../utils/ApiError";
import { MAX_IMPORT_FILE_BYTES, STUDENT_READERS, STUDENT_WRITERS } from "../../constants";
import {
  admitStudent,
  capacity,
  exportPreview,
  exportStudents,
  getSettings,
  getStudent,
  guardianExists,
  importStudents,
  importTemplate,
  listStudents,
  lookupGuardian,
  moveStudent,
  readImportFile,
  studentExists,
  updateGuardian,
  updateSettings,
  updateStudent,
  validateForSchool,
} from "../../controllers/students.controller";
import {
  admitSchemaFor,
  exportStudentsQuerySchema,
  idParamSchema,
  importStudentsSchema,
  listStudentsQuerySchema,
  lookupGuardianSchema,
  moveStudentSchema,
  updateGuardianSchemaFor,
  updateSchemaFor,
  updateStudentSettingsSchema,
} from "../../schemas/students.schemas";

const router = Router();

// Strict auth: the school must be approved. The platform owner has no school, so none of this is for them.
router.use(requireAuth);

// Who may look and who may admit or change: one list each, in ../../constants.ts (a "reception" role is added there).
const readers = requireRole(...STUDENT_READERS);
const writers = requireRole(...STUDENT_WRITERS);

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
// The students as a spreadsheet (with the list's filters).
router.get("/export", readers, validate(exportStudentsQuerySchema, "query"), exportStudents);
router.get("/export/preview", readers, validate(exportStudentsQuerySchema, "query"), exportPreview);
// How this school keeps its students' records: what the admission form needs, and the export's columns and headings.
router.get("/settings", readers, getSettings);
router.put("/settings", writers, validate(updateStudentSettingsSchema), updateSettings);
// Bringing many students in at once: the sample file, reading an uploaded file, then checking and admitting its rows in parts.
router.get("/import/template", writers, importTemplate);
router.post("/import/read", writers, importFile, readImportFile);
router.post("/import", writers, validate(importStudentsSchema), importStudents);
// A POST, so a mobile number never appears in an address (or in a log of addresses).
router.post("/guardians/lookup", writers, validate(lookupGuardianSchema), lookupGuardian);
router.patch("/guardians/:id", writers, validate(idParamSchema, "params"), guardianExists, validateForSchool(updateGuardianSchemaFor), updateGuardian);

// An admission and a change are held to what this school needs (its settings); the previous school by the class (Class 1 to 12 only).
router.post("/", writers, validateForSchool(admitSchemaFor, "body"), admitStudent);
router.get("/:id", readers, validate(idParamSchema, "params"), getStudent);
router.patch("/:id", writers, validate(idParamSchema, "params"), studentExists, validateForSchool(updateSchemaFor, "student"), updateStudent);
router.patch("/:id/enrolment", writers, validate(idParamSchema, "params"), studentExists, validate(moveStudentSchema), moveStudent);

export default router;
