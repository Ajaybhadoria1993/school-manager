import { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { validate } from "../../../middleware/validate";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendFile, sendOk } from "../../../utils/response";
import type { SchoolNeeds } from "../constants";
import { Guardian } from "../models/Guardian";
import { Student } from "../models/Student";
import type {
  AdmitStudentInput,
  ExportStudentsQuery,
  ImportStudentsInput,
  ListStudentsQuery,
  LookupGuardianInput,
  MoveStudentInput,
  UpdateGuardianInput,
  UpdateStudentInput,
  UpdateStudentSettingsInput,
} from "../schemas/students.schemas";
import { StudentSettingsService } from "../services/settings.service";

/** How many students the Export screen's preview shows. */
const EXPORT_PREVIEW_ROWS = 5;
import { AdmissionService } from "../services/admission.service";
import { CapacityService } from "../services/capacity.service";
import { GuardianService } from "../services/guardian.service";
import { ImportService } from "../services/import.service";
import { GUARDIAN_NOT_FOUND, STUDENT_NOT_FOUND } from "../services/shared";
import { readStudentSheet } from "../services/sheetReader";
import { SpreadsheetService } from "../services/spreadsheet.service";
import { StudentService } from "../services/student.service";

/** The caller's own school, taken from the signed-in user, never from the request. */
function tenantOf(req: Request): string {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
}

const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
const body = <T>(req: Request) => req.validatedBody as T;

/**
 * 404 before 400: a student (or guardian) that is not this school's is "not found" whatever the body says, so a wrong body never
 * tells another school anything. Runs after the id is validated and before the body is.
 */
export const studentExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await Student.exists({ _id: idOf(req), tenantId: tenantOf(req) }))) throw STUDENT_NOT_FOUND();
  next();
});

export const guardianExists = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!(await Guardian.exists({ _id: idOf(req), tenantId: tenantOf(req) }))) throw GUARDIAN_NOT_FOUND();
  next();
});

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StudentService.list(tenantOf(req), req.validatedQuery as ListStudentsQuery));
});

export const capacity = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await CapacityService.summary(tenantOf(req)));
});

export const getStudent = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StudentService.get(tenantOf(req), idOf(req)));
});

export const admitStudent = asyncHandler(async (req: Request, res: Response) => {
  const student = await AdmissionService.admit(tenantOf(req), body<AdmitStudentInput>(req));
  return sendCreated(res, student, `${student.name} admitted (${student.admissionNumber})`);
});

export const updateStudent = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StudentService.update(tenantOf(req), idOf(req), body<UpdateStudentInput>(req)), "Student updated");
});

export const moveStudent = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StudentService.move(tenantOf(req), idOf(req), body<MoveStudentInput>(req)), "Class updated");
});

export const lookupGuardian = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = body<LookupGuardianInput>(req);
  return sendOk(res, { guardian: await GuardianService.lookup(tenantOf(req), mobile) });
});

/** The sample spreadsheet for a bulk import, made for this school (its classes in the Class dropdown). */
export const importTemplate = asyncHandler(async (req: Request, res: Response) => {
  return sendFile(res, await SpreadsheetService.template(tenantOf(req)));
});

/** This year's students (or those the list's filters show) as a spreadsheet. */
export const exportStudents = asyncHandler(async (req: Request, res: Response) => {
  return sendFile(res, await SpreadsheetService.export(tenantOf(req), req.validatedQuery as ExportStudentsQuery));
});

/** An uploaded students file read into column titles and rows of text, for the screen to match the columns. Nothing is saved. */
export const readImportFile = asyncHandler(async (req: Request, res: Response) => {
  tenantOf(req);
  if (!req.file) {
    throw ApiError.badRequest("Choose a file to upload.", "IMPORT_FILE_MISSING", [{ path: "file", message: "Choose a file to upload" }]);
  }
  return sendOk(res, await readStudentSheet(req.file.originalname, req.file.buffer));
});

/** A part of a bulk import: checked (`dryRun`) or admitted, row by row. */
export const importStudents = asyncHandler(async (req: Request, res: Response) => {
  const result = await ImportService.run(tenantOf(req), body<ImportStudentsInput>(req));
  return sendOk(res, result, result.dryRun ? `${result.ok} of ${result.results.length} rows can be admitted` : `${result.ok} admitted`);
});

/**
 * Validates the body with a schema made for this school's needs (its settings: which details the admission form needs, and its own
 * fields). One read of the settings, then the same validation as every route (400 with a message per box).
 */
export const validateForSchool = (schemaFor: (needs: SchoolNeeds) => ZodTypeAny) =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const needs = await StudentSettingsService.needs(tenantOf(req));
    validate(schemaFor(needs))(req, res, next);
  });

/** How this school keeps its students' records: what the admission form needs, and the export's columns. */
export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StudentSettingsService.get(tenantOf(req)));
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await StudentSettingsService.update(tenantOf(req), req.user?.userId ?? null, body<UpdateStudentSettingsInput>(req));
  return sendOk(res, settings, "Saved");
});

/** The first students of the export (every column's value) and how many there are, for the Export screen's preview. */
export const exportPreview = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await SpreadsheetService.rows(tenantOf(req), req.validatedQuery as ExportStudentsQuery, EXPORT_PREVIEW_ROWS));
});

export const updateGuardian = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await GuardianService.update(tenantOf(req), idOf(req), body<UpdateGuardianInput>(req)), "Guardian updated");
});
