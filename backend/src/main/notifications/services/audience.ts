import { Types } from "mongoose";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { childrenOf } from "../../classroom/services/children";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Teacher } from "../../staff/models/Teacher";
import { Guardian } from "../../students/models/Guardian";
import { Student } from "../../students/models/Student";
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
    const users = await User.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).select("_id").lean();
    return users.map((u) => u._id.toString());
  }
}
