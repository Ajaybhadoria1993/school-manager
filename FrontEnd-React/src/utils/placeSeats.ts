import type { AcademicStructure, StudentCapacity } from "../types";

/** A place with no seat left: a section, or a class that has no sections (its students sit in the class itself). */
export interface FullPlace {
  classId: string;
  sectionId: string | null;
  enrolled: number;
  capacity: number;
}

/**
 * The place the admission form has picked, when it has no seat left, else null: a section whose students fill its seats, or a class
 * with no sections whose students fill the class's own seats. A place with no limit set, a class that has sections but none picked yet
 * (the form asks for one), and a class the school does not have are never "full". Used by the Academic step, so a full place is asked
 * about there and not only when the student is admitted.
 */
export function fullPlaceOf(place: { classId: string; sectionId: string }, structure: AcademicStructure, capacity: StudentCapacity | undefined): FullPlace | null {
  const klass = structure.classes.find((c) => c.id === place.classId);
  if (!klass) return null;
  if (klass.sections.length > 0) {
    const section = klass.sections.find((s) => s.id === place.sectionId);
    const load = section ? capacity?.sections.find((s) => s.sectionId === section.id) : undefined;
    if (!section || !load || load.capacity === null || load.enrolled < load.capacity) return null;
    return { classId: klass.id, sectionId: section.id, enrolled: load.enrolled, capacity: load.capacity };
  }
  if (klass.capacity === null) return null;
  const enrolled = capacity?.classes.find((c) => c.classId === klass.id)?.enrolled ?? 0;
  return enrolled >= klass.capacity ? { classId: klass.id, sectionId: null, enrolled, capacity: klass.capacity } : null;
}
