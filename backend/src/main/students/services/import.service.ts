import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { Guardian } from "../models/Guardian";
import { needsForClass, STUDENT_FORM_FIELDS, type SchoolNeeds } from "../constants";
import {
  admitStudentSchema,
  customIssues,
  importAdmissionNumberSchema,
  missingForSchool,
  RULE_OF_PATH,
  type AdmitStudentInput,
  type ImportStudentsInput,
} from "../schemas/students.schemas";
import { AdmissionService, type AdmissionYear } from "./admission.service";
import { classNameOf } from "./classNames";
import { StudentSettingsService } from "./settings.service";

type Problem = { path: string; message: string };

/** What happened to one row of a file: in a check, whether it can be admitted; in an import, whether it was. */
export interface ImportRowResult {
  /** The row's number in the file, as sent. */
  row: number;
  ok: boolean;
  /** The refusal's code when a rule of the admission said no (SECTION_FULL, DUPLICATE_STUDENT, ADMISSION_NUMBER_TAKEN...). */
  code?: string;
  /** Why it cannot be (or was not) admitted, by box ("firstName", "guardians.0.mobile"...; "" for the row as a whole). */
  errors: Problem[];
  /** Things the person should know that do not stop the admission (a parent already in the school is linked). */
  warnings: string[];
  /** Import only: the student who was admitted. */
  student?: { id: string; name: string; admissionNumber: string };
}

export interface ImportResult {
  dryRun: boolean;
  results: ImportRowResult[];
  /** Rows that can be (check) or were (import) admitted, and the others. */
  ok: number;
  failed: number;
}

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");
const FIELD_LABEL = new Map<string, string>(STUDENT_FORM_FIELDS.map((f) => [f.key, f.label]));
/** A missing detail's path as its name: ["address", "city"] -> "City or village", ["guardians", 0, "occupation"] -> "Parent's occupation". */
function labelOfIssue(path: (string | number)[]): string {
  if (path[0] === "guardians") return FIELD_LABEL.get(path[2] === "occupation" ? "guardianOccupation" : "secondParent")!;
  const joined = path.join(".");
  return FIELD_LABEL.get(RULE_OF_PATH[joined] ?? joined) ?? joined;
}
const fromIssues = (issues: { path: (string | number)[]; message: string }[]): Problem[] =>
  issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
const hasAnswer = (v: unknown) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");

/** A refusal of the admission rules, as the row's problems (the same words as the admission form gets). */
function fromApiError(err: ApiError): Problem[] {
  // The same child twice: the server's sentence names the student already admitted, which says more than "may already be admitted".
  if (err.code === "DUPLICATE_STUDENT") return [{ path: "", message: err.message }];
  const details = Array.isArray(err.details) ? (err.details as Partial<Problem>[]) : [];
  const listed = details.filter((d): d is Problem => typeof d.path === "string" && typeof d.message === "string").map(({ path, message }) => ({ path, message }));
  return listed.length > 0 ? listed : [{ path: "", message: err.message }];
}

export class ImportService {
  /**
   * A part of a bulk import (up to 100 rows), one row after another. Each row is an admission like the form's, checked by the same
   * schema and the same rules (AdmissionService.plan), with two differences that suit a school bringing in the students it already has:
   *  - a parent whose mobile number the school already has is LINKED to the child as they are saved (never copied, never changed), and
   *    the row says so in a warning: the second, third... child of a family, or a brother in the same file;
   *  - the school may keep the admission number it already gave the student.
   * A row that cannot be admitted is reported and the others go on. With `dryRun` nothing is written (seats are only counted at the
   * import, where `allowOverCapacity` is the person's answer to "some sections would go over their seats"). A school with no academic
   * year is refused as a whole (409 NO_ACTIVE_YEAR).
   */
  static async run(tenantId: string, input: ImportStudentsInput): Promise<ImportResult> {
    const school = new Types.ObjectId(tenantId);
    const year = await AdmissionService.activeYear(school);
    const needs = await StudentSettingsService.needs(tenantId);
    // The name of each class a row goes into, read once (rows of one file go into few classes).
    const classes = new Map<string, string | null>();
    const className = async (classId: string) => {
      if (!classes.has(classId)) classes.set(classId, await classNameOf(school, classId));
      return classes.get(classId) ?? null;
    };
    const results: ImportRowResult[] = [];
    for (const row of input.rows) results.push(await ImportService.one(tenantId, school, year, row, input, needs, className));
    const ok = results.filter((r) => r.ok).length;
    return { dryRun: input.dryRun, results, ok, failed: results.length - ok };
  }

