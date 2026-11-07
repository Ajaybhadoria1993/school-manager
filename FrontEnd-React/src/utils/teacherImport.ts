import { STATES } from "../constants/schoolOptions";
import { TEACHER_IMPORT, TEACHER_LIMITS } from "../constants/teachers";
import type { EmploymentType, TeacherGender, TeacherImportRowInput } from "../types";
import { MAX_CUSTOM_LABEL, MAX_CUSTOM_TEXT, type CustomFieldDef } from "../constants/studentFields";
import { headerKey, maskDayInput, normaliseDay, normaliseGender, normaliseMobile, normaliseState, normaliseYesNo, tidy } from "./studentImport";
import { MESSAGES, emptyTeacherForm, isUsername, teacherProblems, type TeacherFormKey } from "./teachers";
import { isPasswordValid } from "./validators";

export { maskDayInput };

/**
 * Bringing many teachers in from a file (Teacher > Bulk upload): the columns of the file are recognised by their titles, each row is
 * judged by the rules of Add teacher (the same words) and sent to the server, which judges it again. Nothing here talks to the server.
 */

export type TeacherImportField =
  | "name"
  | "mobile"
  | "gender"
  | "dateOfBirth"
  | "email"
  | "address"
  | "city"
  | "state"
  | "pincode"
  | "employeeCode"
  | "designation"
  | "qualification"
  | "experienceYears"
  | "joiningDate"
  | "employmentType"
  | "subjects"
  | "username"
  | "password";

/** What kind of box the table shows for a column: free text, a day, or a list it suggests from. */
export type TeacherCellInput = "text" | "date" | "gender" | "state" | "employment" | "designation";

export interface TeacherFieldDef {
  key: TeacherImportField;
  label: string;
  input: TeacherCellInput;
  /** Needed for every teacher (green in the sample file). */
  required?: boolean;
  /** Other titles a school's own sheet may give the column (compared by `headerKey`). */
  synonyms: readonly string[];
}

/** The details a file can give, in the order of the sample file. */
export const TEACHER_IMPORT_FIELDS: readonly TeacherFieldDef[] = [
  { key: "name", label: "Name", input: "text", required: true, synonyms: ["teachername", "staffname", "fullname", "employeename", "nameofteacher", "nameofstaff", "teacher", "staff"] },
  { key: "mobile", label: "Mobile", input: "text", required: true, synonyms: ["mobileno", "mobilenumber", "phone", "phoneno", "phonenumber", "contact", "contactno", "contactnumber", "cell", "whatsapp", "whatsappno"] },
  { key: "gender", label: "Gender", input: "gender", synonyms: ["sex"] },
  { key: "dateOfBirth", label: "Date of Birth", input: "date", synonyms: ["dob", "birthdate", "birthday", "dateofbirthddmmyyyy"] },
  { key: "email", label: "Email", input: "text", synonyms: ["emailid", "emailaddress", "mail", "mailid"] },
  { key: "address", label: "Address", input: "text", synonyms: ["addressline1", "street", "residence", "residentialaddress", "homeaddress", "permanentaddress"] },
  { key: "city", label: "City", input: "text", synonyms: ["town", "village", "cityvillage", "cityorvillage"] },
  { key: "state", label: "State", input: "state", synonyms: [] },
  { key: "pincode", label: "PIN Code", input: "text", synonyms: ["pin", "zip", "zipcode", "postalcode", "postcode"] },
  { key: "employeeCode", label: "Employee Code", input: "text", synonyms: ["empcode", "employeeid", "empid", "staffid", "staffcode", "teacherid", "teachercode", "code"] },
  { key: "designation", label: "Designation", input: "designation", synonyms: ["post", "position", "role", "jobtitle", "title"] },
  { key: "qualification", label: "Qualification", input: "text", synonyms: ["qualifications", "education", "degree", "educationalqualification"] },
  { key: "experienceYears", label: "Experience (years)", input: "text", synonyms: ["experience", "yearsofexperience", "exp", "totalexperience", "experienceinyears", "expyears", "experienceyears"] },
  { key: "joiningDate", label: "Joining Date", input: "date", synonyms: ["dateofjoining", "doj", "joined", "joindate", "dateofjoin"] },
  { key: "employmentType", label: "Employment Type", input: "employment", synonyms: ["jobtype", "type", "stafftype", "employmentstatus", "natureofjob"] },
  { key: "subjects", label: "Subjects", input: "text", synonyms: ["subject", "subjectstaught", "teachingsubjects", "subjectsteaching", "canteach"] },
  { key: "username", label: "Username", input: "text", synonyms: ["userid", "user", "loginid", "login", "loginname"] },
  { key: "password", label: "Password", input: "text", synonyms: ["pass", "pwd", "initialpassword"] },
];

