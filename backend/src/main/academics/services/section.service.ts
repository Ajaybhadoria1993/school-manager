import { ApiError } from "../../../utils/ApiError";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { MAX_SECTIONS_PER_CLASS } from "../constants";
import { SchoolClass } from "../models/SchoolClass";
import { Section } from "../models/Section";
import type { CreateSectionInput, UpdateSectionInput } from "../schemas/academics.schemas";
import { AcademicSettingsService } from "./academicSettings.service";
import { AcademicYearService } from "./academicYear.service";
import { isDuplicateKey, toSectionDto, type SectionDto } from "./shared";
import { studentCountsBySection } from "./usage";

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
    if (!(await SchoolClass.exists({ _id: classId, tenantId }))) {
      throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
    }
    assertDetails((await AcademicSettingsService.get(tenantId)).sectionDetailsRequired, input.capacity ?? null, input.room ?? null);
    // A new section is for the school's current session; the limit and the "already exists" check are per session too.
    const academicYearId = await AcademicYearService.activeYearId(tenantId);
    if ((await Section.countDocuments({ tenantId, classId, academicYearId })) >= MAX_SECTIONS_PER_CLASS) {
      throw ApiError.conflict(`A class can have up to ${MAX_SECTIONS_PER_CLASS} sections.`, "LIMIT_REACHED");
    }
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
      if (isDuplicateKey(err)) throw EXISTS(input.name);
      throw err;
    }
  }

  static async update(tenantId: string, id: string, input: UpdateSectionInput): Promise<SectionDto> {
    // The section as it will be after this change must have what the school requires; a section that never had its seats or
    // room (made before the rule, or in bulk with its class) is completed the first time it is changed.
    const current = await Section.findOne({ _id: id, tenantId }).select("capacity room academicYearId").lean();
    if (!current) throw NOT_FOUND();
    await assertCurrentYear(tenantId, current.academicYearId);
    assertDetails(
      (await AcademicSettingsService.get(tenantId)).sectionDetailsRequired,
      input.capacity !== undefined ? input.capacity : (current.capacity ?? null),
      input.room !== undefined ? input.room : (current.room ?? null)
    );

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
    const section = await Section.findOne({ _id: id, tenantId }).select("academicYearId").lean();
    if (!section) throw NOT_FOUND();
    await assertCurrentYear(tenantId, section.academicYearId);

    const students = (await studentCountsBySection(tenantId, [id])).get(id) ?? 0;
    if (students > 0) {
      throw ApiError.conflict(
        `This section has ${students} student${students === 1 ? "" : "s"}. Move them to another section first.`,
        "SECTION_HAS_STUDENTS"
      );
    }
    await Section.deleteOne({ _id: id, tenantId });
  }
}
