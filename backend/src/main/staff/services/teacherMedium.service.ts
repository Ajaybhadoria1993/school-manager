import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { reportError } from "../../../utils/logger";
import { isDuplicateKey } from "../../academics/services/shared";
import { sidesOfSchool, type SchoolSide } from "../../tenants/services/schoolSides";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";
import { MAX_TEACHERS } from "../constants";
import { Teacher } from "../models/Teacher";
import { TeacherLogin } from "./teacherLogin.service";

/** A medium of the school, as a teacher's page lists it. */
export interface TeacherMediumDto {
  id: string;
  label: string;
  /** The medium whose page this is. */
  here: boolean;
  teaches: boolean;
}

const NO_MEDIUM = () => ApiError.notFound("That medium is not part of your school.", "MEDIUM_NOT_FOUND");
const NOT_FOUND = () => ApiError.notFound("Teacher not found", "TEACHER_NOT_FOUND");

/**
 * A teacher who teaches in more than one medium of the school is one person with one login. Each medium is run on its own, so they have a
 * record on each side (their classes, timetable and attendance are that side's), and every record points to the same login (`userId`). The
 * login belongs to one side (`User.tenantId`), and they move to the others from the top bar (middleware/auth.ts, MediumService.forTeacher).
 */
export class TeacherMediumService {
  /** Every medium of the school and whether this teacher teaches in it. Empty for a school with one medium. */
  static async list(tenantId: string, teacherId: string): Promise<{ items: TeacherMediumDto[] }> {
    const teacher = await Teacher.findOne({ _id: teacherId, tenantId }).select("userId").lean();
    if (!teacher) throw NOT_FOUND();
    const sides = await sidesOfSchool(tenantId);
    const items = await Promise.all(
      sides.map(async (side) => {
        const here = side.id.toString() === tenantId;
        const teaches = here || (!!teacher.userId && !!(await Teacher.exists({ tenantId: side.id, userId: teacher.userId, isActive: true })));
        return { id: side.id.toString(), label: side.label, here, teaches };
      })
    );
    return { items };
  }

  /**
   * Adds the teacher to another medium, with the login they already have. Their name and job details come along; what belongs to a side
   * (subjects, limits, days off, the school's own fields) starts empty there. A record on that side with the same mobile and no login of
   * its own is the same person: it is joined rather than made twice. Safe to repeat.
   */
  static async add(tenantId: string, teacherId: string, mediumId: string): Promise<{ items: TeacherMediumDto[] }> {
    const target = (await sidesOfSchool(tenantId)).find((side) => side.id.toString() === mediumId && mediumId !== tenantId);
    if (!target) throw NO_MEDIUM();
    const teacher = await Teacher.findOne({ _id: teacherId, tenantId }).lean();
    if (!teacher) throw NOT_FOUND();
    if (!teacher.userId) throw ApiError.conflict(`${teacher.name} has no login yet. Make a login first.`, "TEACHER_HAS_NO_LOGIN");
    if (!teacher.isActive) throw ApiError.conflict(`${teacher.name} has left. Bring them back first.`, "TEACHER_HAS_LEFT");

    const side = target.id;
    const already = await Teacher.findOne({ tenantId: side, userId: teacher.userId }).select("isActive").lean();
    if (already) {
      if (!already.isActive) await Teacher.updateOne({ _id: already._id, tenantId: side }, { $set: { isActive: true } });
      return TeacherMediumService.list(tenantId, teacherId);
    }

    const sameMobile = teacher.mobile ? await Teacher.findOne({ tenantId: side, mobile: teacher.mobile }).select("name userId").lean() : null;
    if (sameMobile) {
      if (sameMobile.userId) {
        const message = `${sameMobile.name} in ${target.label} has this mobile number and a login of their own`;
        throw ApiError.conflict(`${message}.`, "TEACHER_MOBILE_EXISTS", [{ path: "mobile", message }]);
      }
      await Teacher.updateOne({ _id: sameMobile._id, tenantId: side }, { $set: { userId: teacher.userId, isActive: true } });
      return TeacherMediumService.list(tenantId, teacherId);
    }

    if ((await Teacher.countDocuments({ tenantId: side })) >= MAX_TEACHERS) throw ApiError.conflict(`${target.label} has reached the limit of ${MAX_TEACHERS} teachers.`, "LIMIT_REACHED");
    const codeFree = teacher.employeeCode && !(await Teacher.exists({ tenantId: side, employeeCode: teacher.employeeCode }));
    try {
      await Teacher.create({
        tenantId: side,
        name: teacher.name,
        nameKey: teacher.nameKey,
        mobile: teacher.mobile,
        email: teacher.email,
        employeeCode: codeFree ? teacher.employeeCode : null,
        gender: teacher.gender,
        dateOfBirth: teacher.dateOfBirth,
        address: teacher.address,
        designation: teacher.designation,
        qualification: teacher.qualification,
        experienceYears: teacher.experienceYears,
        joiningDate: teacher.joiningDate,
        employmentType: teacher.employmentType,
        userId: teacher.userId,
      });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Two clicks at once: the other one made it.
    }
    return TeacherMediumService.list(tenantId, teacherId);
  }

