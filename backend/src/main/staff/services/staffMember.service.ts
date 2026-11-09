import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { isDuplicateKey } from "../../academics/services/shared";
import { TokenService } from "../../auth/services/token.service";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";
import { loginRoleOf, MAX_STAFF_MEMBERS, staffRoleLabel, type StaffMemberRole, type StaffMemberStatus } from "../constants";
import { StaffMember, type IStaffMember } from "../models/StaffMember";
import { Teacher } from "../models/Teacher";
import { ROLE_OTHER_MESSAGE, type CreateStaffMemberInput, type ListStaffMembersQuery, type LoginAccountInput, type UpdateStaffMemberInput } from "../schemas/staff.schemas";
import { StaffTeacher, type TeachingPerson } from "./staffTeacher.service";
import { TeacherLogin, type TeacherLoginDto } from "./teacherLogin.service";
import { TeacherService } from "./teacher.service";

export interface StaffMemberDto {
  id: string;
  name: string;
  role: StaffMemberRole;
  /** The role's name: for Other, the one the school wrote. */
  roleLabel: string;
  roleOther: string | null;
  /** Also teaches; `isTeacher`: they are a Teacher of the school now (the switch cannot be turned off from Staff then). */
  alsoTeacher: boolean;
  isTeacher: boolean;
  subjectIds: string[];
  email: string | null;
  mobile: string | null;
  gender: "Male" | "Female" | "Other" | null;
  dateOfBirth: string | null;
  address: { line1: string | null; city: string | null; state: string | null; pincode: string | null };
  designation: string | null;
  employeeCode: string | null;
  joiningDate: string | null;
  /** `invited` is only a person added before the school made logins itself, who has none yet (`login` is null). */
  status: StaffMemberStatus;
  /** The username they sign in with (never the password); null for a person with no login yet. */
  login: TeacherLoginDto | null;
}

const day = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : null);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOT_FOUND = () => ApiError.notFound("Staff member not found", "STAFF_NOT_FOUND");
const BAD_STATE = (message: string) => ApiError.conflict(message, "INVALID_STATE");
const EMAIL_IN_USE = () =>
  ApiError.conflict("This email already belongs to a login or to another staff member. Use another email, or leave it empty.", "EMAIL_IN_USE", [{ path: "email", message: "This email already belongs to a login or to another staff member" }]);
const CODE_IN_USE = () => ApiError.conflict("Another staff member already has this employee code.", "STAFF_CODE_EXISTS", [{ path: "employeeCode", message: "Another staff member already has this employee code" }]);
const HAS_LOGIN = (name: string) => ApiError.conflict(`${name} already has a login.`, "STAFF_HAS_LOGIN");
const NO_LOGIN = (name: string) => ApiError.conflict(`${name} has no login yet: make one first.`, "STAFF_HAS_NO_LOGIN");

/** A duplicate the pre-check could not see (two requests at once): the email or the employee code, said as the pre-check says it. */
function duplicateOf(err: unknown): ApiError {
  const pattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return "email" in pattern ? EMAIL_IN_USE() : CODE_IN_USE();
}

type Like = Pick<IStaffMember, "_id" | "name" | "role" | "roleOther" | "alsoTeacher" | "subjectIds" | "teacherId" | "email" | "mobile" | "gender" | "dateOfBirth" | "address" | "designation" | "employeeCode" | "joiningDate" | "status">;

export const toStaffMemberDto = (m: Like, login: TeacherLoginDto | null = null): StaffMemberDto => ({
  id: m._id.toString(),
  name: m.name,
  role: m.role,
  roleLabel: staffRoleLabel(m.role, m.roleOther),
  roleOther: m.roleOther ?? null,
  alsoTeacher: m.alsoTeacher ?? false,
  isTeacher: !!m.teacherId,
  subjectIds: (m.subjectIds ?? []).map(String),
  email: m.email ?? null,
  mobile: m.mobile ?? null,
  gender: m.gender ?? null,
  dateOfBirth: day(m.dateOfBirth),
  address: { line1: m.address?.line1 ?? null, city: m.address?.city ?? null, state: m.address?.state ?? null, pincode: m.address?.pincode ?? null },
  designation: m.designation ?? null,
  employeeCode: m.employeeCode ?? null,
  joiningDate: day(m.joiningDate),
  status: m.status,
  login,
});

/** The details a login and a Teacher record are made from. */
type Account = TeachingPerson & Pick<IStaffMember, "role" | "roleOther" | "alsoTeacher">;

/**
 * Staff (2026-11-08, the user): the school adds a person with the **username and password it makes itself** (as it does for a teacher or a
 * parent); there is no invitation email for staff (that stays for the school admin only). The login is made with the person: its role is
 * the one their kind gives (`loginRoleOf`); a person who also teaches is a Teacher of the school too.
 */
