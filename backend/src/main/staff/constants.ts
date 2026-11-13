import type { FieldMode } from "../students/constants";
import type { UserRole } from "../users/models/User";

/**
 * Who may add teachers and change them. One list, so a role such as a "vice principal" is added by editing this one line. The routes and the
 * screens both follow it.
 */
export const STAFF_WRITERS = ["school_admin", "principal"] as const satisfies readonly UserRole[];
/** Who may look at the teachers: a teacher sees their colleagues. */
export const STAFF_READERS = ["school_admin", "principal", "teacher"] as const satisfies readonly UserRole[];

/** Hard limits, so one school cannot fill the database by accident. */
export const MAX_TEACHERS = 300;
export const MAX_TEACHER_NAME = 100;
export const MAX_EMPLOYEE_CODE = 20;
export const MAX_TEACHER_SUBJECTS = 30;
/** A teacher takes at most this many periods a day / a week (a guard against a mistyped number, not a policy). */
export const MAX_PERIODS_PER_DAY = 12;
export const MAX_PERIODS_PER_WEEK = 70;

export const MOBILE_MESSAGE = "Enter a 10-digit mobile number starting with 6, 7, 8 or 9";

/** What the school keeps about a teacher as a person and as an employee (all optional: a teacher is added with only a name if need be). */
export const TEACHER_GENDERS = ["Male", "Female", "Other"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const MAX_DESIGNATION = 60;
export const MAX_QUALIFICATION = 100;
export const MAX_EXPERIENCE_YEARS = 60;
/** A teacher is this old, in whole years, today. A guard against a mistyped year, not a policy. */
export const MIN_TEACHER_AGE = 18;
export const MAX_TEACHER_AGE = 75;
/** A teacher may be added before the day they join, but not further ahead than this many days (a mistyped year). */
export const MAX_DAYS_BEFORE_JOINING = 366;

/**
 * A bulk upload of teachers: a file holds at most as many as a school may have, and a request carries few rows because each teacher gets a
 * login and a password's hash is slow on purpose (the screen sends a file in parts and shows how far it is).
 */
export const MAX_TEACHER_IMPORT_ROWS = MAX_TEACHERS;
export const MAX_TEACHER_IMPORT_ROWS_PER_REQUEST = 10;

/** How a column of the teachers sheet is filled: the two the login needs, or optional. */
export type TeacherSheetKind = "required" | "optional";

export interface TeacherSheetColumn {
  key: string;
  /** The title in the sample file (a star is added to a required one). */
  header: string;
  kind: TeacherSheetKind;
  width: number;
  /** Shown on the title cell of the sample file. */
  note: string;
}

/** The columns of the teachers sample file, in order. */
export const TEACHER_SHEET_COLUMNS: readonly TeacherSheetColumn[] = [
  { key: "name", header: "Name", kind: "required", width: 26, note: "The teacher's full name." },
  { key: "mobile", header: "Mobile", kind: "required", width: 16, note: "10 digits, starting with 6, 7, 8 or 9. Every teacher gets a login, which needs it." },
  { key: "gender", header: "Gender", kind: "optional", width: 11, note: "Male, Female or Other." },
  { key: "dateOfBirth", header: "Date of Birth", kind: "optional", width: 14, note: "DD-MM-YYYY. The teacher must be 18 to 75 years old." },
  { key: "email", header: "Email", kind: "optional", width: 28, note: "One email can belong to one login only." },
  { key: "address", header: "Address", kind: "optional", width: 30, note: "House, street and area." },
  { key: "city", header: "City", kind: "optional", width: 16, note: "City or village." },
  { key: "state", header: "State", kind: "optional", width: 22, note: "Pick a state or union territory from the list." },
  { key: "pincode", header: "PIN Code", kind: "optional", width: 11, note: "6 digits." },
  { key: "employeeCode", header: "Employee Code", kind: "optional", width: 15, note: "Letters, digits and - only. Another teacher cannot have the same code." },
  { key: "designation", header: "Designation", kind: "optional", width: 26, note: "The post: PGT, TGT, PRT... Pick from the list or type your own." },
  { key: "qualification", header: "Qualification", kind: "optional", width: 22, note: "For example M.Sc., B.Ed." },
  { key: "experienceYears", header: "Experience (years)", kind: "optional", width: 18, note: "Whole years, 0 to 60." },
  { key: "joiningDate", header: "Joining Date", kind: "optional", width: 14, note: "DD-MM-YYYY." },
  { key: "employmentType", header: "Employment Type", kind: "optional", width: 18, note: "Full time, Part time or Contract." },
  { key: "subjects", header: "Subjects", kind: "optional", width: 30, note: "The subjects the teacher can teach, separated by commas. A subject your school does not have yet is added." },
  { key: "username", header: "Username", kind: "optional", width: 20, note: "Leave empty to have one made from the name (meena.singh_41). A username is one on the whole platform." },
  { key: "password", header: "Password", kind: "optional", width: 18, note: "Leave empty to have one made. 8 to 72 characters with an uppercase letter, a lowercase letter, a number and a symbol." },
];

/**
 * The usual details of a teacher the school decides about (Teacher > Manage fields): needed, optional or not asked. The name, the mobile
 * number (the login needs it) and the gender are always asked, so they are not here. Each is also a column of the Excel under the same key.
 */
export const TEACHER_DETAILS = [
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "email", label: "Email" },
  { key: "address", label: "House and street" },
  { key: "city", label: "City or village" },
  { key: "state", label: "State" },
  { key: "pincode", label: "PIN code" },
  { key: "employeeCode", label: "Employee code" },
  { key: "designation", label: "Designation" },
  { key: "qualification", label: "Qualification" },
  { key: "experienceYears", label: "Experience (years)" },
  { key: "joiningDate", label: "Joining date" },
  { key: "employmentType", label: "Employment type" },
  { key: "subjects", label: "Subjects they can teach" },
] as const;
export type TeacherDetailKey = (typeof TEACHER_DETAILS)[number]["key"];
export const TEACHER_DETAIL_KEYS: readonly string[] = TEACHER_DETAILS.map((d) => d.key);
export type TeacherFieldRules = Record<TeacherDetailKey, FieldMode>;
/** A new school asks every detail and needs none (as Add teacher always did). */
export const DEFAULT_TEACHER_RULES: TeacherFieldRules = Object.fromEntries(TEACHER_DETAILS.map((d) => [d.key, "optional"])) as TeacherFieldRules;

