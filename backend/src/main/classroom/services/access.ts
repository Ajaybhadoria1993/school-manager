import { Types } from "mongoose";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Teacher } from "../../staff/models/Teacher";
import { describeUnits } from "../../staff/services/classTeacher.service";
import { Allotment } from "../../subjects/models/Allotment";
import { Subject } from "../../subjects/models/Subject";

/** A class with no sections, or one section of a class. */
export interface Unit {
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
}

export const RUNNER_ROLES: readonly string[] = ["school_admin", "principal"];
export const sameUnit = (a: { classId: Types.ObjectId | string | null; sectionId: Types.ObjectId | string | null }, b: { classId: Types.ObjectId | string | null; sectionId: Types.ObjectId | string | null }) =>
  String(a.classId) === String(b.classId) && String(a.sectionId ?? "") === String(b.sectionId ?? "");

/** The teacher whose login this is (a teacher who left has no say), or null. */
export async function teacherOfUser(tenantId: string, userId: string) {
  return Teacher.findOne({ tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId), isActive: true }).select("name").lean();
}

/** The classes (or sections) this teacher is the class teacher of, this year. */
export async function classTeacherUnits(tenantId: string, teacherId: Types.ObjectId): Promise<Unit[]> {
  const yearId = await AcademicYearService.activeYearId(tenantId);
  if (!yearId) return [];
  const rows = await ClassTeacher.find({ tenantId: new Types.ObjectId(tenantId), academicYearId: yearId, teacherId }).select("classId sectionId").lean();
  return rows.map((r) => ({ classId: r.classId, sectionId: r.sectionId ?? null }));
}

/** The subjects of classes (or sections) this teacher teaches, this year. */
export async function teachingUnits(tenantId: string, teacherId: Types.ObjectId): Promise<(Unit & { subjectId: Types.ObjectId })[]> {
  const yearId = await AcademicYearService.activeYearId(tenantId);
  if (!yearId) return [];
  const rows = await Allotment.find({ tenantId: new Types.ObjectId(tenantId), academicYearId: yearId, teacherId }).select("classId sectionId subjectId").lean();
  return rows.map((r) => ({ classId: r.classId, sectionId: r.sectionId ?? null, subjectId: r.subjectId }));
}

/**
 * A teacher's own classes (their home, docs/parent-teacher-flow.md): the ones they are the class teacher of and the ones they teach a
 * subject in, each with those subjects, in the school's class order.
 */
export async function myClasses(tenantId: string, teacherId: Types.ObjectId) {
  const [heads, teaching] = await Promise.all([classTeacherUnits(tenantId, teacherId), teachingUnits(tenantId, teacherId)]);
  const keyOf = (u: Unit) => `${u.classId.toString()}:${u.sectionId?.toString() ?? ""}`;
  const units = new Map<string, { unit: Unit; isClassTeacher: boolean; subjectIds: Types.ObjectId[] }>();
  for (const u of heads) units.set(keyOf(u), { unit: u, isClassTeacher: true, subjectIds: [] });
  for (const t of teaching) {
    const entry = units.get(keyOf(t)) ?? { unit: { classId: t.classId, sectionId: t.sectionId }, isClassTeacher: false, subjectIds: [] };
    entry.subjectIds.push(t.subjectId);
    units.set(keyOf(t), entry);
  }
  if (units.size === 0) return [];
  const school = new Types.ObjectId(tenantId);
  const yearId = (await AcademicYearService.activeYearId(tenantId)) ?? new Types.ObjectId();
  const [described, subjects] = await Promise.all([
    // In the school's class order (a class or section that is gone is left out).
    describeUnits(tenantId, [...units.values()].map((e) => ({ classId: e.unit.classId, sectionId: e.unit.sectionId, academicYearId: yearId, entry: e }))),
    Subject.find({ tenantId: school, _id: { $in: [...units.values()].flatMap((e) => e.subjectIds) } }).select("name").lean(),
  ]);
  const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
  return described.map((d) => ({
    classId: d.ref.classId,
    sectionId: d.ref.sectionId,
    label: d.ref.label,
    isClassTeacher: d.entry.isClassTeacher,
    subjects: d.entry.subjectIds.map((id) => ({ id: id.toString(), name: subjectName.get(id.toString()) ?? "A subject" })).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
