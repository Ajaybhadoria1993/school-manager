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
  status: "active" | "inactive";
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
  /** The parent's login (its username; the password is never sent), or null: one login for all their children. */
  login?: ParentLogin | null;
}

export interface ParentLogin {
  username: string;
  isActive: boolean;
}

/** The answer to making, renaming or giving a new password to a parent's login. */
export interface GuardianLoginAnswer {
  guardianId: string;
  login: ParentLogin;
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
  /** When, by whom and why the student was made inactive; null for an active student. */
  inactive: { at: string; by: { name: string; role: string }; reason: string | null; transfer: TransferSchool | null } | null;
  /** The moves and transfers of this student, newest first. */
  moves: StudentMove[];
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
  /** The parent's login: a brother's or sister's admission joins it by itself. */
  login?: ParentLogin | null;
  children: (Sibling & { relation: Relation })[];
}

export type StudentSort = "class" | "name" | "admissionNumber" | "admissionDate";

/** What the student list is asked: the server searches, filters, sorts and pages. */
export interface StudentListQuery {
  /** Part of a name or of an admission number. */
  q?: string;
  classId?: string;
  /** A department's id, or "none" for the classes in no department: the students of the classes in it. */
  departmentId?: string;
  /** A section's id, or "none" for a class without sections. */
  sectionId?: string;
  gender?: Gender;
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
  /** Why (optional): kept in the student's moves with who moved them and when. */
  reason?: string;
}

/** A student leaving for another school: its name and, when the school has them, the transfer certificate's number and day, and a remark. */
export interface TransferOutInput {
  schoolName: string;
  tcNumber?: string;
  /** "2026-10-20". */
  tcDate?: string;
  remarks?: string;
}

/** Where a student sat, with the names as they were written then. */
export interface PlaceSnapshot {
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  rollNumber: number | null;
}

/** One movement of a student: moved to another class, section or roll number, or transferred out to another school. */
export interface StudentMove {
  id: string;
  kind: "moved" | "transferred_out";
  at: string;
  reason: string | null;
  academicYear: { id: string; name: string } | null;
  from: PlaceSnapshot | null;
  to: PlaceSnapshot | null;
  school: TransferSchool | null;
  by: { name: string; role: string };
}

