import { ApiError } from "../../../utils/ApiError";
import { MAX_SUBJECT_NAME } from "../../subjects/constants";
import { label as subjectLabel } from "../../subjects/schemas/subjects.schemas";
import { SubjectService } from "../../subjects/services/subject.service";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { MAX_TEACHER_SUBJECTS } from "../constants";
import { createTeacherSchema, NEEDS_MOBILE_MESSAGE, type ImportTeachersInput } from "../schemas/staff.schemas";
import { TeacherSettingsService } from "./teacherSettings.service";
import { TeacherService } from "./teacher.service";

type Problem = { path: string; message: string };

/** What happened to one row of a file. */
export interface TeacherImportRowResult {
  /** The row's number in the file, as sent. */
  row: number;
  ok: boolean;
  /** The refusal's code when a rule said no (TEACHER_MOBILE_EXISTS, TEACHER_CODE_EXISTS...). */
  code?: string;
  /** Why the row was not made, by box ("name", "mobile", "address.pincode"...; "" for the row as a whole). */
  errors: Problem[];
  /** The teacher who was made. */
  teacher?: { id: string; name: string };
}

export interface TeacherImportResult {
  results: TeacherImportRowResult[];
  /** Rows that were made, and the others. */
  ok: number;
  failed: number;
}

const fromIssues = (issues: { path: (string | number)[]; message: string }[]): Problem[] => issues.map((i) => ({ path: i.path.join("."), message: i.message }));

/** A refusal of the rules of Add teacher, as the row's problems (the same words as the form gets). */
function fromApiError(err: ApiError): Problem[] {
  const details = Array.isArray(err.details) ? (err.details as Partial<Problem>[]) : [];
  const listed = details.filter((d): d is Problem => typeof d.path === "string" && typeof d.message === "string").map((d) => ({ path: d.path, message: d.message }));
  return listed.length > 0 ? listed : [{ path: "", message: err.message }];
}

export class TeacherImportService {
  /**
   * A part of a bulk upload (up to 10 rows), one row after another. Each row is a teacher as Add teacher takes one, judged by the same
   * schema and the same rules. A row makes no login (2026-11-26): the school gives it later from the teacher's page, by email. The subjects are named in words: a name the school has is that
   * subject, a name it has not becomes a new one. A row that cannot be made is reported by box and the others go on. A school's
   * teacher is known by the mobile number and the employee code (a repeated file adds nobody twice: each row says who already has its
   * mobile number). Everything about a row is checked before anything of it is made.
   */
  static async run(tenantId: string, input: ImportTeachersInput): Promise<TeacherImportResult> {
    const results: TeacherImportRowResult[] = [];
    for (const row of input.rows) results.push(await TeacherImportService.one(tenantId, row));
    const ok = results.filter((r) => r.ok).length;
    return { results, ok, failed: results.length - ok };
  }

  private static async one(tenantId: string, row: ImportTeachersInput["rows"][number]): Promise<TeacherImportRowResult> {
    const refused = (errors: Problem[], code?: string): TeacherImportRowResult => ({ row: row.row, ok: false, ...(code ? { code } : {}), errors });

    // The subjects, as words: each a valid subject name, once, and not more than a teacher may have.
    const errors: Problem[] = [];
    const names = new Map<string, string>();
    for (const raw of row.subjectNames) {
      if (raw.trim() === "") continue;
      const name = subjectLabel("subject name", MAX_SUBJECT_NAME).safeParse(raw);
      if (!name.success) errors.push({ path: "subjects", message: name.error.issues[0].message });
      else names.set(nameKeyOf(name.data), name.data);
    }
    if (names.size > MAX_TEACHER_SUBJECTS) errors.push({ path: "subjects", message: `Up to ${MAX_TEACHER_SUBJECTS} subjects` });

    // The boxes, like Add teacher's. A row makes no login (2026-11-26): the school gives one later, by email, from the teacher's page.
    const parsed = createTeacherSchema.safeParse({ ...row.teacher, subjectIds: [], giveLogin: false });
    if (!parsed.success) errors.push(...fromIssues(parsed.error.issues));
    // The mobile number is how a file's teacher is known again (a repeated file adds nobody twice), so every row needs one.
    if (parsed.success && !parsed.data.mobile) errors.push({ path: "mobile", message: NEEDS_MOBILE_MESSAGE });
    if (!parsed.success || errors.length > 0) return refused(errors);
    const teacher = parsed.data;

    try {
      // Everything that can be checked is checked before a subject is made: a refused row leaves nothing behind.
      await TeacherService.assertFree(tenantId, teacher.mobile ?? null, teacher.employeeCode ?? null, null, teacher.email ?? null);
      // The answers to the school's own fields: what a row gives is checked; what it lacks never stops it (an old register seldom has it all).
      await TeacherSettingsService.check(tenantId, teacher.custom, "format");
      const subjectIds = names.size > 0 ? await SubjectService.idsByNames(tenantId, [...names.values()]) : [];
      const made = await TeacherService.create(tenantId, { ...teacher, subjectIds }, { custom: "format" });
      return { row: row.row, ok: true, errors: [], teacher: { id: made.id, name: made.name } };
    } catch (err) {
      if (err instanceof ApiError) return refused(fromApiError(err), err.code);
      throw err;
    }
  }
}