  private static async one(
    tenantId: string,
    school: Types.ObjectId,
    year: AdmissionYear,
    row: ImportStudentsInput["rows"][number],
    input: ImportStudentsInput,
    needs: SchoolNeeds,
    className: (classId: string) => Promise<string | null>
  ): Promise<ImportRowResult> {
    const errors: Problem[] = [];
    const warnings: string[] = [];

    let admissionNumber: string | null = null;
    if (row.admissionNumber !== undefined && row.admissionNumber !== null && row.admissionNumber !== "") {
      const parsed = importAdmissionNumberSchema.safeParse(row.admissionNumber);
      if (parsed.success) admissionNumber = parsed.data;
      else errors.push(...fromIssues(parsed.error.issues).map((p) => ({ ...p, path: "admissionNumber" })));
    }
    const parsed = admitStudentSchema.safeParse({ ...row.student, allowOverCapacity: input.allowOverCapacity, confirmNotDuplicate: false });
    if (!parsed.success) errors.push(...fromIssues(parsed.error.issues));
    // Answers to the school's own fields are checked like the form's (a row that gives one wrong is refused; one not given is said below).
    if (parsed.success) errors.push(...fromIssues(customIssues(parsed.data.custom, needs.custom, "format")));
    if (!parsed.success || errors.length > 0) return { row: row.row, ok: false, errors, warnings };

    const student: AdmitStudentInput = parsed.data;
    // What the school's admission form needs but the row lacks (the address, the previous school of a student of Class 1 to 12, the IDs...):
    // said, never refused. A school brings in the students it already has, and an old register seldom holds every detail; the student's
    // page shows what is still to fill in. A detail that IS given is still checked (a PIN code of 5 digits is refused above).
    const rules = needsForClass(needs, await className(student.classId)).rules;
    const ownLacking = needs.custom.filter((f) => f.mode === "required" && f.type !== "yesNo" && !hasAnswer(student.custom?.[f.key])).map((f) => f.label);
    const lacks = [...new Set([...missingForSchool(student, rules).map((issue) => labelOfIssue(issue.path)), ...ownLacking])];
    if (lacks.length > 0) warnings.push(`Not in the file, but your school needs it: ${lacks.join(", ")}.`);
    // A parent the school already has (another child, or a brother earlier in this file) is linked as saved.
    for (const [index, guardian] of student.guardians.entries()) {
      if (guardian.guardianId || !guardian.mobile) continue;
      const existing = await Guardian.findOne({ tenantId: school, mobile: guardian.mobile }).select("name").lean();
      if (!existing) continue;
      student.guardians[index] = { ...guardian, guardianId: existing._id.toString(), updateDetails: false, name: existing.name };
      const otherName = tidy(guardian.name).toLowerCase() !== existing.name.toLowerCase() ? ` The name in the file (${guardian.name}) is not used.` : "";
      warnings.push(`${existing.name} (${guardian.mobile}) is already in your school: linked as saved.${otherName}`);
    }

    try {
      if (input.dryRun) {
        // Every check of an admission, without the seats (they are counted for the whole file on the screen) and without writing.
        await AdmissionService.plan(school, year, { ...student, allowOverCapacity: true }, admissionNumber);
        return { row: row.row, ok: true, errors, warnings };
      }
      const made = await AdmissionService.admitOne(tenantId, student, { admissionNumber });
      return { row: row.row, ok: true, errors, warnings, student: { id: made.id.toString(), name: made.name, admissionNumber: made.admissionNumber } };
    } catch (err) {
      if (err instanceof ApiError) return { row: row.row, ok: false, code: err.code, errors: fromApiError(err), warnings };
      throw err;
    }
  }
}