/** One column the teachers' Excel can have: the sample file's columns, the login's username and what only says more about the teacher. */
export interface TeacherExportColumn {
  key: string;
  /** The heading a new school's file has. */
  heading: string;
  group: string;
  /** In every export (the name and the mobile number: the upload needs them). */
  locked?: true;
  /** Only says more about the teacher: an upload does not read it. */
  extra?: true;
}

export const TEACHER_EXPORT_COLUMNS: readonly TeacherExportColumn[] = [
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
export const TEACHER_COLUMN_KEYS: ReadonlySet<string> = new Set(TEACHER_EXPORT_COLUMNS.map((c) => c.key));
/** The columns in every export. */
export const LOCKED_TEACHER_COLUMNS: readonly string[] = TEACHER_EXPORT_COLUMNS.filter((c) => c.locked).map((c) => c.key);

/** What the file looks like for a school that has no teacher yet: one sample row, only for trying the file. */
export const TEACHER_SAMPLE_ROW: Record<string, string | number> = {
  name: "Sample Teacher",
  mobile: "9876500000",
  gender: "Female",
  dateOfBirth: "14-07-1988",
  email: "sample.teacher@example.com",
  address: "12 MG Road",
  city: "Bhopal",
  state: "Madhya Pradesh",
  pincode: "462001",
  employeeCode: "T-001",
  designation: "PGT (Post graduate teacher)",
  qualification: "M.Sc., B.Ed.",
  experienceYears: 8,
  joiningDate: "01-06-2018",
  employmentType: "Full time",
  subjects: "Mathematics, Science",
  username: "sample.teacher_01",
  status: "Teaching",
  classTeacherOf: "",
  given: "",
};

/** How many teachers the Export page's preview shows. */
export const MAX_TEACHER_EXPORT_PREVIEW_ROWS = 10;

/** The names a school's own field may not take: the columns of the sample file, and the ones of the export that only say more. */
export const TEACHER_FIELD_NAMES: readonly string[] = [...TEACHER_SHEET_COLUMNS.map((c) => c.header), "Status", "Class teacher of", "Classes given"];

/** The posts of an Indian school, which the sample file's Designation column suggests (the same list as Add teacher; anything else may be typed). */
export const TEACHER_DESIGNATIONS = [
  "PRT (Primary teacher)",
  "TGT (Trained graduate teacher)",
  "PGT (Post graduate teacher)",
  "Nursery teacher",
  "Class teacher",
  "Subject teacher",
  "Head of department",
  "Coordinator",
  "Vice principal",
  "Sports teacher",
  "Music teacher",
  "Art teacher",
  "Computer teacher",
  "Librarian",
  "Counsellor",
] as const;

/**
 * The people who work for the school without teaching (Staff > Add staff): the role each is given. One list: a new kind of staff
 * is added here (and in the frontend's list) and everything else follows (the role dropdown, the login, the sign-in). `login` is
 * the User role the person signs in with: a role with pages of its own (Principal, Accountant) and the two the school had from the
 * start keep theirs; every other kind signs in as plain `staff`, who reaches the home page and the calendar only (what a role may open
 * is set by each module's own list of roles: STUDENT_READERS, SCHOOL_PEOPLE...). Their own title is kept on the login (`roleLabel`).
 * `other` is a role of the school's own: its name is written when the person is added (`roleOther`).
 */
export const STAFF_MEMBER_ROLES = [
  { key: "principal", label: "Principal", login: "principal", description: "Runs the school with the school admin: every page of the school's set-up." },
  { key: "vice_principal", label: "Vice principal", login: "staff", description: "Works with the principal. Sees the dashboard and the calendar." },
  { key: "accountant", label: "Accountant", login: "accountant", description: "Fees and accounts." },
  { key: "receptionist", label: "Receptionist", login: "receptionist", description: "The front desk: enquiries, visitors and admissions." },
  { key: "management", label: "Management", login: "management", description: "A member of the school's management, who looks at how the school is doing." },
  { key: "coordinator", label: "Coordinator", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "clerk", label: "Clerk / office staff", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "librarian", label: "Librarian", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "lab_assistant", label: "Lab assistant", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "counsellor", label: "Counsellor", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "nurse", label: "Nurse", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "it_support", label: "IT / computer support", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "transport", label: "Transport in-charge", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "driver", label: "Driver", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "security", label: "Security guard", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "peon", label: "Peon / attendant", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "housekeeping", label: "Housekeeping", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "warden", label: "Hostel warden", login: "staff", description: "Sees the dashboard and the calendar." },
  { key: "other", label: "Other", login: "staff", description: "A role of your own: write its name. Sees the dashboard and the calendar." },
] as const satisfies readonly { key: string; label: string; login: UserRole; description: string }[];
export type StaffMemberRole = (typeof STAFF_MEMBER_ROLES)[number]["key"];
export const STAFF_MEMBER_ROLE_KEYS = STAFF_MEMBER_ROLES.map((r) => r.key) as [StaffMemberRole, ...StaffMemberRole[]];
/** The longest role name a school may write for Other. */
export const MAX_ROLE_OTHER = 40;
/** The role's label; for Other, the name the school wrote (`other`). */
export const staffRoleLabel = (role: string, other?: string | null) => (role === "other" && other ? other : (STAFF_MEMBER_ROLES.find((r) => r.key === role)?.label ?? role));
/**
 * A role with pages of its own keeps its login even when the person also teaches: a Principal who takes a class is still the principal.
 * They become a teacher of the school (classes, periods) without a teacher login.
 */
export const ROLES_KEEPING_THEIR_LOGIN: readonly string[] = ["principal", "accountant"];
/** The User role a staff member signs in with: their own; or a teacher's when they also teach and their role has no pages of its own. */
export function loginRoleOf(role: string, alsoTeacher: boolean): UserRole {
  if (alsoTeacher && !ROLES_KEEPING_THEIR_LOGIN.includes(role)) return "teacher";
  return STAFF_MEMBER_ROLES.find((r) => r.key === role)?.login ?? "staff";
}
export const STAFF_MEMBER_STATUSES = ["invited", "active", "inactive"] as const;
export type StaffMemberStatus = (typeof STAFF_MEMBER_STATUSES)[number];
/** A school can have this many staff members (a guard against filling the database by accident). */
export const MAX_STAFF_MEMBERS = 200;
