import { Types } from "mongoose";
import { Notify } from "../../notifications/services/events";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { isDuplicateKey } from "../../academics/services/shared";
import { openYearIds } from "../../subjects/services/subject.service";
import { resolveUnit, unitLabel } from "../../timetable/services/unit";
import { ClassTeacher } from "../models/ClassTeacher";
import { Teacher } from "../models/Teacher";
import type { SetClassTeacherInput } from "../schemas/staff.schemas";

/** A unit (a section, or a class without sections) as a teacher's page lists it. */
export interface UnitRefDto {
  classId: string;
  sectionId: string | null;
  /** "Class 5 - A", or "Class 1" for a class without sections. */
  label: string;
  academicYear: { id: string; name: string };
}

export interface ClassTeacherDto {
  classId: string;
  sectionId: string | null;
  label: string;
  teacher: { id: string; name: string } | null;
  /** Only when `releaseOthers` was asked: the classes the teacher left to come here ("Class 5 - A"), in teaching order. */
  released?: string[];
}

/** The key of a unit in the maps below: "classId:sectionId", "classId:none" for a class without sections. */
export const unitKeyOf = (classId: Types.ObjectId | string, sectionId: Types.ObjectId | string | null) => `${classId.toString()}:${sectionId ? sectionId.toString() : "none"}`;

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/**
 * Names units for a screen: "Class 5 - A" with the year, in teaching order (the class's place, then the section's name). One read each of
 * the classes, sections and years named.
 */
export async function describeUnits<T extends { classId: Types.ObjectId; sectionId: Types.ObjectId | null; academicYearId: Types.ObjectId }>(
  tenantId: string,
  rows: T[]
): Promise<(T & { ref: UnitRefDto; order: number; sectionName: string })[]> {
  if (rows.length === 0) return [];
  const school = new Types.ObjectId(tenantId);
  const [classes, sections, years] = await Promise.all([
    SchoolClass.find({ tenantId: school, _id: { $in: rows.map((r) => r.classId) } }).select("name order").lean(),
    Section.find({ tenantId: school, _id: { $in: rows.flatMap((r) => (r.sectionId ? [r.sectionId] : [])) } }).select("name").lean(),
    AcademicYear.find({ tenantId: school, _id: { $in: rows.map((r) => r.academicYearId) } }).select("name").lean(),
  ]);
  const classById = new Map(classes.map((c) => [c._id.toString(), c]));
  const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));
  const yearName = new Map(years.map((y) => [y._id.toString(), y.name]));
  return rows
    .flatMap((row) => {
      const klass = classById.get(row.classId.toString());
      if (!klass) return [];
      const section = row.sectionId ? (sectionName.get(row.sectionId.toString()) ?? null) : null;
      if (row.sectionId && section === null) return [];
      return [
        {
          ...row,
          order: klass.order,
          sectionName: section ?? "",
          ref: {
            classId: row.classId.toString(),
            sectionId: row.sectionId ? row.sectionId.toString() : null,
            label: unitLabel(klass.name, section),
            academicYear: { id: row.academicYearId.toString(), name: yearName.get(row.academicYearId.toString()) ?? "" },
          },
        },
      ];
    })
    .sort((a, b) => a.ref.academicYear.name.localeCompare(b.ref.academicYear.name) || a.order - b.order || byText(a.sectionName, b.sectionName));
}

/**
 * The class teacher of each unit: set from a class's page or a teacher's page, shown on both, and in the teacher list. A teacher who
 * leaves lets go of their classes; one whose classes are given to another teacher hands them over too.
 */
export class ClassTeacherService {
  /** Makes `teacherId` the class teacher of the unit, or takes the class teacher away (null). The teachers concerned hear of it. */
  static async set(tenantId: string, input: SetClassTeacherInput, actorId: string | null = null): Promise<ClassTeacherDto> {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId);
    const school = new Types.ObjectId(tenantId);
    const where = {
      tenantId: school,
      academicYearId: unit.yearId,
      classId: new Types.ObjectId(unit.classId),
      sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null,
    };
    const base = { classId: unit.classId, sectionId: unit.sectionId, label: unit.label };
    const before = (await ClassTeacher.findOne(where).select("teacherId").lean())?.teacherId.toString() ?? null;
    if (!input.teacherId) {
      await ClassTeacher.deleteOne(where);
      if (actorId) Notify.classTeacherChanged(tenantId, actorId, unit, null, before);
      return { ...base, teacher: null };
    }

