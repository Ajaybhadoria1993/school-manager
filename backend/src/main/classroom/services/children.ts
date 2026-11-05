import { Types } from "mongoose";
import { Enrolment } from "../../students/models/Enrolment";
import { Student } from "../../students/models/Student";
import { fullName } from "../../students/services/shared";

/** The active children of a class or section this year, by roll number then name. */
export async function childrenOf(tenantId: string, unit: { classId: string; sectionId: string | null; yearId: Types.ObjectId }) {
  const school = new Types.ObjectId(tenantId);
  const enrolments = await Enrolment.find({
    tenantId: school,
    academicYearId: unit.yearId,
    classId: new Types.ObjectId(unit.classId),
    sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null,
    status: "active",
  })
    .select("studentId rollNumber")
    .lean();
  const students = await Student.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.studentId) }, status: "active" }).select("firstName lastName admissionNumber").lean();
  const roll = new Map(enrolments.map((e) => [e.studentId.toString(), e.rollNumber ?? null]));
  return students
    .map((s) => ({ id: s._id.toString(), name: fullName(s), admissionNumber: s.admissionNumber, rollNumber: roll.get(s._id.toString()) ?? null }))
    .sort((a, b) => (a.rollNumber ?? 9999) - (b.rollNumber ?? 9999) || a.name.localeCompare(b.name));
}
