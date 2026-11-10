import { Types } from "mongoose";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { childrenOf } from "../../classroom/services/children";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Allotment } from "../../subjects/models/Allotment";
import { Enrolment } from "../../students/models/Enrolment";
import { Teacher } from "../../staff/models/Teacher";
import { Guardian } from "../../students/models/Guardian";
import { Student } from "../../students/models/Student";
import { fullName } from "../../students/services/shared";
import { User } from "../../users/models/User";

/** A class without sections, or one section of a class. */
export interface UnitRef {
  classId: string;
  sectionId: string | null;
}

/**
 * Who is told (docs/notifications.md). Each answer is a list of user ids; NotificationService.send keeps only the open logins of the
 * school, so a parent whose children have all left, or a teacher who left, is not told.
 */
export class Audience {
  /** The logins of each child's parents (the children who are active), by child id. */
  static async parentsOf(tenantId: string, studentIds: string[]): Promise<Map<string, string[]>> {
    const school = new Types.ObjectId(tenantId);
    const ids = studentIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return new Map();
    const students = await Student.find({ tenantId: school, _id: { $in: ids }, status: "active" }).select("guardians.guardianId").lean();
    const guardians = await Guardian.find({ tenantId: school, _id: { $in: students.flatMap((s) => s.guardians.map((g) => g.guardianId)) }, userId: { $type: "objectId" } })
      .select("userId")
      .lean();
    const loginOf = new Map(guardians.map((g) => [g._id.toString(), g.userId!.toString()]));
    return new Map(students.map((s) => [s._id.toString(), s.guardians.flatMap((g) => loginOf.get(g.guardianId.toString()) ?? [])]));
  }

  /** The active children of a class or section this year, each with their parents' logins. */
  static async parentsOfUnit(tenantId: string, unit: UnitRef & { yearId: Types.ObjectId }): Promise<{ id: string; name: string; parents: string[] }[]> {
    const children = await childrenOf(tenantId, unit);
    const parents = await Audience.parentsOf(tenantId, children.map((c) => c.id));
    return children.map((c) => ({ id: c.id, name: c.name, parents: parents.get(c.id) ?? [] }));
  }

  /** The active children of these classes (every section) in this year, each with the class they are in and their parents' logins. */
  static async childrenOfClasses(tenantId: string, yearId: Types.ObjectId, classIds: string[]): Promise<{ id: string; name: string; classId: string; parents: string[] }[]> {
    const school = new Types.ObjectId(tenantId);
    const enrolments = await Enrolment.find({ tenantId: school, academicYearId: yearId, classId: { $in: classIds.map((c) => new Types.ObjectId(c)) }, status: "active" }).select("studentId classId").lean();
    if (enrolments.length === 0) return [];
    const [students, parents] = await Promise.all([
      Student.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.studentId) }, status: "active" }).select("firstName lastName").lean(),
      Audience.parentsOf(tenantId, enrolments.map((e) => e.studentId.toString())),
    ]);
    const classOf = new Map(enrolments.map((e) => [e.studentId.toString(), e.classId.toString()]));
    return students.map((s) => ({ id: s._id.toString(), name: fullName(s), classId: classOf.get(s._id.toString())!, parents: parents.get(s._id.toString()) ?? [] }));
  }

  /**
   * The teachers of these classes this year: the class teacher of any of their sections and whoever teaches any subject in them. Each
   * login with the classes (and sections) of theirs among these, so a message can name them and open the right class page.
   */
  static async teachersOfClasses(tenantId: string, yearId: Types.ObjectId, classIds: string[]): Promise<Map<string, UnitRef[]>> {
    const school = new Types.ObjectId(tenantId);
    const classes = classIds.map((c) => new Types.ObjectId(c));
    const [heads, taught] = await Promise.all([
      ClassTeacher.find({ tenantId: school, academicYearId: yearId, classId: { $in: classes } }).select("teacherId classId sectionId").lean(),
      Allotment.find({ tenantId: school, academicYearId: yearId, classId: { $in: classes }, teacherId: { $type: "objectId" } }).select("teacherId classId sectionId").lean(),
    ]);
    const rows = [...heads, ...taught].map((r) => ({ teacherId: r.teacherId as Types.ObjectId, unit: { classId: r.classId.toString(), sectionId: r.sectionId ? r.sectionId.toString() : null } }));
    const teachers = await Teacher.find({ tenantId: school, _id: { $in: [...new Set(rows.map((r) => r.teacherId.toString()))].map((id) => new Types.ObjectId(id)) }, isActive: true, userId: { $type: "objectId" } })
      .select("userId")
      .lean();
    const loginOf = new Map(teachers.map((t) => [t._id.toString(), t.userId!.toString()]));
    const result = new Map<string, UnitRef[]>();
    for (const r of rows) {
      const login = loginOf.get(r.teacherId.toString());
      if (!login) continue;
      const units = result.get(login) ?? [];
      if (!units.some((u) => u.classId === r.unit.classId && u.sectionId === r.unit.sectionId)) units.push(r.unit);
      result.set(login, units);
    }
    return result;
  }

  /** The login of the class teacher of this class or section this year (none, or one who left: nobody). */
  static async classTeachersOf(tenantId: string, unit: UnitRef): Promise<string[]> {
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) return [];
    const school = new Types.ObjectId(tenantId);
    const rows = await ClassTeacher.find({
      tenantId: school,
      academicYearId: yearId,
      classId: new Types.ObjectId(unit.classId),
      sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null,
    })
      .select("teacherId")
      .lean();
    return Audience.teacherLogins(tenantId, rows.map((r) => r.teacherId));
  }

  /** The logins of these teachers (the ones still teaching here and given a login). */
  static async teacherLogins(tenantId: string, teacherIds: (Types.ObjectId | string | null | undefined)[]): Promise<string[]> {
    const ids = teacherIds.filter((id): id is Types.ObjectId | string => !!id && Types.ObjectId.isValid(String(id))).map((id) => new Types.ObjectId(String(id)));
    if (ids.length === 0) return [];
    const teachers = await Teacher.find({ tenantId: new Types.ObjectId(tenantId), _id: { $in: ids }, isActive: true, userId: { $type: "objectId" } }).select("userId").lean();
    return teachers.map((t) => t.userId!.toString());
  }

  /** Every open login of the school (the calendar is everyone's). */
  static async everyone(tenantId: string): Promise<string[]> {
    const school = new Types.ObjectId(tenantId);
    // And the teachers who work here with a login that belongs to another medium of the school.
    const [users, teachers] = await Promise.all([
      User.find({ tenantId: school, isActive: true }).select("_id").lean(),
      Teacher.find({ tenantId: school, isActive: true, userId: { $type: "objectId" } }).select("userId").lean(),
    ]);
    return [...new Set([...users.map((u) => u._id.toString()), ...teachers.map((t) => t.userId!.toString())])];
  }
}
