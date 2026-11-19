import { Types } from "mongoose";
import { Enrolment } from "../../students/models/Enrolment";
import { AcademicYear } from "../models/AcademicYear";

/**
 * What the Students module tells the class and section guards: a class with students cannot be made inactive, a section with students
 * cannot be deleted.
 *
 * An enrolment is one student in one class (and section, or none for a class that is not split) in one academic year; its
 * section is always a section of that same year. A section belongs to one year, so counting its active enrolments is enough.
 */

/** How many active students sit in each of these sections, by section id (a section with none is absent). */
export async function studentCountsBySection(tenantId: string, sectionIds: string[]): Promise<Map<string, number>> {
  if (sectionIds.length === 0) return new Map();
  const rows = await Enrolment.aggregate<{ _id: Types.ObjectId; n: number }>([
    {
      $match: {
        tenantId: new Types.ObjectId(tenantId),
        sectionId: { $in: sectionIds.map((id) => new Types.ObjectId(id)) },
        status: "active",
      },
    },
    { $group: { _id: "$sectionId", n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.n]));
}

/**
 * The students who still sit in a class: active in it this year (in one of its sections, or in the class itself when it has none), or
 * promoted into it for the year that is waiting. Each student is counted once. A student who left (inactive) and a past year's student
 * are history, which stays with the class and does not stop it from being made inactive.
 */
export async function activeStudentsInClass(tenantId: string, classId: string): Promise<number> {
  const school = new Types.ObjectId(tenantId);
  const years = await AcademicYear.find({ tenantId: school, status: { $in: ["active", "pending"] } }).select("_id").lean();
  if (years.length === 0) return 0;
  const students = await Enrolment.distinct("studentId", {
    tenantId: school,
    classId: new Types.ObjectId(classId),
    academicYearId: { $in: years.map((y) => y._id) },
    status: "active",
  });
  return students.length;
}

/**
 * The students who sit in a class ITSELF this year (active, in no section): a class that is not split holds its students itself. When such
 * a class is given its first section they must be shared out into sections (see divide.service.ts), so a section is never added by hand
 * over them; and the class's own seats cannot go below this number.
 */
export async function studentsInClassItself(tenantId: string, classId: string): Promise<number> {
  const school = new Types.ObjectId(tenantId);
  const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id").lean();
  if (!year) return 0;
  return Enrolment.countDocuments({ tenantId: school, classId: new Types.ObjectId(classId), academicYearId: year._id, sectionId: null, status: "active" });
}
