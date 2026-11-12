import { ApiError } from "../../../utils/ApiError";
import { Section } from "../models/Section";

/**
 * How the seats of a class and of its sections fit together. A class has its own seats (SchoolClass.capacity); its sections split
 * them, so the sections of a class, together, never hold more than the class has. A class with no seats set (made in bulk, or before
 * seats existed) and a section with no seats are not held to it. Both services that change seats check it here, so the rule is one.
 */

/** The seats the sections of one class hold in one academic year, leaving out the section being changed. */
export async function seatsHeldBySections(
  tenantId: string,
  classId: string,
  academicYearId: unknown,
  exceptSectionId?: string
): Promise<number> {
  const sections = await Section.find({ tenantId, classId, academicYearId }).select("capacity").lean();
  return sections.filter((s) => s._id.toString() !== exceptSectionId).reduce((sum, s) => sum + (s.capacity ?? 0), 0);
}

/** A section's seats must fit in what the class has left after its other sections. */
export function assertSectionFits(className: string, classSeats: number | null | undefined, heldByOthers: number, sectionSeats: number | null | undefined): void {
  if (classSeats == null || sectionSeats == null || heldByOthers + sectionSeats <= classSeats) return;
  const left = Math.max(0, classSeats - heldByOthers);
  const message =
    left === 0
      ? `${className} has ${classSeats} seats and its other sections already hold all of them. Raise the seats of ${className} first.`
      : `${className} has ${classSeats} seats and its other sections hold ${heldByOthers}, so this section can have at most ${left}.`;
  throw ApiError.badRequest(message, "SECTION_SEATS_OVER_CLASS", [
    { path: "capacity", message: left === 0 ? "No seats are left in the class" : `At most ${left} seats are left in the class` },
  ]);
}

/** A class cannot be given fewer seats than its sections already hold. */
export function assertClassHolds(className: string, classSeats: number, heldBySections: number): void {
  if (classSeats >= heldBySections) return;
  throw ApiError.badRequest(
    `The sections of ${className} already hold ${heldBySections} seats, so the class needs at least ${heldBySections}. Lower the seats of its sections first.`,
    "CLASS_SEATS_BELOW_SECTIONS",
    [{ path: "capacity", message: `At least ${heldBySections} seats, as its sections hold` }]
  );
}

/**
 * A place (a section, or a class that has no sections) cannot be given fewer seats than the students already in it: it would be over its
 * own limit the moment it was saved. Students who left do not count.
 */
export function assertSeatsHold(name: string, seats: number, students: number, code: "CLASS_SEATS_BELOW_STUDENTS" | "SECTION_SEATS_BELOW_STUDENTS"): void {
  if (seats >= students) return;
  const are = `${students} ${students === 1 ? "student is" : "students are"} in it`;
  throw ApiError.badRequest(`${name} has ${students} student${students === 1 ? "" : "s"} in it, so it needs at least ${students} seats.`, code, [
    { path: "capacity", message: `At least ${students} seats, as ${are}` },
  ]);
}
