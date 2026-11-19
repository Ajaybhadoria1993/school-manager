import type { FieldMode } from "./studentFields";

/**
 * The usual details of a teacher the school decides about (Teacher > Manage fields): needed, optional or not asked. The same list as the
 * server's `TEACHER_DETAILS` (backend/src/main/staff/constants.ts). The name, the mobile number (the login needs it) and the gender are
 * always asked, so they are not here. Each is also a column of the Excel under the same key.
 */
export const TEACHER_DETAILS = [
  { key: "dateOfBirth", label: "Date of birth", group: "Personal" },
  { key: "email", label: "Email", group: "Personal" },
  { key: "address", label: "House and street", group: "Address" },
  { key: "city", label: "City or village", group: "Address" },
  { key: "state", label: "State", group: "Address" },
  { key: "pincode", label: "PIN code", group: "Address" },
  { key: "employeeCode", label: "Employee code", group: "Job" },
  { key: "designation", label: "Designation", group: "Job" },
  { key: "qualification", label: "Qualification", group: "Job" },
  { key: "experienceYears", label: "Experience (years)", group: "Job" },
  { key: "joiningDate", label: "Joining date", group: "Job" },
  { key: "employmentType", label: "Employment type", group: "Job" },
  { key: "subjects", label: "Subjects they can teach", group: "Teaching" },
] as const;
export type TeacherDetailKey = (typeof TEACHER_DETAILS)[number]["key"];
export type TeacherFieldRules = Record<TeacherDetailKey, FieldMode>;

/** A new school asks every detail and needs none (as Add teacher always did). */
export const DEFAULT_TEACHER_RULES: TeacherFieldRules = Object.fromEntries(TEACHER_DETAILS.map((d) => [d.key, "optional"])) as TeacherFieldRules;

export interface TeacherColumnDef {
  key: string;
  /** The heading a new school's file has. */
  heading: string;
  group: string;
  /** In every export (the name and the mobile number: the upload needs them). */
  locked?: true;
  /** Only says more about the teacher: an upload does not read it. */
  extra?: true;
}

/** The columns the teachers' Excel can have, in the order of a new school's file (the server's `TEACHER_EXPORT_COLUMNS`). */
export const TEACHER_COLUMNS: readonly TeacherColumnDef[] = [
  { key: "name", heading: "Name", group: "Personal", locked: true },
  { key: "mobile", heading: "Mobile", group: "Personal", locked: true },
  { key: "gender", heading: "Gender", group: "Personal" },
  { key: "dateOfBirth", heading: "Date of Birth", group: "Personal" },
  { key: "email", heading: "Email", group: "Personal" },
  { key: "address", heading: "Address", group: "Address" },
  { key: "city", heading: "City", group: "Address" },
  { key: "state", heading: "State", group: "Address" },
  { key: "pincode", heading: "PIN Code", group: "Address" },
  { key: "employeeCode", heading: "Employee Code", group: "Job" },
  { key: "designation", heading: "Designation", group: "Job" },
  { key: "qualification", heading: "Qualification", group: "Job" },
  { key: "experienceYears", heading: "Experience (years)", group: "Job" },
  { key: "joiningDate", heading: "Joining Date", group: "Job" },
  { key: "employmentType", heading: "Employment Type", group: "Job" },
  { key: "subjects", heading: "Subjects", group: "Teaching" },
  { key: "username", heading: "Username", group: "Login" },
  { key: "status", heading: "Status", group: "About the teacher", extra: true },
  { key: "classTeacherOf", heading: "Class teacher of", group: "About the teacher", extra: true },
  { key: "given", heading: "Classes given", group: "About the teacher", extra: true },
];

export const teacherColumnOf = (key: string) => TEACHER_COLUMNS.find((c) => c.key === key);
