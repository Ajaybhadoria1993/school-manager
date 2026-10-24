/** The Students module (backend/src/main/students): shapes as the API sends them. Days are calendar days, "2026-04-01". */

export type Gender = "Male" | "Female" | "Other";
export type Relation = "Father" | "Mother" | "Guardian" | "Other";

/** Where a student sits this year. `sectionId` is null for a class that is not split into sections. */
export interface StudentPlace {
  enrolmentId: string;
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  rollNumber: number | null;
}

/** Each part may be empty when the school does not need it (its fields, on Students > Export). */
export interface StudentAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

/** The records a school may keep about a student (each needed, optional or not asked, as the school decides). */
export interface StudentRecords {
  aadhaarNumber: string | null;
  samagraId: string | null;
  apaarId: string | null;
  pen: string | null;
  srNumber: string | null;
  religion: string | null;
  nationality: string | null;
  emergencyMobile: string | null;
  disability: string | null;
  medicalNotes: string | null;
  feeConcession: string | null;
  transportRoute: string | null;
  transportStop: string | null;
  rteSeat: boolean;
  bpl: boolean;
}
export type RecordTextKey = Exclude<keyof StudentRecords, "rteSeat" | "bpl">;

export interface PreviousSchool {
  name: string;
  lastClass: string | null;
  tcNumber: string | null;
  tcDate: string | null;
}

/** A row of the student list. */
export interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  gender: Gender;
  /** Made by the server ("ADM-2026-0001"), never typed, never changed. */
  admissionNumber: string;
  dateOfBirth: string;
  admissionDate: string;
  status: "active";
  place: StudentPlace | null;
  primaryGuardian: { id: string; name: string; relation: Relation; mobile: string | null } | null;
}

/** A guardian as a student's page shows them: their details and how they are related to THIS child. */
export interface StudentGuardian {
  id: string;
  name: string;
  relation: Relation;
  isPrimary: boolean;
  mobile: string | null;
  /** Proved by an OTP (the parent login, not built yet). */
  mobileVerified: boolean;
  alternateMobile: string | null;
  email: string | null;
  occupation: string | null;
}

/** Another child of one of the student's guardians. */
export interface Sibling {
  id: string;
  name: string;
  admissionNumber: string;
  className: string | null;
  sectionName: string | null;
}

/** One academic year of the student's history. */
export interface Enrolment {
  id: string;
  academicYear: { id: string; name: string; status: string } | null;
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  status: string;
  enrolledAt: string;
  current: boolean;
}

export interface StudentDetail extends Omit<StudentRow, "primaryGuardian">, StudentRecords {
  address: StudentAddress;
  bloodGroup: string | null;
  category: string | null;
  previousSchool: PreviousSchool | null;
  /** The answers to the school's own fields, by their key (a day as "2026-04-01"). */
  custom: CustomAnswers;
  /** The primary guardian first. */
  guardians: StudentGuardian[];
  /** Newest year first. */
  enrolments: Enrolment[];
  siblings: Sibling[];
  createdAt: string;
}

/** A guardian the school already has, found by their mobile number, with their children here. */
export interface GuardianMatch {
  id: string;
  name: string;
  mobile: string | null;
  alternateMobile: string | null;
  email: string | null;
  occupation: string | null;
  children: (Sibling & { relation: Relation })[];
}

export type StudentSort = "class" | "name" | "admissionNumber" | "admissionDate";

