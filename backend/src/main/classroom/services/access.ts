import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { indiaNow } from "../../../utils/clock";
import { AttendanceCover } from "../../timetable/models/AttendanceCover";
import { resolveUnit } from "../../timetable/services/unit";
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
/** Who calls a service: their login, and (read by requirePermission) which permissions work for them on the whole school. */
export interface Caller {
  userId: string;
  role: string;
  schoolPermissions?: readonly string[];
}

/**
 * Whether a caller works on every class of the school: the people who run it, and any staff the school gave the permission (a receptionist
 * who sees attendance). A teacher is held to their own classes, unless they are also on the staff and their role's list has one of `keys`
 * (a Coordinator who takes a class and may see every class's attendance: 2026-11-26). A parent never reaches these routes.
 */
export const worksOnAllClasses = (caller: Pick<Caller, "role" | "schoolPermissions">, ...keys: string[]) =>
  (caller.role !== "teacher" && caller.role !== "parent" && caller.role !== "student") || (caller.role === "teacher" && keys.some((k) => caller.schoolPermissions?.includes(k)));
export const sameUnit = (a: { classId: Types.ObjectId | string | null; sectionId: Types.ObjectId | string | null }, b: { classId: Types.ObjectId | string | null; sectionId: Types.ObjectId | string | null }) =>
  String(a.classId) === String(b.classId) && String(a.sectionId ?? "") === String(b.sectionId ?? "");

export const NOT_THEIR_SUBJECT = () => ApiError.forbidden("Only this subject's teacher, the class teacher or the school writes it.", "NOT_THEIR_SUBJECT");

const NO_ACCESS = () => ApiError.forbidden("This is not one of your classes.", "NOT_YOUR_CLASS");

/** The filter of one class or section of the school. */
export const unitFilter = (tenantId: string, unit: { classId: string; sectionId: string | null }) => ({
  tenantId: new Types.ObjectId(tenantId),
  classId: new Types.ObjectId(unit.classId),
  sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null,
});

/**
 * Who may do what in a class: the people who run the school everything; a teacher reads a class they are the class teacher of or teach a
 * subject in, and writes the subjects they teach there (the class teacher every subject). Used by the diary, the tests and the exam marks.
 * `schoolKeys`: the permissions that let a teacher who is also on the staff work on every class here (exams.manage for the exams).
 */
export async function accessTo(tenantId: string, caller: Caller, unit: Awaited<ReturnType<typeof resolveUnit>>, schoolKeys: readonly string[] = []) {
  const school = new Types.ObjectId(tenantId);
  const allotments = await Allotment.find({ ...unitFilter(tenantId, unit), academicYearId: unit.yearId }).select("subjectId teacherId").lean();
  if (worksOnAllClasses(caller, ...schoolKeys)) return { all: true, subjects: new Set(allotments.map((a) => a.subjectId.toString())), allotments, school };
  const teacher = caller.role === "teacher" ? await teacherOfUser(tenantId, caller.userId) : null;
  if (!teacher) throw NO_ACCESS();
  const isClassTeacher = (await classTeacherUnits(tenantId, teacher._id)).some((u) => sameUnit(u, unit));
  const own = allotments.filter((a) => a.teacherId?.equals(teacher._id)).map((a) => a.subjectId.toString());
  if (!isClassTeacher && own.length === 0) throw NO_ACCESS();
  return { all: isClassTeacher, subjects: new Set(isClassTeacher ? allotments.map((a) => a.subjectId.toString()) : own), allotments, school };
}

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

/** The classes whose attendance this teacher was given for today (its class teacher is away; 2026-11-24). */
export async function coveredToday(tenantId: string, teacherId: Types.ObjectId): Promise<Unit[]> {
  const rows = await AttendanceCover.find({ tenantId: new Types.ObjectId(tenantId), coverTeacherId: teacherId, date: indiaNow().date }).select("classId sectionId").lean();
  return rows.map((r) => ({ classId: r.classId, sectionId: r.sectionId ?? null }));
}

/**
 * A teacher's own classes (their home, docs/parent-teacher-flow.md): the ones they are the class teacher of and the ones they teach a
 * subject in, each with those subjects, in the school's class order. A class whose attendance they were given for today (its class teacher is
 * away) is there too, with `coversToday`.
 */
export async function myClasses(tenantId: string, teacherId: Types.ObjectId) {
  const [heads, teaching, covers] = await Promise.all([classTeacherUnits(tenantId, teacherId), teachingUnits(tenantId, teacherId), coveredToday(tenantId, teacherId)]);
  const keyOf = (u: Unit) => `${u.classId.toString()}:${u.sectionId?.toString() ?? ""}`;
  const units = new Map<string, { unit: Unit; isClassTeacher: boolean; coversToday: boolean; subjectIds: Types.ObjectId[] }>();
  for (const u of heads) units.set(keyOf(u), { unit: u, isClassTeacher: true, coversToday: false, subjectIds: [] });
  for (const t of teaching) {
    const entry = units.get(keyOf(t)) ?? { unit: { classId: t.classId, sectionId: t.sectionId }, isClassTeacher: false, coversToday: false, subjectIds: [] };
    entry.subjectIds.push(t.subjectId);
    units.set(keyOf(t), entry);
  }
  for (const c of covers) {
    const entry = units.get(keyOf(c)) ?? { unit: c, isClassTeacher: false, coversToday: false, subjectIds: [] };
    entry.coversToday = true;
    units.set(keyOf(c), entry);
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
    coversToday: d.entry.coversToday,
    subjects: d.entry.subjectIds.map((id) => ({ id: id.toString(), name: subjectName.get(id.toString()) ?? "A subject" })).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