  /**
   * After a teacher leaves or comes back on one side. Coming back opens the login. Leaving closes it only when they teach on no other side;
   * if they still do, the login stays open, and if it belonged to the side they left it moves to one where they still teach.
   */
  static async loginFollows(tenantId: string, userId: Types.ObjectId, isActive: boolean): Promise<void> {
    if (isActive) return TeacherLogin.setActive(userId, true);
    const remaining = await TeacherMediumService.otherSidesOf(tenantId, userId);
    if (remaining.length === 0) return TeacherLogin.setActive(userId, false);
    await User.updateOne({ _id: userId, tenantId: new Types.ObjectId(tenantId) }, { $set: { tenantId: remaining[0].id } });
  }

  /** The other sides where this login still teaches. */
  private static async otherSidesOf(tenantId: string, userId: Types.ObjectId): Promise<SchoolSide[]> {
    const others = (await sidesOfSchool(tenantId)).filter((side) => side.id.toString() !== tenantId);
    const found = await Promise.all(others.map(async (side) => ((await Teacher.exists({ tenantId: side.id, userId, isActive: true })) ? side : null)));
    return found.filter((side): side is SchoolSide => side !== null);
  }

  /** The name, mobile and email are the person's, and the login repeats them: changed on one side, they change on the others. */
  static async mirror(tenantId: string, userId: Types.ObjectId, details: { name?: string; mobile?: string | null; email?: string | null }): Promise<void> {
    const set: Record<string, unknown> = {};
    if (details.name !== undefined) Object.assign(set, { name: details.name, nameKey: nameKeyOf(details.name) });
    if (details.mobile !== undefined) set.mobile = details.mobile;
    if (details.email !== undefined) set.email = details.email;
    if (Object.keys(set).length === 0) return;
    const others = (await sidesOfSchool(tenantId)).filter((side) => side.id.toString() !== tenantId);
    for (const side of others) {
      // A number already used by someone else on that side: the rest still changes there, and that one record keeps its number.
      await Teacher.updateOne({ tenantId: side.id, userId }, { $set: set }).catch(async (err) => {
        if (!isDuplicateKey(err)) return reportError(err, { step: "keep a teacher's details the same on every medium", tenantId });
        const { mobile: _taken, ...rest } = set;
        await Teacher.updateOne({ tenantId: side.id, userId }, { $set: rest });
      });
    }
  }

  /**
   * One person, one login: a login is refused for a mobile number that already has one on another medium of the school, and the school is
   * told what to do instead. Nothing to check in a school with one medium.
   */
  static async assertNoLoginElsewhere(tenantId: string, mobile: string | null | undefined): Promise<void> {
    if (!mobile) return;
    const others = (await sidesOfSchool(tenantId)).filter((side) => side.id.toString() !== tenantId);
    for (const side of others) {
      const found = await Teacher.findOne({ tenantId: side.id, mobile, userId: { $type: "objectId" } }).select("name").lean();
      if (found) {
        const message = `${found.name} already has a login in ${side.label}. Open their page there and add this medium`;
        throw ApiError.conflict(`${message}.`, "TEACHER_LOGIN_IN_OTHER_MEDIUM", [{ path: "mobile", message }]);
      }
    }
  }
}
