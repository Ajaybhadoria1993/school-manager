import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { logger } from "../../../utils/logger";
import { Enrolment } from "../../students/models/Enrolment";
import { EnrolmentChange } from "../../students/models/EnrolmentChange";
import { Student } from "../../students/models/Student";
import { actorRecord, type Actor } from "../../students/services/actor";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { sectionLetters } from "../constants";
import { SchoolClass } from "../models/SchoolClass";
import { Section } from "../models/Section";
import { isInactive } from "../models/status";
import type { DivideClassInput } from "../schemas/academics.schemas";
import { AcademicSettingsService } from "./academicSettings.service";
import { AcademicYearService } from "./academicYear.service";
import { ClassService } from "./class.service";
import { classInactive, } from "./guards";
import { isDuplicateKey, type ClassDto } from "./shared";

export interface DivideResult {
  class: ClassDto;
  /** The sections that were made, each with the students it now has. */
  sections: { id: string; name: string; capacity: number; room: string | null; students: number }[];
  /** How many students were moved out of the class itself into its sections. */
  moved: number;
  /** The class's seats before (null: not set) and after; they grow when the new sections hold more than the class had. */
  classSeats: { from: number | null; to: number };
}

/**
 * How many of `students` go into each of `count` sections when they are shared out evenly: the first sections get one more when it does
 * not divide. 41 students into 2 sections is 21 and 20. (The screen shows the same numbers before anything is changed: keep them in step
 * with `splitEvenly` in FrontEnd-React/src/utils/academics.ts.)
 */
