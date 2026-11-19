/** What the school prints for a student (backend/src/main/documents): the ID card and the exam report card. */

/** The top of every document: who the school is, where, how to reach it, its board, and where its logo is. */
export interface SchoolHeader {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  board: string | null;
  affiliationNumber: string | null;
  /** An address on the API (a school's logo is public); "" when the school has none. */
  logoUrl: string;
}

export interface IdCard {
  school: SchoolHeader;
  /** The session the card is valid for. */
  year: { name: string; endDate: string };
  student: {
    id: string;
    name: string;
    admissionNumber: string;
    rollNumber: number | null;
    classLabel: string | null;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string | null;
    address: string | null;
    /** `data:image/...;base64,...` or null when the school has not added one. */
    photo: string | null;
  };
  guardian: { name: string; relation: string; mobile: string | null } | null;
}

export interface ReportSubject {
  subject: string;
  /** Marks got in the subject's papers of the exam; null when no mark is in (or the child was absent). */
  marks: number | null;
  outOf: number;
  absent: boolean;
  percent: number | null;
  grade: string | null;
  passed: boolean | null;
}

export interface ReportCard {
  school: SchoolHeader;
  year: { name: string };
  exam: { id: string; name: string; kind: string; startDate: string; endDate: string };
  student: {
    id: string;
    name: string;
    admissionNumber: string;
    rollNumber: number | null;
    className: string | null;
    sectionName: string | null;
    dateOfBirth: string;
    gender: string;
    fatherName: string | null;
    motherName: string | null;
    photo: string | null;
  };
  subjects: ReportSubject[];
  /** Null while no subject has a mark in. */
  totals: { marks: number; outOf: number; percent: number; grade: string; result: "pass" | "fail" } | null;
  attendance: { present: number; absent: number; late: number; leave: number; days: number; percent: number | null };
  classTeacher: string | null;
  /** The pass mark the result was worked out with, and the school's scale (best first). */
  passPercent: number;
  gradeBands: GradeBand[];
  /** The child's place among the class's children who have a total; null when the school does not show it or the child has no total. */
  rank: { position: number; of: number } | null;
  /** What the class teacher wrote for this exam. */
  remark: string | null;
  principalName: string | null;
  generatedOn: string;
}

export interface GradeBand {
  min: number;
  grade: string;
}

/** How the school grades (`/documents/settings`). `isDefault`: the school has not saved its own, it has the usual scale. */
export interface DocumentSettings {
  passPercent: number;
  gradeBands: GradeBand[];
  showRank: boolean;
  principalName: string | null;
  isDefault: boolean;
}

export interface AdmitCard {
  school: SchoolHeader;
  year: { name: string };
  exam: { id: string; name: string; kind: string; startDate: string; endDate: string };
  student: { id: string; name: string; admissionNumber: string; rollNumber: number | null; classLabel: string | null; dateOfBirth: string; gender: string; fatherName: string | null; photo: string | null };
  /** The class's papers in the order they are written; times are 24 hours ("09:00"). */
  papers: { date: string; day: string; subject: string; start: string; end: string; durationMinutes: number; maxMarks: number | null }[];
  principalName: string | null;
  instructions: string[];
}

export type CertificateType = "bonafide" | "character" | "transfer";

export interface Certificate {
  id: string;
  type: CertificateType;
  /** "BON/2026-2027/0001". */
  number: string;
  studentId: string;
  issuedOn: string;
  /** Bonafide: what it is needed for. */
  purpose: string | null;
  /** Character: how the conduct was. */
  conduct: string | null;
  facts: {
    studentName: string;
    admissionNumber: string;
    gender: string;
    dateOfBirth: string;
    fatherName: string | null;
    motherName: string | null;
    admissionDate: string;
    classLabel: string | null;
    leftOn: string | null;
    leavingReason: string | null;
    goingTo: string | null;
  };
  issuedBy: string;
  status: "valid" | "cancelled";
  cancelReason: string | null;
  cancelledBy: string | null;
}

/** One certificate to print, with the school's header, the session and the principal's name. */
export interface CertificateSheet extends Certificate {
  school: SchoolHeader;
  year: string;
  principalName: string | null;
}

export interface DocumentOptions {
  classes: { id: string; name: string; sections: { id: string; name: string }[] }[];
  exams: { id: string; name: string; kind: string; startDate: string; endDate: string }[];
}
