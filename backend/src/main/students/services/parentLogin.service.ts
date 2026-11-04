import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { TeacherLogin } from "../../staff/services/teacherLogin.service";
import type { LoginAccountInput } from "../../staff/schemas/staff.schemas";
import { Guardian, type IGuardian } from "../models/Guardian";
import { Student } from "../models/Student";
import { GUARDIAN_NOT_FOUND } from "./shared";

/** What the school's screens get back: whose login, and its username (never the password). */
export interface GuardianLoginDto {
  guardianId: string;
  login: { username: string; isActive: boolean };
}

const HAS_LOGIN = (g: Pick<IGuardian, "name">) => ApiError.conflict(`${g.name} already has a login.`, "GUARDIAN_HAS_LOGIN");
const NO_LOGIN = (g: Pick<IGuardian, "name">) => ApiError.conflict(`${g.name} has no login yet. Make one first.`, "GUARDIAN_HAS_NO_LOGIN");

async function guardianOf(tenantId: string, guardianId: string) {
  const guardian = await Guardian.findOne({ _id: guardianId, tenantId: new Types.ObjectId(tenantId) }).lean();
  if (!guardian) throw GUARDIAN_NOT_FOUND();
  return guardian;
}

/** At least one child of this guardian is an active student of the school. */
async function hasActiveChild(g: Pick<IGuardian, "_id" | "tenantId">): Promise<boolean> {
  return !!(await Student.exists({ tenantId: g.tenantId, status: "active", "guardians.guardianId": g._id }));
}

async function answer(guardianId: string, userId: Types.ObjectId): Promise<GuardianLoginDto> {
  const login = (await TeacherLogin.byIds([userId])).get(userId.toString());
  return { guardianId, login: login ?? { username: "", isActive: false } };
}

/**
 * A parent's login (2026-11-04): the school gives a guardian a username and a password (as it does a teacher), and the parent signs in
 * with them on the website now and in the mobile app later, to see their children. It is the GUARDIAN's: one login for all their
 * children here, and a brother's or sister's admission that links the same guardian joins it by itself. A User with the role "parent"
 * (no email: the username opens it), named and numbered like the guardian (GuardianService.update keeps it so). The username is checked
 * free on the whole platform; only a hash of the password is kept.
 */
export class ParentLoginService {
  static async create(tenantId: string, guardianId: string, input: LoginAccountInput): Promise<GuardianLoginDto> {
    const guardian = await guardianOf(tenantId, guardianId);
    if (guardian.userId) throw HAS_LOGIN(guardian);
    await TeacherLogin.assertFree(input.username, null, null, "username");
    // Open only while a child of theirs is here (see followChildren).
    const isActive = await hasActiveChild(guardian);
    const userId = await TeacherLogin.create(tenantId, { name: guardian.name, mobile: guardian.mobile, email: null, isActive }, input, { role: "parent", path: "username" });
    // Only if nobody gave this guardian a login a moment ago; otherwise this one goes again.
    const linked = await Guardian.updateOne({ _id: guardian._id, tenantId: guardian.tenantId, userId: null }, { $set: { userId } });
    if (linked.modifiedCount === 0) {
      await TeacherLogin.remove(userId);
      throw HAS_LOGIN(guardian);
    }
    return answer(guardianId, userId);
  }

  /** Another username (someone else's is refused with free ones); the password and the parent's sessions stay. */
  static async changeUsername(tenantId: string, guardianId: string, username: string): Promise<GuardianLoginDto> {
    const guardian = await guardianOf(tenantId, guardianId);
    if (!guardian.userId) throw NO_LOGIN(guardian);
    await TeacherLogin.setUsername(guardian.userId, username);
    return answer(guardianId, guardian.userId);
  }

  /**
   * A parent's login is open while at least one child of theirs is an active student here (2026-11-04, the user: a child who leaves, the
   * parent cannot sign in): called after students are made inactive (left, transferred) or active again. A parent whose last child left
   * is switched off (their sessions end at once); one whose child came back is switched on. Other families are not touched.
   */
  static async followChildren(tenantId: Types.ObjectId, students: { guardians: { guardianId: Types.ObjectId }[] }[]): Promise<void> {
    const ids = [...new Set(students.flatMap((s) => s.guardians.map((g) => g.guardianId.toString())))].map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return;
    const withLogin = await Guardian.find({ tenantId, _id: { $in: ids }, userId: { $ne: null } }).lean();
    await Promise.all(withLogin.map(async (g) => TeacherLogin.setActive(g.userId, await hasActiveChild(g))));
  }

  /** A new password, typed or made by the school and given to the parent; the old one, and every session it opened, stop at once. */
  static async resetPassword(tenantId: string, guardianId: string, password: string): Promise<GuardianLoginDto> {
    const guardian = await guardianOf(tenantId, guardianId);
    if (!guardian.userId) throw NO_LOGIN(guardian);
    await TeacherLogin.setPassword(guardian.userId, password);
    return answer(guardianId, guardian.userId);
  }
}
