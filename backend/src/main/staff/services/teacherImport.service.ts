import { ApiError } from "../../../utils/ApiError";
import { generatePassword } from "../../../utils/authUtils";
import { MAX_SUBJECT_NAME } from "../../subjects/constants";
import { label as subjectLabel } from "../../subjects/schemas/subjects.schemas";
import { SubjectService } from "../../subjects/services/subject.service";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { MAX_TEACHER_SUBJECTS } from "../constants";
import { createTeacherSchema, type ImportTeachersInput } from "../schemas/staff.schemas";
import { TeacherLogin } from "./teacherLogin.service";
import { TeacherSettingsService } from "./teacherSettings.service";
import { TeacherService } from "./teacher.service";
import { freeUsernameFor } from "./usernames.service";

type Problem = { path: string; message: string };

/** What happened to one row of a file. */
export interface TeacherImportRowResult {
  /** The row's number in the file, as sent. */
  row: number;
  ok: boolean;
  /** The refusal's code when a rule said no (TEACHER_MOBILE_EXISTS, TEACHER_CODE_EXISTS, USERNAME_TAKEN, LOGIN_EMAIL_TAKEN...). */
  code?: string;
  /** Why the row was not made, by box ("name", "mobile", "address.pincode", "username"...; "" for the row as a whole). */
  errors: Problem[];
  /** The teacher who was made. */
  teacher?: { id: string; name: string };
  /**
   * The login that was made. `password` is there only when it was made up here (the school has to be told it, this once: only its hash is
   * kept); a password the file gave is the school's own and is not sent back.
   */
  login?: { username: string; password: string | null };
}

export interface TeacherImportResult {
  results: TeacherImportRowResult[];
  /** Rows that were made, and the others. */
  ok: number;
  failed: number;
}

/** A box as the screen names it: the login's boxes are the row's own username and password. */
const boxOf = (path: string) => (path === "login.username" ? "username" : path === "login.password" ? "password" : path);

const fromIssues = (issues: { path: (string | number)[]; message: string }[]): Problem[] => issues.map((i) => ({ path: boxOf(i.path.join(".")), message: i.message }));

/** A refusal of the rules of Add teacher, as the row's problems (the same words as the form gets). */
function fromApiError(err: ApiError): Problem[] {
  const details = Array.isArray(err.details) ? (err.details as Partial<Problem>[]) : [];
  const listed = details.filter((d): d is Problem => typeof d.path === "string" && typeof d.message === "string").map((d) => ({ path: boxOf(d.path), message: d.message }));
  return listed.length > 0 ? listed : [{ path: "", message: err.message }];
}

// Stand-ins for a login the file does not give: the teacher's boxes are judged first, and the real username and password are made after.
const STAND_IN = { username: "stand.in", password: "Stand@In1" };

export class TeacherImportService {
  /**
   * A part of a bulk upload (up to 10 rows), one row after another. Each row is a teacher as Add teacher takes one, judged by the same
   * schema and the same rules, with a login in the same step: the username and the password the file gives, or ones made up (the username
   * from the name, `meena.singh_41`; a password of 10 characters). The subjects are named in words: a name the school has is that
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

    // The boxes, like Add teacher's, with the login the file gives (or a stand-in, so the teacher's own boxes are judged either way).
    const username = row.username?.trim() ? row.username.trim() : null;
    const password = row.password !== undefined && row.password !== "" ? row.password : null;
    const parsed = createTeacherSchema.safeParse({
      ...row.teacher,
      subjectIds: [],
      login: { username: username ?? STAND_IN.username, password: password ?? STAND_IN.password },
    });
    if (!parsed.success) errors.push(...fromIssues(parsed.error.issues));
    if (!parsed.success || errors.length > 0) return refused(errors);
    const teacher = parsed.data;

    // The login: the one the file gives, or one made up (a name with no letters a-z gives nothing to make a username from).
    const login = {
      username: username ? teacher.login!.username : await freeUsernameFor(teacher.name),
      password: password ? teacher.login!.password : generatePassword(),
    };
    if (login.username === null) return refused([{ path: "username", message: "This name has no letters a-z to make a username from: type a username for the teacher" }]);

    try {
      // Everything that can be checked is checked before a subject is made: a refused row leaves nothing behind.
      await TeacherService.assertFree(tenantId, teacher.mobile ?? null, teacher.employeeCode ?? null, null);
      await TeacherLogin.assertFree(login.username, teacher.email ?? null);
      // The answers to the school's own fields: what a row gives is checked; what it lacks never stops it (an old register seldom has it all).
      await TeacherSettingsService.check(tenantId, teacher.custom, "format");
      const subjectIds = names.size > 0 ? await SubjectService.idsByNames(tenantId, [...names.values()]) : [];
      const made = await TeacherService.create(tenantId, { ...teacher, subjectIds, login: { username: login.username, password: login.password } }, { custom: "format" });
      return { row: row.row, ok: true, errors: [], teacher: { id: made.id, name: made.name }, login: { username: login.username, password: password ? null : login.password } };
    } catch (err) {
      if (err instanceof ApiError) return refused(fromApiError(err), err.code);
      throw err;
    }
  }
}