export const teacherFieldDef = (key: TeacherImportField) => TEACHER_IMPORT_FIELDS.find((f) => f.key === key)!;
/** The title of a column the page adds: the sample file's own ("Name *"). */
export const teacherHeading = (key: TeacherImportField) => {
  const def = teacherFieldDef(key);
  return def.required ? `${def.label} *` : def.label;
};

/** Which column of the file holds each detail (null: none). A detail is in one column only. */
export type TeacherMapping = Record<TeacherImportField, number | null>;

export const emptyTeacherMapping = (): TeacherMapping => Object.fromEntries(TEACHER_IMPORT_FIELDS.map((f) => [f.key, null])) as TeacherMapping;

/** The details the columns are, by their titles: the sample file's own, then the usual names a school's sheet gives them. */
export function autoMapTeachers(headers: readonly string[]): TeacherMapping {
  const mapping = emptyTeacherMapping();
  headers.forEach((title, column) => {
    const key = headerKey(title);
    if (!key) return;
    const field = TEACHER_IMPORT_FIELDS.find((f) => mapping[f.key] === null && (headerKey(f.label) === key || f.synonyms.includes(key) || headerKey(`${f.label} *`) === key));
    if (field) mapping[field.key] = column;
  });
  return mapping;
}

/** What each column is, by position: a usual detail, or one of the school's own fields by its `c_` key. */
export function teacherFieldsByColumn(mapping: TeacherMapping, columns: number, ownColumns: Readonly<Record<string, number>> = {}): (string | null)[] {
  const byColumn: (string | null)[] = Array.from({ length: columns }, () => null);
  for (const f of TEACHER_IMPORT_FIELDS) {
    const column = mapping[f.key];
    if (column !== null && column < columns) byColumn[column] = f.key;
  }
  for (const [key, column] of Object.entries(ownColumns)) if (column < columns) byColumn[column] = key;
  return byColumn;
}

/** The names the usual details have (and the extras of the export): a field of the school's own may not take one. */
const RESERVED_NAMES = new Map<string, string>([...TEACHER_IMPORT_FIELDS.map((f) => f.label), "Status", "Class teacher of", "Classes given"].map((n) => [n.toLowerCase(), n] as [string, string]));
/** The usual detail called `name` (as the list writes it), whatever the case or the spaces; nothing when none has that name. */
export const teacherFieldNamed = (name: string): string | undefined => RESERVED_NAMES.get(tidy(name).toLowerCase());

/**
 * Which columns of a file are the school's own fields: a title that is the field's name (a file made from the sample file or from the
 * export has them). A column already read as a usual detail (`taken`) is left as it is.
 */
export function ownColumnsOf(headers: readonly string[], fields: readonly CustomFieldDef[], taken: ReadonlySet<number>): Record<string, number> {
  const found: Record<string, number> = {};
  for (const field of fields) {
    const column = headers.findIndex((title, i) => !taken.has(i) && !Object.values(found).includes(i) && headerKey(title) === headerKey(field.label));
    if (column >= 0) found[field.key] = column;
  }
  return found;
}

/** A column of the file that is not uploaded and could be made a field of the school's own, named as the file names it. */
export interface NewFieldCandidate {
  column: number;
  title: string;
}

/**
 * The columns that are not uploaded and have a name of their own to make a field of (not blank or "Column E", not a name the usual
 * details have, not one the school's fields have, each name once): what "Add them as your own fields" would make.
 */
export function newFieldCandidates(headers: readonly string[], byColumn: readonly (string | null)[], existing: readonly CustomFieldDef[]): NewFieldCandidate[] {
  const taken = new Set(existing.map((f) => f.label.toLowerCase()));
  const found: NewFieldCandidate[] = [];
  headers.forEach((raw, column) => {
    if (byColumn[column] !== null && byColumn[column] !== undefined) return;
    const title = tidy(raw);
    if (title.length < 2 || title.length > MAX_CUSTOM_LABEL || /[<>]/.test(title) || /^Column [A-Z]+$/.test(title)) return;
    if (teacherFieldNamed(title) || taken.has(title.toLowerCase())) return;
    taken.add(title.toLowerCase());
    found.push({ column, title });
  });
  return found;
}

