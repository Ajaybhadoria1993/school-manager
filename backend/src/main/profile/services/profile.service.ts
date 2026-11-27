import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { StaffMember, type IStaffMember } from "../../staff/models/StaffMember";
import { Teacher, type ITeacher } from "../../staff/models/Teacher";
import { staffRoleLabel } from "../../staff/constants";
import { StaffMemberService } from "../../staff/services/staffMember.service";
import { TeacherService } from "../../staff/services/teacher.service";
import { OTHER_CHOICE } from "../../tenants/constants";
import { User } from "../../users/models/User";
import type { OwnProfileInput } from "../schemas/profile.schemas";
import { PersonPhotoService, type PhotoOwner } from "./personPhoto.service";

export interface OwnProfile {
  /** `member`: a teacher or a staff member (the school keeps a record of them); `account`: a login only (the school's administrator). */
  kind: "account" | "member";
  teaches: boolean;
  name: string;
  email: string | null;
  username: string | null;
  /** A staff member's role as the school calls it; null for others (the app knows the login's role). */
  roleLabel: string | null;
  mobile: string | null;
  designation: string | null;
  designationOther: string | null;
  alternateMobile: string | null;
  gender: "Male" | "Female" | "Other" | null;
  dateOfBirth: string | null;
  address: { line1: string | null; city: string | null; state: string | null; pincode: string | null };
  qualification: string | null;
  experienceYears: number | null;
  /** What the school decides: shown, not changed here. Null for a login only. */
  job: { employeeCode: string | null; designation: string | null; joiningDate: string | null } | null;
}

const NOT_FOUND = () => ApiError.notFound("Your account was not found", "NOT_FOUND");
const wrong = (path: string, message: string) => ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path, message }]);
const day = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : null);
const addressOf = (a?: ITeacher["address"] | IStaffMember["address"]) => ({ line1: a?.line1 ?? null, city: a?.city ?? null, state: a?.state ?? null, pincode: a?.pincode ?? null });

/** The signed-in person: their login, and the teacher and staff records the school keeps of them (on the side their login belongs to). */
async function personOf(tenantId: string, userId: string) {
  const school = new Types.ObjectId(tenantId);
  const login = new Types.ObjectId(userId);
  const [user, member, own] = await Promise.all([
    User.findById(login).lean(),
    StaffMember.findOne({ tenantId: school, userId: login }).lean(),
    Teacher.findOne({ tenantId: school, userId: login }).lean(),
  ]);
  if (!user) throw NOT_FOUND();
  // A staff member who also teaches may sign in with their staff role: their teacher record is the one their staff record names.
  const teacher = own ?? (member?.teacherId ? await Teacher.findOne({ _id: member.teacherId, tenantId: school }).lean() : null);
  return { user, member, teacher };
}

/**
 * Settings > Personal details and the person's own photo (docs/profiles.md). A change goes through the same services the school's own pages
 * use, so a mobile number stays one person's, the login keeps the same name, and a teacher's other mediums follow.
 */
export class ProfileService {
  static async get(tenantId: string, userId: string): Promise<OwnProfile> {
    const { user, member, teacher } = await personOf(tenantId, userId);
    const record = member ?? teacher;
    return {
      kind: record ? "member" : "account",
      teaches: !!teacher,
      name: record?.name ?? user.name,
      email: user.email ?? null,
      username: user.username ?? null,
      roleLabel: member ? staffRoleLabel(member.role, member.roleOther) : (user.roleLabel ?? null),
      mobile: record ? (record.mobile ?? null) : (user.phone ?? null),
      designation: record ? null : (user.designation ?? null),
      designationOther: record ? null : user.designationOther || null,
      alternateMobile: record ? null : user.alternatePhone || null,
      gender: record?.gender ?? null,
      dateOfBirth: day(record?.dateOfBirth),
      address: addressOf(record?.address),
      qualification: teacher?.qualification ?? null,
      experienceYears: teacher?.experienceYears ?? null,
      job: record ? { employeeCode: record.employeeCode ?? null, designation: record.designation ?? null, joiningDate: day(record.joiningDate) } : null,
    };
  }

  static async update(tenantId: string, userId: string, input: OwnProfileInput): Promise<OwnProfile> {
    const { user, member, teacher } = await personOf(tenantId, userId);
    if (!member && !teacher) {
      await ProfileService.updateAccount(user, input);
      return ProfileService.get(tenantId, userId);
    }
    const record = member ?? teacher!;
    if (input.mobile === null && record.mobile) throw wrong("mobile", "Enter your mobile number");

    // Only the personal boxes are passed on, whatever else a request holds.
    const personal = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    };
    const study = {
      ...(input.qualification !== undefined ? { qualification: input.qualification } : {}),
      ...(input.experienceYears !== undefined ? { experienceYears: input.experienceYears } : {}),
    };
    if (member) {
      // The staff record carries the teacher record and the login with it.
      if (Object.keys(personal).length > 0) await StaffMemberService.update(tenantId, member._id.toString(), personal);
      if (teacher && Object.keys(study).length > 0) await TeacherService.update(tenantId, teacher._id.toString(), study);
    } else {
      const both = { ...personal, ...study };
      if (Object.keys(both).length > 0) await TeacherService.update(tenantId, teacher!._id.toString(), both);
    }
    return ProfileService.get(tenantId, userId);
  }

  /** The school's administrator (or anyone with a login only): kept on the login. */
  private static async updateAccount(user: { _id: Types.ObjectId; designationOther?: string }, input: OwnProfileInput): Promise<void> {
    if (input.mobile === null) throw wrong("mobile", "Enter a 10-digit mobile number");
    if (input.designation === OTHER_CHOICE && !input.designationOther && !user.designationOther) throw wrong("designationOther", "Tell us your role");
    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.mobile !== undefined) set.phone = input.mobile;
    if (input.alternateMobile !== undefined) set.alternatePhone = input.alternateMobile ?? "";
    if (input.designation !== undefined) {
      set.designation = input.designation;
      set.designationOther = input.designation === OTHER_CHOICE ? (input.designationOther ?? user.designationOther ?? "") : "";
    }
    if (Object.keys(set).length > 0) await User.updateOne({ _id: user._id }, { $set: set });
  }

  /** Where the signed-in person's own photo is kept: their records when they have any, else their login. */
  static async photoOwners(tenantId: string, userId: string): Promise<PhotoOwner[]> {
    const records = await PersonPhotoService.ownersOfLogin(tenantId, userId);
    return records.length > 0 ? records : [{ tenantId: new Types.ObjectId(tenantId), ownerType: "user", ownerId: new Types.ObjectId(userId) }];
  }
}
