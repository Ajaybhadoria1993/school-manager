import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { seatsHeldBySections } from "../../academics/services/seats";
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
import { seatsTaken } from "./placement";
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

/** A section whose seats were raised because the file brought more students than it had seats (and the class's, when its sections no longer fitted). */
export interface SeatsRaised {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  /** The section's seats before and after. */
  from: number;
  to: number;
  /** The class's seats before and after; null when the class had room enough and was not changed. */
  classFrom: number | null;
  classTo: number | null;
}

export interface ImportResult {
  dryRun: boolean;
  results: ImportRowResult[];
  /** Rows that can be (check) or were (import) admitted, and the others. */
  ok: number;
  failed: number;
  /** Import with `allowOverCapacity` only: the sections that were given more seats so that everyone admitted has one. Empty otherwise. */
  seatsRaised: SeatsRaised[];
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

/** The sections (once each) that the admitted rows of this request were put in. */
function sectionsOfAdmitted(input: ImportStudentsInput, results: ImportRowResult[]): string[] {
  const admitted = new Set(results.filter((r) => r.ok).map((r) => r.row));
  return [...new Set(input.rows.filter((r) => admitted.has(r.row) && r.student.sectionId).map((r) => String(r.student.sectionId)))];
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
    // The person said to go over the seats: nobody sits beyond them, the seats grow to hold everyone who was admitted.
    const seatsRaised = !input.dryRun && input.allowOverCapacity ? await ImportService.raiseSeats(school, year, sectionsOfAdmitted(input, results)) : [];
    return { dryRun: input.dryRun, results, ok, failed: results.length - ok, seatsRaised };
  }

  /**
   * Gives each of these sections as many seats as it has students now, when it has more students than seats (a section with no seat
   * limit is left alone), and the class as many as its sections hold together, when they no longer fit in it. A section is never
   * given fewer seats, and a class is never given fewer.
   */
  private static async raiseSeats(school: Types.ObjectId, year: AdmissionYear, sectionIds: string[]): Promise<SeatsRaised[]> {
    const raised: SeatsRaised[] = [];
    for (const sectionId of sectionIds) {
      const section = await Section.findOne({ _id: sectionId, tenantId: school, academicYearId: year._id }).select("classId name capacity").lean();
      if (!section || section.capacity == null) continue;
      const students = await seatsTaken(school, year._id, section._id);
      if (students <= section.capacity) continue;
      await Section.updateOne({ _id: section._id, tenantId: school }, { $set: { capacity: students } });

      const klass = await SchoolClass.findOne({ _id: section.classId, tenantId: school }).select("name capacity").lean();
      const held = await seatsHeldBySections(school.toString(), section.classId.toString(), year._id);
      const classRaised = !!klass && klass.capacity != null && held > klass.capacity;
      if (classRaised) await SchoolClass.updateOne({ _id: klass._id, tenantId: school }, { $set: { capacity: held } });
      raised.push({
        classId: section.classId.toString(),
        className: klass?.name ?? "",
        sectionId: section._id.toString(),
        sectionName: section.name,
        from: section.capacity,
        to: students,
        classFrom: classRaised ? klass.capacity! : null,
        classTo: classRaised ? held : null,
      });
    }
    return raised;
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
    const forClass = needsForClass(needs, await className(student.classId));
    const rules = forClass.rules;
    // A field of the school's own for some classes only (Stream: Class 11 and 12) is lacking only in a row of those classes.
    const ownLacking = forClass.custom.filter((f) => f.mode === "required" && f.type !== "yesNo" && !hasAnswer(student.custom?.[f.key])).map((f) => f.label);
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
