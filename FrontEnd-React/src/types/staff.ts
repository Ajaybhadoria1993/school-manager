/** The shapes of the Staff (teachers) API (backend/src/main/staff). */
import type { CustomFieldDef } from "../constants/studentFields";
import type { TeacherFieldRules } from "../constants/teacherFields";
import type { ExportColumn } from "./students";

export type TeacherGender = "Male" | "Female" | "Other";
export type EmploymentType = "full_time" | "part_time" | "contract";

/**
 * A teacher's (or staff member's) sign-in (2026-11-26): their email, Pending until they open the invitation emailed to it and choose a
 * password. A login made before that has a username (and maybe an email too). The password is never sent back.
 */
export interface TeacherLogin {
  /** Only an older login has one. */
  username: string | null;
  email: string | null;
  /** Off while the teacher has left. */
  isActive: boolean;
  /** The invitation was sent and not opened yet: no password, cannot sign in. */
  pending: boolean;
}

/** What Give login access does, by the login the person has now: none (give it), Pending (the invitation again), or one that works (a password link). */
export type LoginAction = "give" | "resend" | "reset";

/** What the school is told after an invitation (Add teacher / Add staff with login access, Give login access, Resend). */
export interface LoginInvite {
  email: string;
  inviteExpiresAt: string;
  /** False: the email did not go out (send it again). */
  emailSent: boolean;
  /** Only on a development server with no email service: the link itself. */
  devInviteLink?: string;
}

export interface TeacherAddress {
  line1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

/** A medium of the school, as a teacher's page lists it. */
export interface TeacherMedium {
  id: string;
  label: string;
  /** The medium whose page this is. */
  here: boolean;
  teaches: boolean;
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
  /** Only in the answer that sent an invitation. */
  invite?: LoginInvite;
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
  /** Gives the teacher login access in the same step (Add teacher only): `email` is then needed, and the invitation goes to it. */
  giveLogin?: boolean;
}

/** What the teacher list can be asked; the server applies every filter. */
export interface TeacherQuery {
  status: "active" | "inactive" | "all";
  /** Name, mobile number, employee code, email or (an older login's) username. */
  search?: string;
  /** Can teach this subject. */
  subjectId?: string;
  designation?: string;
  employmentType?: EmploymentType;
  gender?: TeacherGender;
  /** with = a login that works, pending = invitation not opened, closed = switched off, without = none. */
  login?: "with" | "without" | "pending" | "closed";
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
  /** How many of those periods a lesson of the class's timetable has been placed in (the others are in nobody's week yet). */
  placedPeriods: number;
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
  /** The teacher also leaves every other class they are the class teacher of in the same year (a class's page: "make them the class teacher here"). */
  releaseOthers?: boolean;
}

export interface ClassTeacherAnswer {
  classId: string;
  sectionId: string | null;
  label: string;
  teacher: { id: string; name: string } | null;
  /** Only with `releaseOthers`: the classes the teacher left ("Class 5 - A"). */
  released?: string[];
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
  /** The boxes of Add teacher the file gave (an empty box is left out); the subjects are not part of it. A row makes no login. */
  teacher: TeacherInput;
  /** The subjects the teacher can teach, in words: a name the school has is that subject, any other is added. */
  subjectNames: string[];
}

export interface TeacherImportRowResult {
  row: number;
  ok: boolean;
  /** TEACHER_MOBILE_EXISTS (already in the school), TEACHER_CODE_EXISTS, TEACHER_EMAIL_EXISTS...; none for a row whose boxes are wrong. */
  code?: string;
  /** By box ("name", "mobile", "address.pincode"...; "" for the row as a whole). */
  errors: { path: string; message: string }[];
  teacher?: { id: string; name: string };
}

export interface TeacherImportResult {
  results: TeacherImportRowResult[];
  ok: number;
  failed: number;
}

/**
 * How the school keeps its teachers' details (`GET` / `PUT /staff/teachers/settings`): what Add teacher needs of each usual detail, its own
 * fields, and the columns of its Excel (in order, under its headings).
 */
export interface TeacherSettings {
  fields: TeacherFieldRules;
  customFields: CustomFieldDef[];
  exportColumns: ExportColumn[];
  /** The Excel is still the usual layout (nothing of the school's own saved). */
  exportIsDefault: boolean;
}

/** What `PUT /staff/teachers/settings` takes: any of the three (the usual details not sent stay as they are; null columns = the usual layout). */
export interface UpdateTeacherSettingsInput {
  fields?: Partial<TeacherFieldRules>;
  /** The whole list of the school's own fields (one left out is deleted). */
  customFields?: CustomFieldDef[];
  exportColumns?: ExportColumn[] | null;
}

/**
 * A person who works for the school without teaching (`/staff/members`): active or inactive (a login closes while they are inactive). The
 * login is given with login access (their email, an invitation). *invited* is only a person added before 2026-11-08 who has no login.
 */
export type StaffMemberStatus = "invited" | "active" | "inactive";

export interface StaffMember {
  id: string;
  name: string;
  /** The kind of staff (the key of constants/staffMembers.ts), not a login role: "other" is a role the school wrote. */
  role: string;
  /** The role's name: for Other, the one the school wrote. */
  roleLabel: string;
  roleOther: string | null;
  /** Also teaches. `isTeacher`: they have accepted and are a Teacher of the school now (the switch is locked then). */
  alsoTeacher: boolean;
  isTeacher: boolean;
  subjectIds: string[];
  /** Their login when they have one (then it cannot be emptied); otherwise only a contact. */
  email: string | null;
  mobile: string | null;
  gender: TeacherGender | null;
  dateOfBirth: string | null;
  address: TeacherAddress;
  designation: string | null;
  employeeCode: string | null;
  joiningDate: string | null;
  status: StaffMemberStatus;
  /** Their login (the email, Pending until the invitation is opened); null: no login. */
  login: TeacherLogin | null;
  /** Only in the answer that sent an invitation. */
  invite?: LoginInvite;
}

export interface StaffMemberInput {
  name: string;
  role: string;
  roleOther?: string | null;
  alsoTeacher?: boolean;
  subjectIds?: string[];
  email?: string | null;
  /** Login access (Add staff only): `email` is then needed, and the invitation goes to it. */
  giveLogin?: boolean;
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
  role?: string;
  search?: string;
}

export interface StaffMemberList {
  items: StaffMember[];
  counts: Record<StaffMemberStatus, number>;
}