/** What the student list is asked: the server searches, filters, sorts and pages. */
export interface StudentListQuery {
  /** Part of a name or of an admission number. */
  q?: string;
  classId?: string;
  /** A section's id, or "none" for a class without sections. */
  sectionId?: string;
  sort?: StudentSort;
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface StudentPage {
  /** The year the list is about; null when the school has none (nothing can be admitted until it has one). */
  academicYear: { id: string; name: string } | null;
  items: StudentRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** How full one section of this year is; `seatsLeft` is null for a section with no limit. */
export interface SectionLoad {
  sectionId: string;
  classId: string;
  capacity: number | null;
  enrolled: number;
  seatsLeft: number | null;
  /** The roll number after the highest one given in the section this year (1 when none yet); null past the last (999). */
  nextRollNumber: number | null;
}

export interface StudentCapacity {
  academicYear: { id: string; name: string } | null;
  sections: SectionLoad[];
  /** `nextRollNumber`: for a class without sections (its students sit in the class as a whole). */
  classes: { classId: string; enrolled: number; nextRollNumber: number | null }[];
  totals: { students: number; seats: number; seatsLeft: number; fullSections: number };
}

/** One guardian of an admission: new, or one the school has (`guardianId`, kept as they are unless `updateDetails`). */
export interface GuardianInput {
  guardianId?: string;
  updateDetails?: boolean;
  name: string;
  relation: Relation;
  isPrimary: boolean;
  mobile?: string;
  alternateMobile?: string;
  email?: string;
  occupation?: string;
}

/** Answers to the school's own fields, by key: text, a number, a day ("2026-04-01"), yes / no, a choice. */
export type CustomAnswers = Record<string, string | number | boolean>;

/** The records as they are sent: a text left empty is not sent (an admission) or null (a change clears it). */
export type RecordsInput = { [K in RecordTextKey]?: string | null } & { rteSeat?: boolean; bpl?: boolean };

export interface AdmitStudentInput extends RecordsInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: string;
  admissionDate?: string;
  address?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
  bloodGroup?: string;
  category?: string;
  previousSchool?: { name?: string; lastClass?: string; tcNumber?: string; tcDate?: string };
  classId: string;
  sectionId: string | null;
  rollNumber?: number | null;
  guardians: GuardianInput[];
  /** The school's own fields that are answered. */
  custom?: CustomAnswers;
  allowOverCapacity?: boolean;
  confirmNotDuplicate?: boolean;
}

/** A change to the student's own details: only what is sent changes (null clears an optional one). */
export interface UpdateStudentInput extends RecordsInput {
  firstName?: string;
  lastName?: string;
  gender?: Gender;
  dateOfBirth?: string;
  admissionDate?: string;
  address?: AdmitStudentInput["address"];
  bloodGroup?: string | null;
  category?: string | null;
  previousSchool?: AdmitStudentInput["previousSchool"] | null;
  /** Only the answers that changed; null takes one away. */
  custom?: Record<string, string | number | boolean | null>;
}

export interface MoveStudentInput {
  classId?: string;
  sectionId?: string | null;
  rollNumber?: number | null;
  allowOverCapacity?: boolean;
}

/** An uploaded students file as the server read it: its column titles and every filled row, as text, with its row number. */
export interface ImportSheet {
  fileName: string;
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: { row: number; cells: string[] }[];
}

/** One row sent to be checked or admitted: an admission body, its row number in the file, and the school's own admission number. */
export interface ImportRowInput {
  row: number;
  admissionNumber?: string;
  student: AdmitStudentInput;
}

export interface ImportRowResult {
  row: number;
  ok: boolean;
  /** The refusal's code (SECTION_FULL, DUPLICATE_STUDENT, ADMISSION_NUMBER_TAKEN...); none for a row whose boxes are wrong. */
  code?: string;
  /** By box ("firstName", "guardians.0.mobile"...; "" for the row as a whole). */
  errors: { path: string; message: string }[];
  warnings: string[];
  student?: { id: string; name: string; admissionNumber: string };
}

export interface ImportResult {
  dryRun: boolean;
  results: ImportRowResult[];
  ok: number;
  failed: number;
}

export interface UpdateGuardianInput {
  name?: string;
  mobile?: string;
  alternateMobile?: string | null;
  email?: string | null;
  occupation?: string | null;
}

/** How this school keeps its students' records (GET / PUT /students/settings). */
export interface StudentSettings {
  fields: import("../constants/studentFields").FieldRules;
  /** The school's own fields, beyond the list. */
  customFields: import("../constants/studentFields").CustomFieldDef[];
  exportColumns: ExportColumn[];
  /** The export is still the default layout (nothing saved yet). */
  exportIsDefault: boolean;
  updatedAt: string | null;
}

export interface ExportColumn {
  /** A field of the list (`ExportColumnKey`) or one of the school's own (`c_...`). */
  key: string;
  heading: string;
}

export interface UpdateStudentSettingsInput {
  fields?: Partial<import("../constants/studentFields").FieldRules>;
  /** The whole list of the school's own fields (one left out is deleted). */
  customFields?: import("../constants/studentFields").CustomFieldDef[];
  /** null = back to the default layout. */
  exportColumns?: ExportColumn[] | null;
}

/** The first students of an export (every column's value, by its key) and how many there are in all. */
export interface ExportPreview {
  total: number;
  rows: Record<string, string | number>[];
}
