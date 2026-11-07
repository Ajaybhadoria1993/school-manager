/** The shapes of the Staff (teachers) API (backend/src/main/staff). */
import type { CustomFieldDef } from "../constants/studentFields";
import type { UserRole } from "./auth";

export type TeacherGender = "Male" | "Female" | "Other";
export type EmploymentType = "full_time" | "part_time" | "contract";

/** A teacher's sign-in. The password is never sent back: it is shown once, when it is made. */
export interface TeacherLogin {
  username: string;
  /** Off while the teacher has left. */
  isActive: boolean;
}

export interface TeacherAddress {
  line1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

export interface Teacher {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  employeeCode: string | null;
  subjectIds: string[];
  maxPeriodsPerDay: number | null;
  maxPeriodsPerWeek: number | null;
  /** 1 = Monday ... 7 = Sunday. */
  offDays: number[];
  isActive: boolean;
  load: { sections: number; periodsAllotted: number };
  gender: TeacherGender | null;
  /** "1988-07-14". */
  dateOfBirth: string | null;
  address: TeacherAddress;
  designation: string | null;
  qualification: string | null;
  experienceYears: number | null;
  joiningDate: string | null;
  employmentType: EmploymentType | null;
  /** The answers to the school's own fields, by their `c_` key (a field the school no longer has is not shown). */
  custom: Record<string, string | number | boolean>;
  /** null: no login yet. */
  login: TeacherLogin | null;
  /** The units they are the class teacher of, this year and the next ("Class 5 - A"). */
  classTeacherOf: string[];
}

export interface LoginAccount {
  username: string;
  password: string;
}

/** `GET /staff/teachers/summary`: the numbers on top of the Teacher page (withoutClasses: no subject of a class and no class to look after). */
export interface TeacherSummary {
  teaching: number;
  classTeachers: number;
  withoutClasses: number;
  left: number;
}

/** `GET /staff/usernames/check`: free or taken on the whole platform; a taken one comes with free ones like it. */
export interface UsernameCheck {
  available: boolean;
  suggestions: string[];
}

export interface TeacherInput {
  name?: string;
  mobile?: string | null;
  email?: string | null;
  employeeCode?: string | null;
  subjectIds?: string[];
  maxPeriodsPerDay?: number | null;
  maxPeriodsPerWeek?: number | null;
  offDays?: number[];
  isActive?: boolean;
  gender?: TeacherGender | null;
  dateOfBirth?: string | null;
  address?: Partial<TeacherAddress>;
  designation?: string | null;
  qualification?: string | null;
  experienceYears?: number | null;
  joiningDate?: string | null;
  employmentType?: EmploymentType | null;
  /** Answers to the school's own fields by key (a change: null clears one). */
  custom?: Record<string, string | number | boolean | null>;
  /** Makes the teacher's login in the same step (Add teacher only). */
  login?: LoginAccount;
}

/** What the teacher list can be asked; the server applies every filter. */
export interface TeacherQuery {
  status: "active" | "inactive" | "all";
  /** Name, mobile number, employee code, email or username. */
  search?: string;
  /** Can teach this subject. */
  subjectId?: string;
  designation?: string;
  employmentType?: EmploymentType;
  gender?: TeacherGender;
  /** with = a login that works, closed = switched off, without = none. */
  login?: "with" | "without" | "closed";
  /** Teaches a subject of this class, or is the class teacher of one of its units. */
  classId?: string;
  classTeacher?: "yes" | "no";
}

/** A section (or a class without sections) as a teacher's page lists it. */
export interface TeacherUnit {
  classId: string;
  sectionId: string | null;
  /** "Class 5 - A", or "Class 1" for a class without sections. */
  label: string;
  academicYear: { id: string; name: string };
}

/** A subject of a class that a teacher teaches. */
export interface TeacherTeaching extends TeacherUnit {
  subjectId: string;
  subjectName: string;
  periodsPerWeek: number;
}

/** `GET /staff/teachers/:id/classes`: what the teacher has been given this year (and the next). */
export interface TeacherClasses {
  classTeacherOf: TeacherUnit[];
  subjects: TeacherTeaching[];
}

/** `PUT /staff/class-teachers`: the class teacher of a section (or of a class without sections); null takes it away. */
export interface ClassTeacherInput {
  classId: string;
  sectionId: string | null;
  teacherId: string | null;
}

export interface ClassTeacherAnswer {
  classId: string;
  sectionId: string | null;
  label: string;
  teacher: { id: string; name: string } | null;
}

/** `PUT /subjects/allotments/teacher`: the teacher of one subject of a unit; a subject it does not study yet needs its periods a week. */
export interface AssignTeacherInput {
  classId: string;
  sectionId: string | null;
  subjectId: string;
  teacherId: string | null;
  periodsPerWeek?: number;
}

/**
 * `PUT /subjects/allotments/teachers`: what a class's Save button sends, in one request, all or nothing: the class teacher (left out = as
 * it is, null = none) and, for the subjects named, the main teacher and the backups in order (priority 2, 3...).
 */
export interface SaveUnitTeachersInput {
  classId: string;
  sectionId: string | null;
  classTeacherId?: string | null;
  subjects: { subjectId: string; teacherId: string | null; backupTeacherIds: string[] }[];
}

/** One row of a bulk upload of teachers, as the screen sends it (`POST /staff/teachers/import`, up to 10 rows a request). */
export interface TeacherImportRowInput {
  /** The row's number in the file. */
  row: number;
  /** The boxes of Add teacher the file gave (an empty box is left out); the login and the subjects are not part of it. */
  teacher: TeacherInput;
  /** The subjects the teacher can teach, in words: a name the school has is that subject, any other is added. */
  subjectNames: string[];
  /** The login the file gives; left out, the server makes them up. */
  username?: string;
  password?: string;
}

export interface TeacherImportRowResult {
  row: number;
  ok: boolean;
  /** TEACHER_MOBILE_EXISTS (already in the school), TEACHER_CODE_EXISTS, USERNAME_TAKEN, LOGIN_EMAIL_TAKEN...; none for a row whose boxes are wrong. */
  code?: string;
  /** By box ("name", "mobile", "address.pincode", "username"...; "" for the row as a whole). */
  errors: { path: string; message: string }[];
  teacher?: { id: string; name: string };
  /** `password` is there only when the server made it up: it is told this once and never kept. */
  login?: { username: string; password: string | null };
}

export interface TeacherImportResult {
  results: TeacherImportRowResult[];
  ok: number;
  failed: number;
}

/** How the school keeps its teachers' details beyond the usual ones: its own fields (`GET` / `PUT /staff/teachers/settings`). */
export interface TeacherSettings {
  customFields: CustomFieldDef[];
}

/** A person who works for the school without teaching (`/staff/members`): invited by email, then active. */
export type StaffMemberStatus = "invited" | "active" | "inactive";

export interface StaffMember {
  id: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  email: string;
  mobile: string | null;
  gender: TeacherGender | null;
  dateOfBirth: string | null;
  address: TeacherAddress;
  designation: string | null;
  employeeCode: string | null;
  joiningDate: string | null;
  status: StaffMemberStatus;
  invitedAt: string;
  acceptedAt: string | null;
}

/** What the server says about an invitation it just made (or made again). */
export interface StaffInviteDelivery {
  /** False when the mail server did not take the email: the school uses Resend invite. */
  emailSent: boolean;
  inviteExpiresAt: string;
  /** Development only, with no mail server: the link itself. */
  devInviteLink?: string;
}

export interface StaffMemberInput {
  name: string;
  role: UserRole;
  email: string;
  mobile?: string | null;
  gender?: TeacherGender | null;
  dateOfBirth?: string | null;
  address?: Partial<TeacherAddress>;
  designation?: string | null;
  employeeCode?: string | null;
  joiningDate?: string | null;
}

export interface StaffMemberQuery {
  status: StaffMemberStatus | "all";
  role?: UserRole;
  search?: string;
}

export interface StaffMemberList {
  items: StaffMember[];
  counts: Record<StaffMemberStatus, number>;
}