export interface TransferSchool {
  schoolName: string;
  tcNumber: string | null;
  tcDate: string | null;
  remarks: string | null;
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

/** A section whose seats were raised by an upload that brought more students than it had seats (the class's too, when its sections no longer fitted). */
export interface SeatsRaised {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  from: number;
  to: number;
  /** The class's seats before and after; null when the class was not changed. */
  classFrom: number | null;
  classTo: number | null;
}

export interface ImportResult {
  dryRun: boolean;
  results: ImportRowResult[];
  ok: number;
  failed: number;
  seatsRaised: SeatsRaised[];
}

/**
 * How a row of a file meets a student the school already has: `same` (the same child: not uploaded again), `maybe` (the same name and
 * birthday, another parent's mobile: it may be another child), `number` / `aadhaar` (the admission number, or the Aadhaar number, of a
 * DIFFERENT child: the row needs a fix).
 */
export type ImportMatchKind = "same" | "maybe" | "number" | "aadhaar";

/** One row of a file asked about before anything is uploaded: only what tells one child from another. */
export interface ImportMatchRow {
  row: number;
  firstName: string;
  lastName: string;
  /** "2016-05-14". */
  dateOfBirth: string;
  mobile?: string;
  admissionNumber?: string;
  aadhaarNumber?: string;
}

export interface ImportMatch {
  row: number;
  kind: ImportMatchKind;
  student: {
    id: string;
    name: string;
    admissionNumber: string;
    dateOfBirth: string;
    className: string | null;
    sectionName: string | null;
    inactive: boolean;
  };
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
  /** The step of Add student each movable detail and each own field is asked in, in order (every one of them is listed). */
  placements: import("../constants/studentFields").Placement[];
  /** Every detail is still in its usual step (nothing moved). */
  placementsAreDefault: boolean;
  /** The steps after Parents, in order: More details and the school's own (always lists More details). */
  steps: import("../constants/studentFields").StepDef[];
  /** Only More details (the school added no step). */
  stepsAreDefault: boolean;
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
  /** The step of Add student each detail is asked in (null = every detail in its usual step). */
  placements?: import("../constants/studentFields").Placement[] | null;
  /** The steps after Parents, in order (null = More details alone). */
  steps?: import("../constants/studentFields").StepDef[] | null;
}

/**
 * The first students of an export (every column's value, by its key) and how many there are in all. A school with no student yet gets
 * one made-up row (`sample`), so the file can be tried: `total` is still 0.
 */
export interface ExportPreview {
  total: number;
  sample?: boolean;
  rows: Record<string, string | number>[];
}

/** One inactive student: who they are, where they were, and who made them inactive, when and why. */
export interface InactiveStudent {
  id: string;
  name: string;
  gender: Gender;
  admissionNumber: string;
  dateOfBirth: string;
  className: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  parentName: string | null;
  parentMobile: string | null;
  reason: string | null;
  transfer: TransferSchool | null;
  inactiveAt: string;
  inactiveBy: { name: string; role: string };
}

export interface InactivePage {
  items: InactiveStudent[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** What the server did with the ids it was sent: how many it did, and how many it skipped (not found, or not in the right state). */
export interface StatusResult {
  deactivated?: number;
  reactivated?: number;
  skipped: number;
  /** Active again only: students who came back without their roll number because someone else took it meanwhile. */
  rollNumbersLost?: number;
  /** Active again only: students who have no class in the running year and were left as they are (the screen asks where to put them). */
  needsPlacement?: number;
}

/** The class (and section) of the running year a returning student is put in. */
export interface ReactivatePlacement {
  classId: string;
  sectionId?: string | null;
}

export type PromotionStatus = "draft" | "submitted" | "approved" | "applied" | "cancelled";
export type PromotionOutcome = "promote" | "retain" | "leave";

export interface PromotionPlace {
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
}

export interface PromotionEntry {
  studentId: string;
  name: string;
  admissionNumber: string;
  from: PromotionPlace;
  outcome: PromotionOutcome;
  to: PromotionPlace | null;
}

/** The classes of the next year with the sections they have: where a student of the list can be put. */
export interface PromotionTarget {
  classId: string;
  className: string;
  sections: { id: string; name: string; capacity: number | null }[];
}

type Person = { name: string; role: string };

/** The list of who goes where when the year ends: made as a draft, sent for approval, approved by the school admin. */
export interface Promotion {
  id: string;
  status: PromotionStatus;
  fromYear: { id: string; name: string };
  toYear: { id: string; name: string };
  summary: { total: number; promote: number; retain: number; leave: number };
  createdBy: Person;
  createdAt: string;
  submitted: { by: Person; at: string } | null;
  decision: { outcome: "approved" | "rejected"; by: Person; at: string; note: string | null } | null;
  appliedAt: string | null;
  entries: PromotionEntry[];
  targets: PromotionTarget[];
}

/** One change to a draft list: what happens to a student and, for a student who goes on, where (a class and section of the next year). */
export interface PromotionChange {
  studentId: string;
  outcome: PromotionOutcome;
  classId?: string;
  sectionId?: string | null;
}

export interface InactiveQuery {
  q?: string;
  page?: number;
  limit?: number;
}

export type SeatState = "open" | "almost" | "full" | "unlimited";

/** One section of the classes at a glance: its students, its room and how full its seats are (the server's count). */
export interface SectionOverview {
  id: string;
  name: string;
  room: string | null;
  /** Null when the section has no limit. */
  capacity: number | null;
  enrolled: number;
  seatsLeft: number | null;
  state: SeatState;
  percent: number;
  /** The section's class teacher this year; null until one is picked. */
  classTeacher: { id: string; name: string } | null;
}

/** One class at a glance: its department, its students (the sections together), its sections and how full the seats are together. */
export interface ClassOverview {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  students: number;
  seats: number;
  seatsLeft: number;
  percent: number;
  sections: SectionOverview[];
  /** The class teacher of a class without sections (a split class has one for each section). */
  classTeacher: { id: string; name: string } | null;
}

/** The classes that match the filter, with the totals of those classes and every department (for the dropdown). */
export interface ClassOverviewPage {
  academicYear: { id: string; name: string } | null;
  departments: { id: string; name: string }[];
  summary: { classes: number; sections: number; students: number; seats: number; seatsLeft: number; fullSections: number };
  classes: ClassOverview[];
}

export interface ClassOverviewQuery {
  /** A department's id, or "none". */
  departmentId?: string;
  classId?: string;
  /** Part of a class name. */
  q?: string;
}