export class StaffMemberService {
  private static async loginsOf(members: { userId?: Types.ObjectId | null }[]): Promise<Map<string, TeacherLoginDto>> {
    return TeacherLogin.byIds(members.flatMap((m) => (m.userId ? [m.userId] : [])));
  }

  /** Everyone the school has added (the tab, role and search narrow it), and how many are in each status whatever the narrowing. */
  static async list(tenantId: string, query: ListStaffMembersQuery): Promise<{ items: StaffMemberDto[]; counts: Record<StaffMemberStatus, number> }> {
    const school = new Types.ObjectId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school };
    if (query.status !== "all") filter.status = query.status;
    if (query.role) filter.role = query.role;
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search.trim().toLowerCase().replace(/\s+/g, " ")), "i");
      const named = await User.find({ tenantId: school, username: pattern }).select("_id").lean();
      filter.$or = [{ nameKey: pattern }, { email: pattern }, { mobile: pattern }, { employeeCode: pattern }, ...(named.length > 0 ? [{ userId: { $in: named.map((u) => u._id) } }] : [])];
    }
    const [members, grouped] = await Promise.all([
      StaffMember.find(filter).lean(),
      StaffMember.aggregate<{ _id: StaffMemberStatus; n: number }>([{ $match: { tenantId: school } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    const counts = { active: 0, invited: 0, inactive: 0 };
    for (const g of grouped) counts[g._id] = g.n;
    const logins = await StaffMemberService.loginsOf(members);
    const items = members.map((m) => toStaffMemberDto(m, m.userId ? (logins.get(m.userId.toString()) ?? null) : null)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return { items, counts };
  }

  static async get(tenantId: string, id: string): Promise<StaffMemberDto> {
    const member = await StaffMember.findOne({ _id: id, tenantId }).lean();
    if (!member) throw NOT_FOUND();
    const logins = await StaffMemberService.loginsOf([member]);
    return toStaffMemberDto(member, member.userId ? (logins.get(member.userId.toString()) ?? null) : null);
  }

  static async exists(tenantId: string, id: string): Promise<boolean> {
    return !!(await StaffMember.exists({ _id: id, tenantId }));
  }

  /**
   * Makes the login (and, for a person who also teaches, their Teacher record) and returns their ids. Everything that can be checked has
   * been checked before; a failure here undoes what it made.
   */
  private static async makeAccount(tenantId: string, person: Account, login: LoginAccountInput): Promise<{ userId: Types.ObjectId; teacherId: Types.ObjectId | null }> {
    const loginRole = loginRoleOf(person.role, person.alsoTeacher);
    let userId: Types.ObjectId | null = null;
    let teacherId: Types.ObjectId | null = null;
    try {
      userId = await TeacherLogin.create(tenantId, { name: person.name, mobile: person.mobile ?? null, email: person.email ?? null, isActive: true }, login, { role: loginRole, roleLabel: staffRoleLabel(person.role, person.roleOther) });
      if (person.alsoTeacher) teacherId = await StaffTeacher.make(tenantId, person, loginRole === "teacher" ? userId : null);
      return { userId, teacherId };
    } catch (err) {
      if (teacherId) await Teacher.deleteOne({ _id: teacherId, tenantId });
      if (userId) await TeacherLogin.remove(userId);
      throw err;
    }
  }

  /** The Teacher record and the login of a person whose staff record could not be saved are taken away again. */
  private static async undo(tenantId: string, made: { userId: Types.ObjectId; teacherId: Types.ObjectId | null }): Promise<void> {
    if (made.teacherId) await Teacher.deleteOne({ _id: made.teacherId, tenantId });
    await TeacherLogin.remove(made.userId);
  }

  /**
   * Adds a person with their login: the username and password the school made. Everything that could refuse them is checked first (room, the
   * email, the employee code, the username, and, for a person who also teaches, whether they can be a teacher), so a refusal leaves nothing behind.
   */
  static async create(tenantId: string, input: CreateStaffMemberInput, addedBy: string | null): Promise<StaffMemberDto> {
    if ((await StaffMember.countDocuments({ tenantId })) >= MAX_STAFF_MEMBERS) {
      throw ApiError.conflict(`A school can have up to ${MAX_STAFF_MEMBERS} staff members.`, "LIMIT_REACHED");
    }
    const email = input.email ?? null;
    if (email && (await StaffMember.exists({ tenantId, email }))) throw EMAIL_IN_USE();
    if (input.employeeCode && (await StaffMember.exists({ tenantId, employeeCode: input.employeeCode }))) throw CODE_IN_USE();
    await TeacherLogin.assertFree(input.login.username, email);
    const alsoTeacher = input.alsoTeacher === true;
    const subjectIds = alsoTeacher ? (input.subjectIds ?? []) : [];
    if (alsoTeacher) await StaffTeacher.assertCan(tenantId, { mobile: input.mobile ?? null, employeeCode: input.employeeCode ?? null, subjectIds }, null);

    const details = {
      name: input.name,
      email,
      mobile: input.mobile ?? null,
      role: input.role,
      roleOther: input.role === "other" ? (input.roleOther ?? null) : null,
      alsoTeacher,
      subjectIds: subjectIds.map((id) => new Types.ObjectId(id)),
      gender: input.gender ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      address: { line1: input.address?.line1 ?? null, city: input.address?.city ?? null, state: input.address?.state ?? null, pincode: input.address?.pincode ?? null },
      designation: input.designation ?? null,
      employeeCode: input.employeeCode ?? null,
      joiningDate: input.joiningDate ?? null,
    };
    const made = await StaffMemberService.makeAccount(tenantId, details, input.login);
    let member;
    try {
      member = await StaffMember.create({ tenantId, ...details, nameKey: nameKeyOf(input.name), status: "active", userId: made.userId, teacherId: made.teacherId, invitedBy: addedBy ? new Types.ObjectId(addedBy) : null });
    } catch (err) {
      await StaffMemberService.undo(tenantId, made);
      if (isDuplicateKey(err)) throw duplicateOf(err);
      throw err;
    }
    return toStaffMemberDto(member, { username: input.login.username, isActive: true });
  }

  /** A login for a person who has none (added before the school made logins itself): the same checks, then they are active. */
  static async makeLogin(tenantId: string, id: string, login: LoginAccountInput): Promise<StaffMemberDto> {
    const member = await StaffMember.findOne({ _id: id, tenantId }).lean();
    if (!member) throw NOT_FOUND();
    if (member.userId) throw HAS_LOGIN(member.name);
    await TeacherLogin.assertFree(login.username, member.email ?? null);
    if (member.alsoTeacher) await StaffTeacher.assertCan(tenantId, { mobile: member.mobile ?? null, employeeCode: member.employeeCode ?? null, subjectIds: member.subjectIds.map(String) }, null);
    const made = await StaffMemberService.makeAccount(tenantId, { ...member, subjectIds: member.subjectIds }, login);
    const linked = await StaffMember.updateOne({ _id: id, tenantId, userId: null }, { $set: { status: "active", userId: made.userId, teacherId: made.teacherId } });
    if (linked.modifiedCount !== 1) {
      await StaffMemberService.undo(tenantId, made);
      throw HAS_LOGIN(member.name);
    }
    return StaffMemberService.get(tenantId, id);
  }

  /** A new password the school made. Every session they have ends. */
  static async resetPassword(tenantId: string, id: string, password: string): Promise<void> {
    const member = await StaffMember.findOne({ _id: id, tenantId }).select("name userId").lean();
    if (!member) throw NOT_FOUND();
    if (!member.userId) throw NO_LOGIN(member.name);
    await TeacherLogin.setPassword(member.userId, password);
  }

  /** Another username for their login (the password and the sessions stay). */
  static async changeUsername(tenantId: string, id: string, username: string): Promise<StaffMemberDto> {
    const member = await StaffMember.findOne({ _id: id, tenantId }).select("name userId").lean();
    if (!member) throw NOT_FOUND();
    if (!member.userId) throw NO_LOGIN(member.name);
    await TeacherLogin.setUsername(member.userId, username);
    return StaffMemberService.get(tenantId, id);
  }

  /** Takes a person with no login away (there is no login to close). Someone with a login is made inactive instead. */
  static async remove(tenantId: string, id: string): Promise<void> {
    const member = await StaffMember.findOne({ _id: id, tenantId }).lean();
    if (!member) throw NOT_FOUND();
    if (member.userId) throw BAD_STATE(`${member.name} has a login: make them inactive instead.`);
    await StaffMember.deleteOne({ _id: member._id, tenantId });
  }

  /**
   * Some details (the email too: it is only a contact and a second way in), the role, who also teaches, and on / off for a person with a login.
   * A role changes the login's role (and ends its sessions, so the new role applies at the next sign-in); off closes the login at once, on
   * opens it. Everything that could refuse the change is checked before anything is changed.
   */
  static async update(tenantId: string, id: string, input: UpdateStaffMemberInput): Promise<StaffMemberDto> {
    const current = await StaffMember.findOne({ _id: id, tenantId }).lean();
    if (!current) throw NOT_FOUND();
    if (input.isActive !== undefined && !current.userId) throw NO_LOGIN(current.name);
    if (input.email && input.email !== current.email && (await StaffMember.exists({ tenantId, email: input.email, _id: { $ne: current._id } }))) throw EMAIL_IN_USE();
    // The login repeats the email: it must be free before the staff member is changed.
    if (current.userId && input.email) await TeacherLogin.assertFree(null, input.email, current.userId);
    if (input.employeeCode && input.employeeCode !== current.employeeCode && (await StaffMember.exists({ tenantId, employeeCode: input.employeeCode, _id: { $ne: current._id } }))) throw CODE_IN_USE();

    // The role (Other needs its name), and who also teaches. Whoever teaches now is a teacher for good here: they are made inactive as one.
    const role = input.role ?? current.role;
    const roleOther = role === "other" ? (input.roleOther !== undefined ? input.roleOther : current.roleOther) : null;
    if (role === "other" && !roleOther) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "roleOther", message: ROLE_OTHER_MESSAGE }]);
    }
    if (input.alsoTeacher === false && current.teacherId) {
      throw ApiError.conflict(`${current.name} teaches here now. To stop, make them inactive as a teacher on the Teacher page.`, "STILL_A_TEACHER", [{ path: "alsoTeacher", message: "They teach here now: make them inactive on the Teacher page" }]);
    }
    const alsoTeacher = input.alsoTeacher ?? current.alsoTeacher;
    const subjectIds = alsoTeacher ? (input.subjectIds ?? current.subjectIds.map(String)) : [];
    const mobile = input.mobile !== undefined ? input.mobile : (current.mobile ?? null);
    const employeeCode = input.employeeCode !== undefined ? input.employeeCode : (current.employeeCode ?? null);
    // Everything that could refuse them as a teacher is checked before anything is changed.
    const teacherId = current.teacherId ? String(current.teacherId) : null;
    if (alsoTeacher && (!current.alsoTeacher || input.mobile !== undefined || input.employeeCode !== undefined || input.subjectIds !== undefined)) {
      await StaffTeacher.assertCan(tenantId, { mobile, employeeCode, subjectIds }, teacherId);
    }
    // Their teacher record is on and off with them: first, because it may refuse (classes still given to them) and then nothing changes.
    if (input.isActive !== undefined && teacherId) await TeacherService.update(tenantId, teacherId, { isActive: input.isActive });

    const set: Record<string, unknown> = { roleOther, alsoTeacher, subjectIds: subjectIds.map((sid) => new Types.ObjectId(sid)) };
    if (input.name !== undefined) Object.assign(set, { name: input.name, nameKey: nameKeyOf(input.name) });
    for (const key of ["email", "mobile", "role", "gender", "dateOfBirth", "designation", "employeeCode", "joiningDate"] as const) {
      if (input[key] !== undefined) set[key] = input[key];
    }
    for (const [part, value] of Object.entries(input.address ?? {})) if (value !== undefined) set[`address.${part}`] = value;
    if (input.isActive !== undefined) set.status = input.isActive ? "active" : "inactive";
    let updated;
    try {
      updated = await StaffMember.findOneAndUpdate({ _id: id, tenantId }, { $set: set }, { new: true });
    } catch (err) {
      if (isDuplicateKey(err)) throw duplicateOf(err);
      throw err;
    }
    if (!updated) throw NOT_FOUND();

    if (current.userId) {
      // The login's role is the one the role and the teaching give (a teacher's, a staff member's...); the title shown is the role's name.
      const loginRole = loginRoleOf(role, alsoTeacher);
      const user = await User.findById(current.userId).select("role").lean();
      const userSet: Record<string, unknown> = { roleLabel: staffRoleLabel(role, roleOther) };
      if (input.name !== undefined) userSet.name = input.name;
      if (input.mobile !== undefined && input.mobile) userSet.phone = input.mobile;
      if (user && user.role !== loginRole) userSet.role = loginRole;
      await User.updateOne({ _id: current.userId }, { $set: userSet });
      // The email is the login's too (an empty one takes it away: the username still opens it).
      if (input.email !== undefined) await TeacherLogin.sync(current.userId, { email: input.email });
      // The new role is the login's from the next sign-in: the sessions of the old one end now.
      if (userSet.role) await TokenService.revokeAllForUser(current.userId);
      if (input.isActive !== undefined) await TeacherLogin.setActive(current.userId, input.isActive);

      // The person as a teacher: made when it is switched on for someone with a login; kept in step (details, subjects, the login's link) after.
      if (alsoTeacher) {
        const person: TeachingPerson = { ...updated.toObject(), subjectIds: updated.subjectIds };
        const linked = loginRole === "teacher" ? current.userId : null;
        if (current.teacherId) await StaffTeacher.sync(tenantId, current.teacherId, person, linked);
        else await StaffMember.updateOne({ _id: id, tenantId }, { $set: { teacherId: await StaffTeacher.make(tenantId, person, linked, updated.status !== "inactive") } });
      }
    }
    return StaffMemberService.get(tenantId, id);
  }
}
