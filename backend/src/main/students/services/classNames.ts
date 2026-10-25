import { Types } from "mongoose";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Enrolment } from "../models/Enrolment";

/** The name of one of this school's classes, from the id a request carries; null when it is no class of this school (the admission says so). */
export async function classNameOf(school: Types.ObjectId | string, classId: unknown): Promise<string | null> {
  if (typeof classId !== "string" || !Types.ObjectId.isValid(classId)) return null;
  const klass = await SchoolClass.findOne({ _id: classId, tenantId: school }).select("name").lean();
  return klass?.name ?? null;
}

/** The name of the class a student is in this year (the school's active academic year); null when there is none. */
export async function currentClassNameOf(school: Types.ObjectId | string, studentId: string): Promise<string | null> {
  const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id").lean();
  if (!year) return null;
  const enrolment = await Enrolment.findOne({ tenantId: school, studentId, academicYearId: year._id }).select("classId").lean();
  return enrolment ? classNameOf(school, enrolment.classId.toString()) : null;
}