/** Column `column` is now `field` (or nothing): the detail leaves its old column, and the column's old detail leaves it. */
export function assignTeacherColumn(mapping: TeacherMapping, column: number, field: TeacherImportField | null): TeacherMapping {
  const next = { ...mapping };
  for (const f of TEACHER_IMPORT_FIELDS) if (next[f.key] === column) next[f.key] = null;
  if (field) next[field] = column;
  return next;
}

/** The details every teacher needs that the file has no column for: they are added empty, so the table says what to type. */
export const teacherColumnsToAdd = (mapping: TeacherMapping): TeacherImportField[] => TEACHER_IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] === null).map((f) => f.key);

// ---- Turning what was typed into what the server takes ------------------------------------------------------------------------------------

const EMPLOYMENT: { value: EmploymentType; label: string; words: string[] }[] = [
  { value: "full_time", label: "Full time", words: ["full time", "fulltime", "ft", "permanent", "regular", "full"] },
  { value: "part_time", label: "Part time", words: ["part time", "parttime", "pt", "part"] },
  { value: "contract", label: "Contract", words: ["contract", "contractual", "contract basis", "temporary", "guest", "visiting", "adhoc", "ad hoc"] },
];
const employmentOf = (raw: string) => {
  const word = tidy(raw).toLowerCase().replace(/[-_]+/g, " ");
  return EMPLOYMENT.find((e) => e.words.includes(word)) ?? null;
};

const GENDERS: readonly TeacherGender[] = ["Male", "Female", "Other"];
const EXPERIENCE = /^(\d+)(?:\.0+)?\s*(?:years?|yrs?|y)?\.?$/i;
const shownDay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : iso);

/** The subjects of a cell: separated by a comma, semicolon, slash or line, each once (capitals do not matter), as typed. */
export function splitSubjects(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[,;/|\n]+/)
    .map(tidy)
    .filter((name) => {
      if (!name || seen.has(name.toLowerCase())) return false;
      seen.add(name.toLowerCase());
      return true;
    });
}

/**
 * A box as it is shown once it is kept: a mobile number as its 10 digits, a day as DD-MM-YYYY, a state, gender or kind of job by the name
 * the list has, a code in capitals. What cannot be read is left as it is, so the row says what is wrong with it.
 */
export function normaliseTeacherCell(field: TeacherImportField, raw: string): string {
  switch (field) {
    case "mobile": {
      const digits = normaliseMobile(raw);
      return digits === "" && raw.trim() !== "" ? raw : digits;
    }
    case "gender":
      return normaliseGender(raw);
    case "dateOfBirth":
    case "joiningDate":
      return shownDay(normaliseDay(raw));
    case "state":
      return normaliseState(raw);
    case "employeeCode":
      return tidy(raw).toUpperCase();
    case "experienceYears": {
      const years = EXPERIENCE.exec(tidy(raw));
      return years ? years[1] : tidy(raw);
    }
    case "employmentType":
      return employmentOf(raw)?.label ?? tidy(raw);
    case "subjects":
      return splitSubjects(raw).join(", ");
    case "username":
      return raw.trim().toLowerCase();
    case "pincode":
      return tidy(raw).replace(/\.0+$/, "");
    case "password":
      return raw;
    default:
      return tidy(raw);
  }
}

// ---- The school's own fields --------------------------------------------------------------------------------------------------------------

