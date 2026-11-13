import { ApiError } from "../../../utils/ApiError";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { TimetableCleanup } from "../../timetable/services/cleanup";
import { MAX_CLASS_CAPACITY, MAX_SECTIONS_PER_CLASS } from "../constants";
import { SchoolClass } from "../models/SchoolClass";
import { Section } from "../models/Section";
import { isInactive } from "../models/status";
import type { CreateSectionInput, UpdateSectionInput } from "../schemas/academics.schemas";
import { AcademicSettingsService } from "./academicSettings.service";
import { AcademicYearService } from "./academicYear.service";
import { classInactive } from "./guards";
import { assertSectionFits, assertSeatsHold, seatsHeldBySections } from "./seats";
import { isDuplicateKey, toSectionDto, type SectionDto } from "./shared";
import { studentCountsBySection, studentsInClassItself } from "./usage";

const NOT_FOUND = () => ApiError.notFound("Section not found", "SECTION_NOT_FOUND");
const EXISTS = (name: string) => ApiError.conflict(`This class already has a section called "${name}".`, "SECTION_EXISTS");

/**
 * A section must have its seats and its room when the school has not made them optional (Tenant.settings, see
 * AcademicSettingsService). The browser checks this too, for a message before anything is sent, but this is the rule: a request
 * that comes from anywhere else is refused the same way. The answer lists each missing box by name ({ path, message }), like every
 * other validation error, so a form can show it under the right box.
 */
function assertDetails(required: boolean, capacity: number | null, room: string | null): void {
  if (!required) return;
  const missing: { path: string; message: string }[] = [];
  if (capacity === null) missing.push({ path: "capacity", message: "Enter the seats" });
  if (room === null) missing.push({ path: "room", message: "Enter the room" });
  if (missing.length > 0) {
    throw ApiError.badRequest("A section needs its seats and its room.", "SECTION_DETAILS_REQUIRED", missing);
  }
}

/**
 * A section belongs to one academic year, and only the current year's sections can be changed or deleted: a section of a past (or
 * future) year is that year's record (its students, its attendance), not something to edit from this year's screen.
 */
async function assertCurrentYear(tenantId: string, sectionYear: { toString(): string } | null | undefined): Promise<void> {
  const current = await AcademicYearService.activeYearId(tenantId);
  if ((sectionYear?.toString() ?? null) !== (current?.toString() ?? null)) {
    throw ApiError.conflict("This section belongs to another academic year and cannot be changed from the current one.", "SECTION_OTHER_YEAR");
  }
}

export class SectionService {
  static async create(tenantId: string, classId: string, input: CreateSectionInput): Promise<SectionDto> {
    const klass = await SchoolClass.findOne({ _id: classId, tenantId }).select("name capacity status").lean();
    if (!klass) throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
    if (isInactive(klass)) throw classInactive(klass.name);
    assertDetails((await AcademicSettingsService.get(tenantId)).sectionDetailsRequired, input.capacity ?? null, input.room ?? null);
    // A new section is for the school's current session; the limit and the "already exists" check are per session too.
    const academicYearId = await AcademicYearService.activeYearId(tenantId);
    // Its seats come out of the class's seats, with those of the sections the class already has. With `raiseClassSeats` a section that does not
    // fit makes the class's seats grow (written below, once nothing else can refuse the section).
    const held = await seatsHeldBySections(tenantId, classId, academicYearId);
    const growsTo =
      input.raiseClassSeats && klass.capacity != null && input.capacity != null && held + input.capacity > klass.capacity ? held + input.capacity : null;
    if (growsTo === null) assertSectionFits(klass.name, klass.capacity, held, input.capacity);
    else if (growsTo > MAX_CLASS_CAPACITY) {
      throw ApiError.badRequest(`${klass.name} would need ${growsTo} seats: a class can have at most ${MAX_CLASS_CAPACITY}.`, "CLASS_SEATS_TOO_MANY", [
        { path: "capacity", message: `At most ${MAX_CLASS_CAPACITY - held} seats for this section` },
      ]);
    }
    const existing = await Section.countDocuments({ tenantId, classId, academicYearId });
    if (existing >= MAX_SECTIONS_PER_CLASS) {
      throw ApiError.conflict(`A class can have up to ${MAX_SECTIONS_PER_CLASS} sections.`, "LIMIT_REACHED");
    }
    // The FIRST section of a class that has students sitting in the class itself would leave them in no section: the class is divided
    // instead, which makes the sections and shares those students out between them (divide.service.ts).
    if (existing === 0) {
      const inClass = await studentsInClassItself(tenantId, classId);
      if (inClass > 0) {
        throw ApiError.conflict(
          `${klass.name} has ${inClass} student${inClass === 1 ? "" : "s"} who ${inClass === 1 ? "is" : "are"} not in a section. Divide the class into sections instead: the students are shared out between them.`,
          "CLASS_HAS_UNSECTIONED_STUDENTS",
          [{ path: "classId", message: `${inClass} ${inClass === 1 ? "student is" : "students are"} not in a section`, enrolled: inClass }]
        );
      }
    }
    // The class's seats grow first and are put back when the section cannot be made (no transactions: check, write, undo).
    if (growsTo !== null) await SchoolClass.updateOne({ _id: classId, tenantId }, { $set: { capacity: growsTo } });
    try {
      const section = await Section.create({
        tenantId,
        classId,
        academicYearId,
        name: input.name,
        nameKey: nameKeyOf(input.name),
        capacity: input.capacity ?? null,
        room: input.room ?? null,
      });
      return toSectionDto(section);
    } catch (err) {
      if (growsTo !== null) await SchoolClass.updateOne({ _id: classId, tenantId }, { $set: { capacity: klass.capacity } });
      if (isDuplicateKey(err)) throw EXISTS(input.name);
      throw err;
    }
  }

