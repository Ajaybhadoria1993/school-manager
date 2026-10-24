import { Types } from "mongoose";
import { Enrolment } from "../../students/models/Enrolment";

/**
 * What the Students module tells the class and section delete guards: a class or section that has students cannot be deleted.
 *
 * An enrolment is one student in one class (and section, or none for a class that is not split) in one academic year; its
 * section is always a section of that same year. A section belongs to one year, so counting its active enrolments is enough.
 * A class lives across years, so its count covers EVERY academic year: an enrolment of a past year is history and keeps the class
 * alive, and so does a student of a class that has no sections (nobody would be counted by section).
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
 * The enrolments of a class, in the given (current) academic year and in every other year, whatever their state. Either one keeps
 * the class from being deleted: this year's are students to move first, the others are history.
 */
export async function enrolmentCountsByClass(
  tenantId: string,
  classId: string,
  currentYearId: Types.ObjectId | null
): Promise<{ thisYear: number; otherYears: number }> {
  const school = new Types.ObjectId(tenantId);
  const klass = new Types.ObjectId(classId);
  const [all, thisYear] = await Promise.all([
    Enrolment.countDocuments({ tenantId: school, classId: klass }),
    currentYearId ? Enrolment.countDocuments({ tenantId: school, classId: klass, academicYearId: currentYearId }) : Promise.resolve(0),
  ]);
  return { thisYear, otherYears: all - thisYear };
}