export function splitEvenly(students: number, count: number): number[] {
  const base = Math.floor(students / count);
  const extra = students % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * A class that has no sections, and has students sitting in the class itself, is divided into sections (A, B...): the sections are made
 * and the students are shared out between them, in the order of their names, so nobody is left in a class that now has sections and
 * nobody has to be moved one by one. The roll numbers stay as they are (they were used once in the class, so once in each section).
 *
 * It is one request that checks everything first, then makes the sections and moves the students; a failure in the middle puts it all
 * back (no transactions on a standalone MongoDB, see AdmissionService). What the class studied and its timetable were kept for the class
 * itself, and are not copied into the sections: the school sets each section's own.
 */
export class DivideClassService {
  static async divide(tenantId: string, actor: Actor, classId: string, input: DivideClassInput): Promise<DivideResult> {
    const school = new Types.ObjectId(tenantId);
    const klass = await SchoolClass.findOne({ _id: classId, tenantId: school }).select("name status capacity").lean();
    if (!klass) throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
    if (isInactive(klass)) throw classInactive(klass.name);

    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    if (await Section.exists({ tenantId: school, classId: klass._id, academicYearId: yearId })) {
      throw ApiError.conflict(`${klass.name} already has sections: add the next one to it.`, "CLASS_ALREADY_SPLIT");
    }

    const rooms = Array.from({ length: input.count }, (_, i) => input.rooms?.[i] ?? null);
    if ((await AcademicSettingsService.get(tenantId)).sectionDetailsRequired) {
      const missing = rooms.flatMap((room, i) => (room === null ? [{ path: `rooms.${i}`, message: "Enter the room" }] : []));
      if (missing.length > 0) throw ApiError.badRequest("A section needs its seats and its room.", "SECTION_DETAILS_REQUIRED", missing);
    }

    // The students sitting in the class itself: shared out by name. (A student who left stays where they were, in no section.)
    const enrolments = await Enrolment.find({ tenantId: school, academicYearId: yearId, classId: klass._id, sectionId: null, status: "active" })
      .select("studentId rollNumber")
      .lean();
    const named = new Map(
      (await Student.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.studentId) } }).select("firstName lastName").lean()).map((s) => [
        s._id.toString(),
        `${s.firstName} ${s.lastName}`,
      ])
    );
    const ordered = [...enrolments].sort((a, b) =>
      (named.get(a.studentId.toString()) ?? "").localeCompare(named.get(b.studentId.toString()) ?? "", undefined, { sensitivity: "base" })
    );
    const sizes = splitEvenly(ordered.length, input.count);
    if (sizes[0] > input.capacity) {
      throw ApiError.badRequest(
        `${klass.name} has ${ordered.length} students: with ${input.count} sections the biggest has ${sizes[0]}, so each section needs at least ${sizes[0]} seats.`,
        "SECTION_SEATS_TOO_FEW",
        [{ path: "capacity", message: `At least ${sizes[0]} seats` }]
      );
    }

    const classFrom = klass.capacity ?? null;
    const classTo = Math.max(classFrom ?? 0, input.count * input.capacity);
    const names = sectionLetters(input.count);

    // Everything is checked: now it is written, and put back if a step fails.
    let made: Types.ObjectId[] = [];
    const moved: { id: Types.ObjectId; to: number }[] = [];
    let changes: Types.ObjectId[] = [];
    let classRaised = false;
    const undo = async () => {
      try {
        if (changes.length > 0) await EnrolmentChange.deleteMany({ tenantId: school, _id: { $in: changes } });
        if (moved.length > 0) await Enrolment.updateMany({ tenantId: school, _id: { $in: moved.map((m) => m.id) } }, { $set: { sectionId: null } });
        if (classRaised) await SchoolClass.updateOne({ _id: klass._id, tenantId: school }, { $set: { capacity: classFrom } });
        if (made.length > 0) await Section.deleteMany({ tenantId: school, _id: { $in: made } });
      } catch (err) {
        logger.error("divide_class_undo_failed", err, { tenantId, classId });
      }
    };

    try {
      const sections = await Section.insertMany(
        names.map((name, i) => ({ tenantId: school, classId: klass._id, academicYearId: yearId, name, nameKey: nameKeyOf(name), capacity: input.capacity, room: rooms[i] }))
      );
      made = sections.map((s) => s._id);
      if (classTo !== classFrom) {
        await SchoolClass.updateOne({ _id: klass._id, tenantId: school }, { $set: { capacity: classTo } });
        classRaised = true;
      }

      const by = await actorRecord(actor);
      let at = 0;
      const records: Record<string, unknown>[] = [];
      for (const [i, size] of sizes.entries()) {
        const group = ordered.slice(at, at + size);
        at += size;
        if (group.length === 0) continue;
        await Enrolment.updateMany({ tenantId: school, _id: { $in: group.map((e) => e._id) } }, { $set: { sectionId: sections[i]._id } });
        group.forEach((e) => moved.push({ id: e._id, to: i }));
        for (const e of group) {
          records.push({
            tenantId: school,
            academicYearId: yearId,
            studentId: e.studentId,
            enrolmentId: e._id,
            kind: "moved",
            from: { classId: klass._id, className: klass.name, sectionId: null, sectionName: null, rollNumber: e.rollNumber ?? null },
            to: { classId: klass._id, className: klass.name, sectionId: sections[i]._id, sectionName: names[i], rollNumber: e.rollNumber ?? null },
            reason: "Class divided into sections",
            by,
          });
        }
      }
      if (records.length > 0) changes = (await EnrolmentChange.insertMany(records)).map((c) => c._id as Types.ObjectId);

      return {
        class: await ClassService.get(tenantId, classId),
        sections: sections.map((s, i) => ({ id: s._id.toString(), name: s.name, capacity: input.capacity, room: s.room ?? null, students: sizes[i] })),
        moved: ordered.length,
        classSeats: { from: classFrom, to: classTo },
      };
    } catch (err) {
      await undo();
      if (isDuplicateKey(err)) {
        throw ApiError.conflict(`${klass.name} was divided a moment ago. Reload the page.`, "CLASS_ALREADY_SPLIT");
      }
      throw err;
    }
  }
}