  static async update(tenantId: string, id: string, input: UpdateSectionInput): Promise<SectionDto> {
    // The section as it will be after this change must have what the school requires; a section that never had its seats or
    // room (made before the rule, or in bulk with its class) is completed the first time it is changed.
    const current = await Section.findOne({ _id: id, tenantId }).select("name capacity room academicYearId classId").lean();
    if (!current) throw NOT_FOUND();
    const klass = await SchoolClass.findOne({ _id: current.classId, tenantId }).select("name capacity status").lean();
    if (klass && isInactive(klass)) throw classInactive(klass.name);
    await assertCurrentYear(tenantId, current.academicYearId);
    assertDetails(
      (await AcademicSettingsService.get(tenantId)).sectionDetailsRequired,
      input.capacity !== undefined ? input.capacity : (current.capacity ?? null),
      input.room !== undefined ? input.room : (current.room ?? null)
    );
    // New seats must fit in the class with the other sections' seats, and hold the students already in the section; a change of anything
    // else never trips this (a section that was filled past its seats "anyway" can still change its room).
    if (input.capacity != null && klass) {
      assertSectionFits(klass.name, klass.capacity, await seatsHeldBySections(tenantId, current.classId.toString(), current.academicYearId, id), input.capacity);
      assertSeatsHold(`${klass.name} - ${current.name}`, input.capacity, (await studentCountsBySection(tenantId, [id])).get(id) ?? 0, "SECTION_SEATS_BELOW_STUDENTS");
    }

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) Object.assign(changes, { name: input.name, nameKey: nameKeyOf(input.name) });
    if (input.capacity !== undefined) changes.capacity = input.capacity;
    if (input.room !== undefined) changes.room = input.room;

    try {
      const section = await Section.findOneAndUpdate({ _id: id, tenantId }, { $set: changes }, { new: true });
      if (!section) throw NOT_FOUND();
      return toSectionDto(section);
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS(input.name ?? "");
      throw err;
    }
  }

  /** A section with students cannot be deleted (the students module reports that, see usage.ts). */
  static async remove(tenantId: string, id: string): Promise<void> {
    const section = await Section.findOne({ _id: id, tenantId }).select("academicYearId classId").lean();
    if (!section) throw NOT_FOUND();
    const klass = await SchoolClass.findOne({ _id: section.classId, tenantId }).select("name status").lean();
    if (klass && isInactive(klass)) throw classInactive(klass.name);
    await assertCurrentYear(tenantId, section.academicYearId);

    const students = (await studentCountsBySection(tenantId, [id])).get(id) ?? 0;
    if (students > 0) {
      throw ApiError.conflict(
        `This section has ${students} student${students === 1 ? "" : "s"}. Move them to another section first.`,
        "SECTION_HAS_STUDENTS"
      );
    }
    await Section.deleteOne({ _id: id, tenantId });
    // What it studied and its timetable go with it.
    await TimetableCleanup.forSection(tenantId, id);
  }
}