    const teacher = await Teacher.findOne({ _id: input.teacherId, tenantId: school }).select("name isActive").lean();
    if (!teacher) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "teacherId", message: "Choose a teacher from your school's list" }]);
    if (!teacher.isActive) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "teacherId", message: `${teacher.name} is no longer teaching here` }]);

    // Moving (`releaseOthers`): the teacher's other posts of this year, found before anything is written.
    const others = input.releaseOthers
      ? (await ClassTeacher.find({ tenantId: school, academicYearId: unit.yearId, teacherId: teacher._id }).lean()).filter(
          (post) => !(post.classId.toString() === unit.classId && (post.sectionId ? post.sectionId.toString() : null) === unit.sectionId)
        )
      : [];

    const write = () => ClassTeacher.updateOne(where, { $set: { teacherId: teacher._id } }, { upsert: true });
    try {
      await write();
    } catch (err) {
      // Two requests made the same unit's row at once: it is there now, so this one only changes it.
      if (!isDuplicateKey(err)) throw err;
      await write();
    }
    const now = { id: teacher._id.toString(), name: teacher.name };
    if (actorId) Notify.classTeacherChanged(tenantId, actorId, unit, now, before);

    let released: string[] | undefined;
    if (input.releaseOthers) {
      // The new post is kept first; then the teacher is taken off the others, and each of those classes (and the teacher) hears of it.
      released = (await describeUnits(tenantId, others)).map((p) => p.ref.label);
      if (others.length > 0) await ClassTeacher.deleteMany({ tenantId: school, _id: { $in: others.map((post) => post._id) } });
      for (const post of others) {
        try {
          const left = await resolveUnit(tenantId, post.classId.toString(), post.sectionId ? post.sectionId.toString() : null);
          if (actorId) Notify.classTeacherChanged(tenantId, actorId, left, null, now.id);
        } catch {
          // A class that cannot be read any more has nobody to tell; the post is gone all the same.
        }
      }
    }
    return { ...base, teacher: now, ...(released ? { released } : {}) };
  }

  /** Every class teacher of a year, by unit key (for the class pages). */
  static async ofYear(tenantId: string, yearId: string): Promise<Map<string, { id: string; name: string }>> {
    const school = new Types.ObjectId(tenantId);
    const posts = await ClassTeacher.find({ tenantId: school, academicYearId: new Types.ObjectId(yearId) }).lean();
    if (posts.length === 0) return new Map();
    const teachers = await Teacher.find({ tenantId: school, _id: { $in: posts.map((p) => p.teacherId) } }).select("name").lean();
    const name = new Map(teachers.map((t) => [t._id.toString(), t.name]));
    return new Map(posts.map((p) => [unitKeyOf(p.classId, p.sectionId), { id: p.teacherId.toString(), name: name.get(p.teacherId.toString()) ?? "A teacher" }]));
  }

  /** The units each teacher is the class teacher of in the running (and the next) year, as labels, by teacher id. */
  static async labelsByTeacher(tenantId: string, teacherIds?: Types.ObjectId[]): Promise<Map<string, string[]>> {
    const years = await openYearIds(tenantId);
    if (years.length === 0) return new Map();
    const posts = await ClassTeacher.find({
      tenantId: new Types.ObjectId(tenantId),
      academicYearId: { $in: years },
      ...(teacherIds ? { teacherId: { $in: teacherIds } } : {}),
    }).lean();
    const named = await describeUnits(tenantId, posts);
    const labels = new Map<string, string[]>();
    for (const p of named) labels.set(p.teacherId.toString(), [...(labels.get(p.teacherId.toString()) ?? []), p.ref.label]);
    return labels;
  }

  /** The units a teacher is the class teacher of (their page). */
  static async ofTeacher(tenantId: string, teacherId: string): Promise<UnitRefDto[]> {
    const years = await openYearIds(tenantId);
    if (years.length === 0) return [];
    const posts = await ClassTeacher.find({ tenantId: new Types.ObjectId(tenantId), academicYearId: { $in: years }, teacherId: new Types.ObjectId(teacherId) }).lean();
    return (await describeUnits(tenantId, posts)).map((p) => p.ref);
  }

  /** The teachers who are the class teacher of some unit in the running (and the next) year, or of one of `classId`'s units. */
  static async teacherIds(tenantId: string, classId?: string): Promise<Types.ObjectId[]> {
    const years = await openYearIds(tenantId);
    if (years.length === 0) return [];
    return ClassTeacher.distinct("teacherId", {
      tenantId: new Types.ObjectId(tenantId),
      academicYearId: { $in: years },
      ...(classId ? { classId: new Types.ObjectId(classId) } : {}),
    });
  }

  /** A teacher who has left is nobody's class teacher any more. */
  static async release(tenantId: string, teacherId: string): Promise<void> {
    const years = await openYearIds(tenantId);
    if (years.length === 0) return;
    await ClassTeacher.deleteMany({ tenantId: new Types.ObjectId(tenantId), academicYearId: { $in: years }, teacherId: new Types.ObjectId(teacherId) });
  }

  /** The classes of one teacher go to another (Give classes): their class teacher posts too. */
  static async handOver(tenantId: string, years: Types.ObjectId[], fromId: Types.ObjectId, toId: Types.ObjectId): Promise<void> {
    if (years.length === 0) return;
    await ClassTeacher.updateMany({ tenantId: new Types.ObjectId(tenantId), academicYearId: { $in: years }, teacherId: fromId }, { $set: { teacherId: toId } });
  }
}
