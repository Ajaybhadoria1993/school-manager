import type { PreviousSchool, StudentAddress } from "./students";
import type { GridAllotment, GridCell, GridDay } from "./timetable";

/** What a signed-in parent reads (`/parent/...`, 2026-11-04): their children, a child's record, its published week. */

export interface ChildPlace {
  className: string;
  sectionName: string | null;
  rollNumber: number | null;
  /** "Class 5 - A". */
  label: string;
}

export interface ChildSummary {
  id: string;
  name: string;
  admissionNumber: string;
  gender: string;
  dateOfBirth: string;
  place: ChildPlace | null;
}

export interface MyChildren {
  parent: { name: string; school: string };
  items: ChildSummary[];
}

export interface ChildGuardian {
  name: string;
  relation: string;
  isPrimary: boolean;
  mobile: string | null;
  alternateMobile: string | null;
  email: string | null;
  occupation: string | null;
}

export interface ChildDetail extends ChildSummary {
  firstName: string;
  lastName: string;
  admissionDate: string;
  bloodGroup: string | null;
  category: string | null;
  classTeacher: { name: string } | null;
  address: StudentAddress;
  previousSchool: PreviousSchool | null;
  /** The child's records by their key (Aadhaar, emergency number, medical notes...): only what the school filled in is shown. */
  records: Record<string, string | number | boolean | null>;
  guardians: ChildGuardian[];
}

/** The child's class's week as the school published it (null from the server before that). */
export interface ChildTimetable {
  label: string;
  status: "published";
  publishedAt: string | null;
  days: GridDay[];
  cells: GridCell[];
  allotments: Pick<GridAllotment, "subjectId" | "subjectName" | "subjectCode" | "periodsPerWeek" | "teacherId">[];
  teachers: { id: string; name: string }[];
}
