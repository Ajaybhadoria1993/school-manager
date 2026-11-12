import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { NOT_INACTIVE } from "../../academics/models/status";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { isViewing } from "../../academics/services/viewedYear";

/**
 * What a class studies and when it is taught is kept per UNIT: one section, or the class itself when it has no sections. A unit belongs to
 * one academic year (a section's own; the running year for a class that has no sections).
 */
export interface Unit {
  classId: string;
  className: string;
  /** Null for a class that has no sections. */
  sectionId: string | null;
  sectionName: string | null;
  /** "Class 5 - A", or "Class 1" when the class has no sections. */
  label: string;
  yearId: Types.ObjectId;
  yearName: string;
  /** The lesson days' timing follows the class, not the section. */
  classOrder: number;
}

/** A section is "Class 5 - A"; a class that is not split is "Class 1". */
export const unitLabel = (className: string, sectionName: string | null) => (sectionName ? `${className} - ${sectionName}` : className);

/**
 * The unit a request is about, checked against the school: the class exists; the section (if any) is the class's and belongs to the
 * running year or the next one that waits (a year that is over is history, not edited); a class without a section must really have none.
 */
export async function resolveUnit(tenantId: string, classId: string, sectionId: string | null): Promise<Unit> {
  const school = new Types.ObjectId(tenantId);
  const klass = await SchoolClass.findOne({ _id: classId, tenantId: school }).select("name order").lean();
  if (!klass) throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");

  if (sectionId) {
    const section = await Section.findOne({ _id: sectionId, tenantId: school, classId: klass._id }).select("name academicYearId").lean();
    if (!section) throw ApiError.notFound("Section not found", "SECTION_NOT_FOUND");
    const year = section.academicYearId ? await AcademicYear.findOne({ _id: section.academicYearId, tenantId: school }).select("name status").lean() : null;
    if (!year) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    // A year that is over is history: only read, and only by someone who asked to look at that year (academics/services/viewedYear.ts).
    if (year.status === "closed" && !isViewing(year._id)) throw ApiError.conflict("This section belongs to a year that is over. Its timetable cannot be changed.", "UNIT_YEAR_CLOSED");
    return { classId, className: klass.name, sectionId, sectionName: section.name, label: unitLabel(klass.name, section.name), yearId: year._id, yearName: year.name, classOrder: klass.order };
  }

  // A class that is not split belongs to the year being read: the running one, or a past one being looked at.
  const year = await AcademicYearService.shownYear(school);
  if (!year) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
  if (await Section.exists({ tenantId: school, classId: klass._id, academicYearId: year._id })) {
    throw ApiError.conflict(`${klass.name} has sections. Choose one of them.`, "UNIT_NEEDS_SECTION");
  }
  return { classId, className: klass.name, sectionId: null, sectionName: null, label: klass.name, yearId: year._id, yearName: year.name, classOrder: klass.order };
}

/** Every unit of the school's running year, in teaching order: each section, and each class that has none. */
export async function activeUnits(tenantId: string): Promise<Unit[]> {
  const school = new Types.ObjectId(tenantId);
  return unitsOf(school, await AcademicYear.findOne({ tenantId: school, status: "active" }).select("name").lean(), false);
}

/** The same for the year a screen is about: the running year, or a past one the school is looking at (academics/services/viewedYear.ts). */
export async function shownUnits(tenantId: string): Promise<Unit[]> {
  const school = new Types.ObjectId(tenantId);
  const year = await AcademicYearService.shownYear(school);
  return unitsOf(school, year, year !== null && year.status !== "active");
}

/**
 * The classes the school runs, with their sections. A class made inactive is left out, except when a past year is looked at: its
 * students and timetable were in it then.
 */
async function unitsOf(school: Types.ObjectId, year: { _id: Types.ObjectId; name: string } | null, withInactive: boolean): Promise<Unit[]> {
  if (!year) return [];
  const [classes, sections] = await Promise.all([
    SchoolClass.find({ tenantId: school, ...(withInactive ? {} : NOT_INACTIVE) }).sort({ order: 1, _id: 1 }).select("name order").lean(),
    Section.find({ tenantId: school, academicYearId: year._id }).select("name classId").lean(),
  ]);
  const byClass = new Map<string, typeof sections>();
  for (const s of sections) byClass.set(s.classId.toString(), [...(byClass.get(s.classId.toString()) ?? []), s]);
  const units: Unit[] = [];
  for (const klass of classes) {
    const own = (byClass.get(klass._id.toString()) ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    const base = { classId: klass._id.toString(), className: klass.name, yearId: year._id, yearName: year.name, classOrder: klass.order };
    if (own.length === 0) units.push({ ...base, sectionId: null, sectionName: null, label: klass.name });
    else for (const s of own) units.push({ ...base, sectionId: s._id.toString(), sectionName: s.name, label: unitLabel(klass.name, s.name) });
  }
  return units;
}