/** A calendar day typed as 2015-05-14: a real one. */
const isRealDay = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) === iso;
const numberOf = (raw: string): number | null => {
  const text = raw.replace(/[,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(text) && Math.abs(Number(text)) <= 1e12 ? Number(text) : null;
};
const choiceOf = (field: CustomFieldDef, raw: string) => field.options.find((o) => o.toLowerCase() === tidy(raw).toLowerCase());

/** An answer to one of the school's own fields as it is shown once kept: a choice by the name of the list, a yes / no as Yes or No, a day as DD-MM-YYYY. */
export function normaliseOwnCell(field: CustomFieldDef, raw: string): string {
  if (raw.trim() === "") return "";
  switch (field.type) {
    case "number": {
      const n = numberOf(raw);
      return n === null ? tidy(raw) : String(n);
    }
    case "date":
      return shownDay(normaliseDay(raw));
    case "yesNo": {
      const answer = normaliseYesNo(raw);
      return answer === null ? tidy(raw) : answer ? "Yes" : "No";
    }
    case "choice":
      return choiceOf(field, raw) ?? tidy(raw);
    default:
      return tidy(raw);
  }
}

/** An answer to one of the school's own fields, read as the server keeps it, or what is wrong with it (the server's words). An empty box gives nothing. */
export function readOwnAnswer(field: CustomFieldDef, raw: string): { value: string | number | boolean } | { problem: string } | null {
  const text = tidy(raw);
  if (text === "") return null;
  switch (field.type) {
    case "number": {
      const n = numberOf(text);
      return n === null ? { problem: `Enter a number for ${field.label}` } : { value: n };
    }
    case "date": {
      const iso = normaliseDay(text);
      return isRealDay(iso) ? { value: iso } : { problem: `Choose a valid date for ${field.label}` };
    }
    case "yesNo": {
      const answer = normaliseYesNo(text);
      return answer === null ? { problem: "Say yes or no" } : { value: answer };
    }
    case "choice": {
      const option = choiceOf(field, text);
      return option ? { value: option } : { problem: `Choose the ${field.label} from the list` };
    }
    default:
      if (text.length > MAX_CUSTOM_TEXT) return { problem: `Keep the ${field.label} under ${MAX_CUSTOM_TEXT} characters` };
      return /[<>]/.test(text) ? { problem: `The ${field.label} cannot contain < or >` } : { value: text };
  }
}

/** A column of the file that is one of the school's own fields. */
export interface OwnColumn {
  field: CustomFieldDef;
  column: number;
}

// ---- A row ----------------------------------------------------------------------------------------------------------------------------------

/** A detail of a row that needs a fix, with the boxes (details) it is in, so the table can take the person to one. */
export interface TeacherRowProblem {
  label: string;
  message: string;
  /** Usual details, or the `c_` keys of the school's own fields. */
  fields: string[];
}

export interface PreparedTeacher {
  row: number;
  name: string;
  /** The 10 digits, as far as the box could be read. */
  mobile: string;
  employeeCode: string;
  username: string;
  email: string;
  problems: TeacherRowProblem[];
  /** Things to know that do not stop the row (a subject that is new to the school). */
  warnings: string[];
  subjects: string[];
  /** What is sent for this row (only worth sending when there is no problem). */
  input: TeacherImportRowInput;
}

/** The mobile number of a teacher whose login needs it: what the server says too. */
export const NEEDS_MOBILE = "Enter the teacher's mobile number: their login needs it";
const CODE_MESSAGE = `The employee code is letters, digits and - only, up to ${TEACHER_LIMITS.employeeCode}`;

const LABELS: Record<TeacherImportField, string> = {
  name: "Name",
  mobile: "Mobile",
  gender: "Gender",
  dateOfBirth: "Date of birth",
  email: "Email",
  address: "Address",
  city: "City",
  state: "State",
  pincode: "PIN code",
  employeeCode: "Employee code",
  designation: "Designation",
  qualification: "Qualification",
  experienceYears: "Experience",
  joiningDate: "Joining date",
  employmentType: "Employment type",
  subjects: "Subjects",
  username: "Username",
  password: "Password",
};

/** The form's key for a detail, to ask `teacherProblems` about it. */
const FORM_KEY: Partial<Record<TeacherFormKey, TeacherImportField>> = {
  name: "name",
  mobile: "mobile",
  email: "email",
  dateOfBirth: "dateOfBirth",
  joiningDate: "joiningDate",
  pincode: "pincode",
  experienceYears: "experienceYears",
};

/** A text box held to the server's rules: its length, and no angle brackets. */
const TEXT_RULES: [TeacherImportField, string, number][] = [
  ["name", "teacher's name", TEACHER_LIMITS.name],
  ["address", "address", 200],
  ["city", "city", 80],
  ["designation", "designation", TEACHER_LIMITS.designation],
  ["qualification", "qualification", TEACHER_LIMITS.qualification],
];

const problem = (field: TeacherImportField, message: string): TeacherRowProblem => ({ label: LABELS[field], message, fields: [field] });

/**
 * One row of the table as a teacher: the boxes read as they are meant, what is wrong with them, and what would be sent. `knownSubjects` are
 * the school's subject names in lower case (a subject not among them is said to be new; null: not known yet).
 */
export function prepareTeacherRow(row: { row: number; cells: string[] }, mapping: TeacherMapping, knownSubjects: ReadonlySet<string> | null, ownColumns: readonly OwnColumn[] = []): PreparedTeacher {
  const text = (field: TeacherImportField) => {
    const column = mapping[field];
    return column === null ? "" : (row.cells[column] ?? "");
  };
  const value = (field: TeacherImportField) => normaliseTeacherCell(field, text(field));

  const name = value("name");
  const mobile = value("mobile");
  const gender = value("gender");
  const state = value("state");
  const employment = employmentOf(text("employmentType"));
  const subjects = splitSubjects(text("subjects"));
  const username = value("username");
  const password = text("password");
  const email = tidy(text("email")).toLowerCase();
  const experience = value("experienceYears");

  const found = new Map<TeacherImportField, TeacherRowProblem>();
  // The form's own rules, for the boxes the form has.
  const form = {
    ...emptyTeacherForm(),
    name,
    mobile,
    email,
    dateOfBirth: normaliseDay(text("dateOfBirth")),
    joiningDate: normaliseDay(text("joiningDate")),
    pincode: value("pincode"),
    experienceYears: experience,
  };
  for (const [key, message] of Object.entries(teacherProblems(form, { login: false }))) {
    const field = FORM_KEY[key as TeacherFormKey];
    if (field && message) found.set(field, problem(field, message));
  }
  if (mobile === "") found.set("mobile", problem("mobile", NEEDS_MOBILE));
  if (gender !== "" && !(GENDERS as readonly string[]).includes(gender)) found.set("gender", problem("gender", MESSAGES.gender));
  if (state !== "" && !(STATES as readonly string[]).includes(state)) found.set("state", problem("state", "Choose the state"));
  if (text("employmentType").trim() !== "" && !employment) found.set("employmentType", problem("employmentType", "Choose full time, part time or contract"));
  const code = value("employeeCode");
  if (code !== "" && !new RegExp(`^[A-Z0-9-]{1,${TEACHER_LIMITS.employeeCode}}$`).test(code)) found.set("employeeCode", problem("employeeCode", CODE_MESSAGE));
  for (const [field, what, max] of TEXT_RULES) {
    if (found.has(field)) continue;
    const typed = value(field);
    if (typed.length > max) found.set(field, problem(field, `Keep the ${what} under ${max} characters`));
    else if (/[<>]/.test(typed)) found.set(field, problem(field, `The ${what} cannot contain < or >`));
  }
  if (subjects.length > TEACHER_IMPORT.maxSubjects) found.set("subjects", problem("subjects", `Up to ${TEACHER_IMPORT.maxSubjects} subjects`));
  else if (subjects.some((s) => s.length > 40)) found.set("subjects", problem("subjects", "Keep the subject name under 40 characters"));
  else if (subjects.some((s) => /[<>]/.test(s))) found.set("subjects", problem("subjects", "The subject name cannot contain < or >"));
  if (username !== "" && !isUsername(username)) found.set("username", problem("username", MESSAGES.username));
  if (password !== "" && !isPasswordValid(password)) found.set("password", problem("password", MESSAGES.password));

  const problems: TeacherRowProblem[] = TEACHER_IMPORT_FIELDS.flatMap((f) => (found.has(f.key) ? [found.get(f.key)!] : []));
  // The answers to the school's own fields: what the file gives is read by the kind of the field and checked; what it lacks is never a problem.
  const custom: Record<string, string | number | boolean> = {};
  for (const { field, column } of ownColumns) {
    const answer = readOwnAnswer(field, row.cells[column] ?? "");
    if (!answer) continue;
    if ("problem" in answer) problems.push({ label: field.label, message: answer.problem, fields: [field.key] });
    else custom[field.key] = answer.value;
  }
  // Before the school's subjects are known nothing is said about new ones.
  const fresh = knownSubjects ? subjects.filter((s) => !knownSubjects.has(s.toLowerCase())) : [];
  const warnings = fresh.length > 0 ? [`New subject${fresh.length === 1 ? "" : "s"}, added to your school: ${fresh.join(", ")}`] : [];

  // What is sent: only the boxes the file gave.
  const address = Object.fromEntries(
    ([["line1", value("address")], ["city", value("city")], ["state", state], ["pincode", value("pincode")]] as const).filter(([, v]) => v !== "")
  );
  const years = EXPERIENCE.exec(experience);
  const teacher: TeacherImportRowInput["teacher"] = {
    name,
    mobile,
    ...(gender !== "" ? { gender: gender as TeacherGender } : {}),
    ...(form.dateOfBirth !== "" ? { dateOfBirth: form.dateOfBirth } : {}),
    ...(email !== "" ? { email } : {}),
    ...(Object.keys(address).length > 0 ? { address } : {}),
    ...(code !== "" ? { employeeCode: code } : {}),
    ...(value("designation") !== "" ? { designation: value("designation") } : {}),
    ...(value("qualification") !== "" ? { qualification: value("qualification") } : {}),
    ...(years ? { experienceYears: Number(years[1]) } : {}),
    ...(form.joiningDate !== "" ? { joiningDate: form.joiningDate } : {}),
    ...(employment ? { employmentType: employment.value } : {}),
    ...(Object.keys(custom).length > 0 ? { custom } : {}),
  };
  return {
    row: row.row,
    name,
    mobile,
    employeeCode: code,
    username,
    email,
    problems,
    warnings,
    subjects,
    input: { row: row.row, teacher, subjectNames: subjects, ...(username !== "" ? { username } : {}), ...(password !== "" ? { password } : {}) },
  };
}

/**
 * The same teacher twice in the file: a mobile number, employee code, username or email that an earlier row has. The later row is the one
 * marked (the rows already uploaded from the file come first in `rows`, so a row left that repeats one of them is marked too).
 */
export function crossCheckTeachers(rows: readonly PreparedTeacher[]): Map<number, TeacherRowProblem[]> {
  const checks: { field: TeacherImportField; what: string; keyOf: (p: PreparedTeacher) => string }[] = [
    { field: "mobile", what: "mobile number", keyOf: (p) => p.mobile },
    { field: "employeeCode", what: "employee code", keyOf: (p) => p.employeeCode },
    { field: "username", what: "username", keyOf: (p) => p.username },
    { field: "email", what: "email", keyOf: (p) => p.email },
  ];
  const first = checks.map(() => new Map<string, number>());
  const found = new Map<number, TeacherRowProblem[]>();
  for (const p of rows) {
    checks.forEach((check, i) => {
      const key = check.keyOf(p);
      if (!key) return;
      const earlier = first[i].get(key);
      if (earlier === undefined) first[i].set(key, p.row);
      else found.set(p.row, [...(found.get(p.row) ?? []), { label: LABELS[check.field], message: `Same ${check.what} as row ${earlier}`, fields: [check.field] }]);
    });
  }
  return found;
}

const SERVER_BOX: Record<string, TeacherImportField> = {
  name: "name",
  mobile: "mobile",
  gender: "gender",
  dateOfBirth: "dateOfBirth",
  email: "email",
  "address.line1": "address",
  "address.city": "city",
  "address.state": "state",
  "address.pincode": "pincode",
  employeeCode: "employeeCode",
  designation: "designation",
  qualification: "qualification",
  experienceYears: "experienceYears",
  joiningDate: "joiningDate",
  employmentType: "employmentType",
  subjects: "subjects",
  username: "username",
  password: "password",
};

/** What the server said about a box, put in the box it names (a refusal of the row as a whole belongs to no box). */
export function serverTeacherProblem(path: string, message: string, ownFields: readonly CustomFieldDef[] = []): TeacherRowProblem {
  const mine = path.startsWith("custom.") ? ownFields.find((f) => `custom.${f.key}` === path) : undefined;
  if (mine) return { label: mine.label, message, fields: [mine.key] };
  const field = SERVER_BOX[path];
  return field ? { label: LABELS[field], message, fields: [field] } : { label: "Row", message, fields: [] };
}

// ---- Files and parts ---------------------------------------------------------------------------------------------------------------------------

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** One teacher's login, to hand over. */
export interface TeacherLoginLine {
  name: string;
  mobile: string;
  username: string;
  password: string;
}

/** The logins just made, as a CSV (with a byte-order mark, so Excel reads it as UTF-8): who, how to sign in, with what. */
export function loginsCsv(rows: readonly TeacherLoginLine[], signInAt: string): Blob {
  const lines = [["Name", "Mobile", "Username", "Password", "Sign in at"], ...rows.map((r) => [r.name, r.mobile, r.username, r.password, signInAt])].map((line) => line.map(csvField).join(","));
  return new Blob([String.fromCharCode(0xfeff), lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

/** A file's rows in the parts the server takes (each request makes a login, and so a password's hash, for every row). */
export function inTeacherParts<T>(items: readonly T[]): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += TEACHER_IMPORT.rowsPerRequest) parts.push(items.slice(i, i + TEACHER_IMPORT.rowsPerRequest));
  return parts;
}
