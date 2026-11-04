/** The shapes of the Staff (teachers) API (backend/src/main/staff). */

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
