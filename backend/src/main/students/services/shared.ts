import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { calendarDayOf } from "../../academics/services/academicYear.service";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import type { Relation } from "../constants";
import type { IGuardian } from "../models/Guardian";
import type { IStudent } from "../models/Student";
import { Enrolment } from "../models/Enrolment";

/** The shapes that leave the API. Ids are strings, days are calendar days ("2026-04-01"), internal keys stay inside. */

/** Where a student sits this year: the class, the section (null for a class with no sections) and the roll number. */
export interface PlaceDto {
  enrolmentId: string;
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  rollNumber: number | null;
}

export interface GuardianSummaryDto {
  id: string;
  name: string;
  relation: Relation;
  mobile: string | null;
}

/** A row of the student list. */
export interface StudentRowDto {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  gender: IStudent["gender"];
  admissionNumber: string;
  dateOfBirth: string;
  admissionDate: string;
  status: IStudent["status"];
  /** This year's place; null for a student who has none this year. */
  place: PlaceDto | null;
  primaryGuardian: GuardianSummaryDto | null;
}

/** A guardian as a student's page shows them: their own details and how they are related to this child. */
export interface StudentGuardianDto {
  id: string;
  name: string;
  relation: Relation;
  isPrimary: boolean;
  mobile: string | null;
  /** The number was proved by an OTP (the parent login, later). Always false today. */
  mobileVerified: boolean;
  alternateMobile: string | null;
  email: string | null;
  occupation: string | null;
}

/** Another child of one of this student's guardians. */
export interface SiblingDto {
  id: string;
  name: string;
  admissionNumber: string;
  className: string | null;
  sectionName: string | null;
}

/** One year of the student's history. */
export interface EnrolmentDto {
  id: string;
  academicYear: { id: string; name: string; status: string } | null;
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  status: string;
  enrolledAt: string;
  /** This is the current academic year's. */
  current: boolean;
}

/** The records a school may keep about a student besides the core ones (each needed, optional or not asked, as the school decides). */
export const RECORD_FIELDS = [
  "aadhaarNumber",
  "samagraId",
  "apaarId",
  "pen",
  "srNumber",
  "religion",
  "nationality",
  "emergencyMobile",
  "disability",
  "medicalNotes",
  "feeConcession",
  "transportRoute",
  "transportStop",
] as const satisfies readonly (keyof IStudent)[];
export type RecordField = (typeof RECORD_FIELDS)[number];
export type StudentRecordsDto = { [K in RecordField]: IStudent[K] } & { rteSeat: boolean; bpl: boolean };

/** The records of a student as they leave the API (and as they are written: each not given = null, the ticks false). */
export function recordsOf(source: Partial<Record<RecordField, unknown>> & { rteSeat?: boolean | null; bpl?: boolean | null }): StudentRecordsDto {
  const out = Object.fromEntries(RECORD_FIELDS.map((key) => [key, source[key] ?? null])) as { [K in RecordField]: IStudent[K] };
  return { ...out, rteSeat: !!source.rteSeat, bpl: !!source.bpl };
}

type CustomAnswer = string | number | boolean;

/**
 * The answers to the school's own fields as they are kept (already checked against the school's fields by `customIssues`, so every key
 * is one of them and every answer has its kind): text tidied, a number, a day as "2026-04-01", yes / no, a choice. An answer not given
 * (null, "") is `cleared` (a change takes it away; an admission skips it).
 */
export function customAnswersOf(answers: Record<string, unknown> | undefined): { set: Record<string, CustomAnswer>; cleared: string[] } {
  const set: Record<string, CustomAnswer> = {};
  const cleared: string[] = [];
  for (const [key, value] of Object.entries(answers ?? {})) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) cleared.push(key);
    else if (typeof value === "number" || typeof value === "boolean") set[key] = value;
    else set[key] = String(value).trim().replace(/\s+/g, " ");
  }
  return { set, cleared };
}

/** A student's answers as they leave the API: what is kept, by key (an empty object when none). */
export const customOf = (custom: unknown): Record<string, CustomAnswer> => (custom && typeof custom === "object" ? { ...(custom as Record<string, CustomAnswer>) } : {});

/** An address as it is written and as it leaves the API: every part that is not given is null. */
export const addressOf = (a: Partial<IStudent["address"]> | null | undefined): IStudent["address"] => ({
  line1: a?.line1 ?? null,
  line2: a?.line2 ?? null,
  city: a?.city ?? null,
  state: a?.state ?? null,
  pincode: a?.pincode ?? null,
});

