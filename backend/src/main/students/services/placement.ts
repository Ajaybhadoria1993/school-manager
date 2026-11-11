import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { Enrolment } from "../models/Enrolment";
import { classNumber, needsStream, streamOf } from "../classNumber";
import { placeTitle } from "./shared";

/** A class (and section) of the current academic year that a student is being put in, checked against the database. */
export interface Placement {
  classId: Types.ObjectId;
  className: string;
  sectionId: Types.ObjectId | null;
  sectionName: string | null;
  /** The section's seats; null when it has no limit (or there is no section). */
  capacity: number | null;
}

/**
 * Checks where a student is being put, for this school and this academic year:
 *  - the class is one of the school's;
 *  - a class that has sections this year needs one of them (a student of a split class sits in a section);
 *  - the section belongs to THAT class and to THIS year (a section of another class, of last year, or of another school is refused);
 *  - a class with no sections this year takes the student without one;
 *  - Class 11 and 12 are taught in streams: a student goes into a stream's class ("Class 11 Science"), never into "Class 11" as a
 *    whole (STREAM_REQUIRED, naming the streams the school has). `allowNoStream` is for a student who already sits in such a class
 *    and only changes something else (the roll number): the rule is for putting a student INTO a class.
 * Ids that are not the school's are answered like ids that do not exist, so nothing about another school is revealed.
 */
export async function resolvePlacement(
  tenantId: Types.ObjectId,
  academicYearId: Types.ObjectId,
  classId: string | Types.ObjectId,
  sectionId: string | Types.ObjectId | null | undefined,
  options: { allowNoStream?: boolean } = {}
): Promise<Placement> {
  const klass = await SchoolClass.findOne({ _id: classId, tenantId }).select("name").lean();
  if (!klass) {
    throw ApiError.badRequest("That class is not in your school.", "CLASS_NOT_FOUND", [
      { path: "classId", message: "That class is not in your school any more. Reload the page and pick again" },
    ]);
  }
  if (!options.allowNoStream && needsStream(klass.name)) throw await streamRequired(tenantId, klass.name);
  const sections = await Section.find({ tenantId, classId: klass._id, academicYearId }).select("name capacity").lean();
  if (sectionId) {
    const section = sections.find((s) => s._id.equals(sectionId));
    if (!section) {
      throw ApiError.badRequest(`That section is not a section of ${klass.name} this year.`, "SECTION_NOT_FOUND", [
        { path: "sectionId", message: `Choose a section of ${klass.name}` },
      ]);
    }
    return { classId: klass._id, className: klass.name, sectionId: section._id, sectionName: section.name, capacity: section.capacity ?? null };
  }
  if (sections.length > 0) {
    throw ApiError.badRequest(`${klass.name} is split into sections: choose one.`, "SECTION_REQUIRED", [
      { path: "sectionId", message: "Choose the section" },
    ]);
  }
  return { classId: klass._id, className: klass.name, sectionId: null, sectionName: null, capacity: null };
}

/** 400 STREAM_REQUIRED: Class 11 or 12 as a whole takes no students; the message names the streams the school has (or says there are none). */
async function streamRequired(tenantId: Types.ObjectId, className: string): Promise<ApiError> {
  const number = classNumber(className);
  const classes = await SchoolClass.find({ tenantId }).select("name order").sort({ order: 1, name: 1 }).lean();
  const streams = classes.filter((c) => classNumber(c.name) === number && streamOf(c.name) !== null).map((c) => c.name);
  const message =
    streams.length > 0
      ? `${className} is taught in streams: choose one of ${streams.join(", ")}.`
      : `${className} is taught in streams, and your school has none yet: add them (for example ${className} Science) in Classes & Sections.`;
  return ApiError.badRequest(message, "STREAM_REQUIRED", [{ path: "classId", message: streams.length > 0 ? "Choose the stream" : "Add the streams of this class first" }]);
}

/** 409 SECTION_FULL with the numbers, so the screen can ask "admit anyway?". */
export function sectionFull(placement: Placement, enrolled: number): ApiError {
  const title = placeTitle(placement.className, placement.sectionName);
  const capacity = placement.capacity ?? 0;
  return ApiError.conflict(`${title} is full: ${enrolled} of ${capacity} seats are taken.`, "SECTION_FULL", [
    { path: "sectionId", message: `${title} is full (${enrolled} of ${capacity} seats taken)`, capacity, enrolled, seatsLeft: 0 },
  ]);
}

/** Active students in a section this year, leaving one student out (the one being moved, who is already counted there). */
export async function seatsTaken(
  tenantId: Types.ObjectId,
  academicYearId: Types.ObjectId,
  sectionId: Types.ObjectId,
  exceptStudentId?: Types.ObjectId
): Promise<number> {
  return Enrolment.countDocuments({
    tenantId,
    academicYearId,
    sectionId,
    status: "active",
    ...(exceptStudentId ? { studentId: { $ne: exceptStudentId } } : {}),
  });
}

/**
 * Before writing: a section with a seat limit that is already full is refused (409 SECTION_FULL) unless the person said
 * "admit anyway" (`allowOverCapacity`). Never silently over the limit.
 */
export async function assertSeat(
  tenantId: Types.ObjectId,
  academicYearId: Types.ObjectId,
  placement: Placement,
  allowOverCapacity: boolean,
  exceptStudentId?: Types.ObjectId
): Promise<void> {
  if (allowOverCapacity || !placement.sectionId || placement.capacity === null) return;
  const enrolled = await seatsTaken(tenantId, academicYearId, placement.sectionId, exceptStudentId);
  if (enrolled >= placement.capacity) throw sectionFull(placement, enrolled);
}

/**
 * After writing a new enrolment: was its seat really free? Two admissions into the last seat at the same moment both pass
 * `assertSeat`; the enrolments are ranked by their id (the order they were made), and the one that came after the last seat
 * gives its place back (the caller undoes the admission). So a section never ends up over its limit without someone saying so.
 */
export async function seatHeld(
  tenantId: Types.ObjectId,
  academicYearId: Types.ObjectId,
  placement: Placement,
  enrolmentId: Types.ObjectId
): Promise<{ held: boolean; enrolled: number }> {
  if (!placement.sectionId || placement.capacity === null) return { held: true, enrolled: 0 };
  const rank = await Enrolment.countDocuments({
    tenantId,
    academicYearId,
    sectionId: placement.sectionId,
    status: "active",
    _id: { $lte: enrolmentId },
  });
  return { held: rank <= placement.capacity, enrolled: rank - 1 };
}

/** A roll number is used once in a section (in a class, for a class without sections) in a year. */
export async function assertRollNumberFree(
  tenantId: Types.ObjectId,
  academicYearId: Types.ObjectId,
  placement: Placement,
  rollNumber: number | null | undefined,
  exceptStudentId?: Types.ObjectId
): Promise<void> {
  if (rollNumber === null || rollNumber === undefined) return;
  const taken = await Enrolment.exists({
    tenantId,
    academicYearId,
    classId: placement.classId,
    sectionId: placement.sectionId,
    rollNumber,
    ...(exceptStudentId ? { studentId: { $ne: exceptStudentId } } : {}),
  });
  if (taken) throw rollNumberTaken(placement, rollNumber);
}

export function rollNumberTaken(placement: Placement, rollNumber: number): ApiError {
  const title = placeTitle(placement.className, placement.sectionName);
  return ApiError.conflict(`Roll number ${rollNumber} is already used in ${title}.`, "ROLL_NUMBER_TAKEN", [
    { path: "rollNumber", message: `Roll number ${rollNumber} is already used in ${title}` },
  ]);
}