/** 409: this Aadhaar number is already another student's (one child, one number). */
export const aadhaarTaken = (aadhaarNumber: string, holder?: Pick<IStudent, "firstName" | "lastName" | "admissionNumber">) => {
  const message = holder
    ? `Aadhaar number ${aadhaarNumber} is already ${fullName(holder)}'s (${holder.admissionNumber})`
    : `Aadhaar number ${aadhaarNumber} is already used in your school`;
  return ApiError.conflict(`${message}.`, "AADHAAR_TAKEN", [{ path: "aadhaarNumber", message }]);
};

export interface StudentDetailDto extends Omit<StudentRowDto, "primaryGuardian">, StudentRecordsDto {
  address: IStudent["address"];
  bloodGroup: IStudent["bloodGroup"];
  category: IStudent["category"];
  previousSchool: { name: string; lastClass: string | null; tcNumber: string | null; tcDate: string | null } | null;
  /** The answers to the school's own fields, by their key. */
  custom: Record<string, string | number | boolean>;
  guardians: StudentGuardianDto[];
  /** Every year, newest first. */
  enrolments: EnrolmentDto[];
  siblings: SiblingDto[];
  createdAt: string;
}

/** A guardian found by their mobile number, with the children they already have at the school. */
export interface GuardianMatchDto {
  id: string;
  name: string;
  mobile: string | null;
  alternateMobile: string | null;
  email: string | null;
  occupation: string | null;
  children: (SiblingDto & { relation: Relation })[];
}

export const fullName = (s: Pick<IStudent, "firstName" | "lastName">) => `${s.firstName} ${s.lastName}`;
/** "asha verma": what the search and the duplicate check compare. */
export const nameKeyOf = (firstName: string, lastName: string) => `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, " ");

export const toGuardianDto = (g: IGuardian, link: { relation: Relation; isPrimary: boolean }): StudentGuardianDto => ({
  id: g._id.toString(),
  name: g.name,
  relation: link.relation,
  isPrimary: link.isPrimary,
  mobile: g.mobile ?? null,
  mobileVerified: !!g.mobileVerifiedAt,
  alternateMobile: g.alternateMobile ?? null,
  email: g.email ?? null,
  occupation: g.occupation ?? null,
});

/** "Class 5 - A", or "Class 5" for a class with no sections. */
export const placeTitle = (className: string, sectionName: string | null) => (sectionName ? `${className} - ${sectionName}` : className);

/**
 * Where each of these students sits in the given year, by student id, with the class and section names. A student with no
 * enrolment that year is absent from the map.
 */
export async function placesOf(
  tenantId: Types.ObjectId,
  academicYearId: Types.ObjectId | null,
  studentIds: Types.ObjectId[]
): Promise<Map<string, PlaceDto>> {
  const places = new Map<string, PlaceDto>();
  if (!academicYearId || studentIds.length === 0) return places;
  const enrolments = await Enrolment.find({ tenantId, academicYearId, studentId: { $in: studentIds } }).lean();
  const [classes, sections] = await Promise.all([
    SchoolClass.find({ tenantId, _id: { $in: enrolments.map((e) => e.classId) } }).select("name").lean(),
    Section.find({ tenantId, _id: { $in: enrolments.flatMap((e) => (e.sectionId ? [e.sectionId] : [])) } }).select("name").lean(),
  ]);
  const className = new Map(classes.map((c) => [c._id.toString(), c.name]));
  const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));
  for (const e of enrolments) {
    places.set(e.studentId.toString(), {
      enrolmentId: e._id.toString(),
      classId: e.classId.toString(),
      className: className.get(e.classId.toString()) ?? "Deleted class",
      sectionId: e.sectionId ? e.sectionId.toString() : null,
      sectionName: e.sectionId ? (sectionName.get(e.sectionId.toString()) ?? null) : null,
      rollNumber: e.rollNumber ?? null,
    });
  }
  return places;
}

export const day = (date: Date) => calendarDayOf(date);

/** 409 for a school that has no current academic year: nothing can be admitted until it names one (on the dashboard). */
export const NO_ACTIVE_YEAR = () =>
  ApiError.conflict(
    "Your school has no current academic year yet, so students cannot be admitted. Set it up from the dashboard first (the \"Set up your current academic year\" card).",
    "NO_ACTIVE_YEAR"
  );

export const STUDENT_NOT_FOUND = () => ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");
export const GUARDIAN_NOT_FOUND = () => ApiError.notFound("Guardian not found", "GUARDIAN_NOT_FOUND");

/** A validation answer from a service, in the same shape as the request validator's (400 VALIDATION_ERROR, one entry per box). */
export const invalid = (path: string, message: string) => ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path, message }]);

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
