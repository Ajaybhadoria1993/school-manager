import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { isDuplicateKey } from "../../academics/services/shared";
import { Allotment } from "../../subjects/models/Allotment";
import { Subject } from "../../subjects/models/Subject";
import { openYearIds } from "../../subjects/services/subject.service";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { Timetable } from "../../timetable/models/Timetable";
import { MAX_TEACHERS, type EmploymentType } from "../constants";
import { StaffMember } from "../models/StaffMember";
import { Teacher, type ITeacher } from "../models/Teacher";
import { User } from "../../users/models/User";
import { NEEDS_MOBILE_MESSAGE, type CreateTeacherInput, type ListTeachersQuery, type LoginAccountInput, type UpdateTeacherInput } from "../schemas/staff.schemas";
import { ClassTeacherService, describeUnits, type UnitRefDto } from "./classTeacher.service";
import { TeacherLogin, type TeacherLoginDto } from "./teacherLogin.service";
import { TeacherSettingsService } from "./teacherSettings.service";

/** What a teacher has been given in the running (and the next) year: in how many sections, and how many periods a week. */
export interface TeacherLoad {
  sections: number;
  periodsAllotted: number;
}

export interface TeacherDto {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  employeeCode: string | null;
  subjectIds: string[];
  maxPeriodsPerDay: number | null;
  maxPeriodsPerWeek: number | null;
  offDays: number[];
  isActive: boolean;
  load: TeacherLoad;
  gender: "Male" | "Female" | "Other" | null;
  /** "1988-07-14". */
  dateOfBirth: string | null;
  address: { line1: string | null; city: string | null; state: string | null; pincode: string | null };
  designation: string | null;
  qualification: string | null;
  experienceYears: number | null;
  joiningDate: string | null;
  employmentType: EmploymentType | null;
  /** The answers to the school's own fields, by their `c_` key (the screen shows the ones the school has now). */
  custom: Record<string, string | number | boolean>;
  /** null: the teacher has no login. */
  login: TeacherLoginDto | null;
  /** The units they are the class teacher of, this year and the next ("Class 5 - A"). */
  classTeacherOf: string[];
}

/** A subject of a class that a teacher teaches (their page). */
export interface TeachingDto extends UnitRefDto {
  subjectId: string;
  subjectName: string;
  periodsPerWeek: number;
}

/** What a teacher has been given, from their page: the classes they are the class teacher of and the subjects they teach. */
export interface TeacherClassesDto {
  classTeacherOf: UnitRefDto[];
  subjects: TeachingDto[];
}

/** The numbers on top of the Teacher page (see TeacherService.summary). */
export interface TeacherSummaryDto {
  teaching: number;
  classTeachers: number;
  withoutClasses: number;
  left: number;
}

/**
 * What the other teachers see of a colleague: who they are and what they take, not their birthday, address or login. (The accountant
 * and the platform team see no teachers at all.)
 */
export type ColleagueDto = Pick<
  TeacherDto,
  "id" | "name" | "mobile" | "email" | "employeeCode" | "subjectIds" | "maxPeriodsPerDay" | "maxPeriodsPerWeek" | "offDays" | "isActive" | "load" | "designation" | "classTeacherOf"
>;

type TeacherLike = Pick<
  ITeacher,
  "_id" | "name" | "mobile" | "email" | "employeeCode" | "subjectIds" | "maxPeriodsPerDay" | "maxPeriodsPerWeek" | "offDays" | "isActive"
> &
  Partial<Pick<ITeacher, "gender" | "dateOfBirth" | "address" | "designation" | "qualification" | "experienceYears" | "joiningDate" | "employmentType" | "custom">>;

const dayOf = (date: Date | null | undefined): string | null => (date ? date.toISOString().slice(0, 10) : null);

export const toTeacherDto = (t: TeacherLike, load: TeacherLoad = { sections: 0, periodsAllotted: 0 }, login: TeacherLoginDto | null = null, classTeacherOf: string[] = []): TeacherDto => ({
  id: t._id.toString(),
  name: t.name,
  mobile: t.mobile ?? null,
  email: t.email ?? null,
  employeeCode: t.employeeCode ?? null,
  subjectIds: (t.subjectIds ?? []).map((id) => id.toString()),
  maxPeriodsPerDay: t.maxPeriodsPerDay ?? null,
  maxPeriodsPerWeek: t.maxPeriodsPerWeek ?? null,
  offDays: [...(t.offDays ?? [])].sort((a, b) => a - b),
  isActive: t.isActive,
  load,
  gender: t.gender ?? null,
  dateOfBirth: dayOf(t.dateOfBirth),
  address: { line1: t.address?.line1 ?? null, city: t.address?.city ?? null, state: t.address?.state ?? null, pincode: t.address?.pincode ?? null },
  designation: t.designation ?? null,
  qualification: t.qualification ?? null,
  experienceYears: t.experienceYears ?? null,
  joiningDate: dayOf(t.joiningDate),
  employmentType: t.employmentType ?? null,
  custom: { ...(t.custom ?? {}) },
  login,
  classTeacherOf,
});

export const toColleagueDto = (dto: TeacherDto): ColleagueDto => ({
  id: dto.id,
  name: dto.name,
  mobile: dto.mobile,
  email: dto.email,
  employeeCode: dto.employeeCode,
  subjectIds: dto.subjectIds,
  maxPeriodsPerDay: dto.maxPeriodsPerDay,
  maxPeriodsPerWeek: dto.maxPeriodsPerWeek,
  offDays: dto.offDays,
  isActive: dto.isActive,
  load: dto.load,
  designation: dto.designation,
  classTeacherOf: dto.classTeacherOf,
});

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const NOT_FOUND = () => ApiError.notFound("Teacher not found", "TEACHER_NOT_FOUND");
const LIMIT = () => ApiError.conflict(`A school can have up to ${MAX_TEACHERS} teachers.`, "LIMIT_REACHED");

/** What each teacher has been given this year, by teacher id (a teacher with nothing is absent). */
export async function teacherLoads(tenantId: string): Promise<Map<string, TeacherLoad>> {
  const years = await openYearIds(tenantId);
  if (years.length === 0) return new Map();
  const rows = await Allotment.aggregate<{ _id: Types.ObjectId; sections: number; periods: number }>([
    { $match: { tenantId: new Types.ObjectId(tenantId), academicYearId: { $in: years }, teacherId: { $ne: null } } },
    { $group: { _id: "$teacherId", sections: { $sum: 1 }, periods: { $sum: "$periodsPerWeek" } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), { sections: r.sections, periodsAllotted: r.periods }]));
}

/** The boxes of a change as the Teacher model keeps them (an address part given is set, the others are left alone). */
function detailsOf(input: UpdateTeacherInput): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) Object.assign(set, { name: input.name, nameKey: nameKeyOf(input.name) });
  for (const key of ["mobile", "email", "employeeCode", "subjectIds", "maxPeriodsPerDay", "maxPeriodsPerWeek", "offDays", "gender", "dateOfBirth", "designation", "qualification", "experienceYears", "joiningDate", "employmentType"] as const) {
    if (input[key] !== undefined) set[key] = input[key];
  }
  for (const [part, value] of Object.entries(input.address ?? {})) {
    if (value !== undefined) set[`address.${part}`] = value;
  }
  return set;
}

export class TeacherService {
  /** `colleague`: the reader is a teacher, who sees less of each person (see ColleagueDto). */
  /**
   * The school's teachers, filtered by the server (see listTeachersQuerySchema). The search looks at the name, the mobile number, the
   * employee code, the email and the username. `colleague`: the reader is a teacher, who sees less of each person (see ColleagueDto) and
   * cannot look for a login.
   */
  static async list(tenantId: string, query: ListTeachersQuery, colleague = false): Promise<{ items: (TeacherDto | ColleagueDto)[] }> {
    const school = new Types.ObjectId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school };
    const and: Record<string, unknown>[] = [];
    if (query.status !== "all") filter.isActive = query.status === "active";
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search.trim().toLowerCase().replace(/\s+/g, " ")), "i");
      const either: Record<string, unknown>[] = [{ nameKey: pattern }, { mobile: pattern }, { employeeCode: pattern }, { email: pattern }];
      if (!colleague) {
        const users = await User.find({ tenantId: school, role: "teacher", username: pattern }).select("_id").lean();
        if (users.length > 0) either.push({ userId: { $in: users.map((u) => u._id) } });
      }
      and.push({ $or: either });
    }
    if (query.subjectId) filter.subjectIds = new Types.ObjectId(query.subjectId);
    if (query.designation) filter.designation = query.designation;
    if (query.employmentType) filter.employmentType = query.employmentType;
    if (query.gender) filter.gender = query.gender;
    if (query.classId) {
      const years = await openYearIds(tenantId);
      const [teaching, heading] = await Promise.all([
        years.length === 0 ? Promise.resolve([]) : Allotment.distinct("teacherId", { tenantId: school, academicYearId: { $in: years }, classId: new Types.ObjectId(query.classId), teacherId: { $ne: null } }),
        ClassTeacherService.teacherIds(tenantId, query.classId),
      ]);
      and.push({ _id: { $in: [...teaching, ...heading] } });
    }
    if (query.classTeacher) {
      const heads = await ClassTeacherService.teacherIds(tenantId);
      and.push({ _id: query.classTeacher === "yes" ? { $in: heads } : { $nin: heads } });
    }
    if (!colleague && query.login === "without") filter.userId = null;
    if (!colleague && (query.login === "with" || query.login === "closed")) filter.userId = { $ne: null };
    if (and.length > 0) filter.$and = and;

    const [teachers, loads] = await Promise.all([Teacher.find(filter).lean(), teacherLoads(tenantId)]);
    const [logins, heads] = await Promise.all([
      colleague ? Promise.resolve(new Map<string, TeacherLoginDto>()) : TeacherLogin.byIds(teachers.flatMap((t) => (t.userId ? [t.userId] : []))),
      ClassTeacherService.labelsByTeacher(tenantId, teachers.map((t) => t._id)),
    ]);
    const items = teachers
      .map((t) => toTeacherDto(t, loads.get(t._id.toString()), t.userId ? (logins.get(t.userId.toString()) ?? null) : null, heads.get(t._id.toString()) ?? []))
      // A login that works, or one that is switched off: told by the login itself.
      .filter((t) => colleague || !query.login || query.login === "without" || (t.login !== null && t.login.isActive === (query.login === "with")))
      .sort(byName);
    return { items: colleague ? items.map(toColleagueDto) : items };
  }

  /**
   * The numbers on top of the Teacher page: who teaches here now, how many of them are a class teacher, how many were given nothing
   * this year (no subject of a class and no class to look after), and how many have left.
   */
  static async summary(tenantId: string): Promise<TeacherSummaryDto> {
    const [teachers, loads, heads] = await Promise.all([
      Teacher.find({ tenantId: new Types.ObjectId(tenantId) }).select("_id isActive").lean(),
      teacherLoads(tenantId),
      ClassTeacherService.teacherIds(tenantId),
    ]);
    const head = new Set(heads.map(String));
    const teaching = teachers.filter((t) => t.isActive).map((t) => t._id.toString());
    return {
      teaching: teaching.length,
      classTeachers: teaching.filter((id) => head.has(id)).length,
      withoutClasses: teaching.filter((id) => !head.has(id) && !loads.has(id)).length,
      left: teachers.length - teaching.length,
    };
  }

  static async get(tenantId: string, id: string): Promise<TeacherDto> {
    const teacher = await Teacher.findOne({ _id: id, tenantId }).lean();
    if (!teacher) throw NOT_FOUND();
    const [loads, logins, heads] = await Promise.all([
      teacherLoads(tenantId),
      TeacherLogin.byIds(teacher.userId ? [teacher.userId] : []),
      ClassTeacherService.labelsByTeacher(tenantId, [teacher._id]),
    ]);
    return toTeacherDto(teacher, loads.get(id), teacher.userId ? (logins.get(teacher.userId.toString()) ?? null) : null, heads.get(id) ?? []);
  }

  /** What a teacher has been given this year (and the next): the classes they are the class teacher of, and each subject of a class they teach. */
  static async classes(tenantId: string, id: string): Promise<TeacherClassesDto> {
    if (!(await TeacherService.exists(tenantId, id))) throw NOT_FOUND();
    const years = await openYearIds(tenantId);
    if (years.length === 0) return { classTeacherOf: [], subjects: [] };
    const school = new Types.ObjectId(tenantId);
    const [classTeacherOf, rows] = await Promise.all([
      ClassTeacherService.ofTeacher(tenantId, id),
      Allotment.find({ tenantId: school, academicYearId: { $in: years }, teacherId: new Types.ObjectId(id) }).select("academicYearId classId sectionId subjectId periodsPerWeek").lean(),
    ]);
    const subjects = await Subject.find({ tenantId: school, _id: { $in: rows.map((r) => r.subjectId) } }).select("name").lean();
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
    const named = await describeUnits(tenantId, rows);
    return {
      classTeacherOf,
      subjects: named
        .map((r) => ({ row: r, dto: { ...r.ref, subjectId: r.subjectId.toString(), subjectName: subjectName.get(r.subjectId.toString()) ?? "A subject", periodsPerWeek: r.periodsPerWeek } }))
        // In teaching order (the year, the class's place, the section), then by subject within one unit.
        .sort(
          (a, b) =>
            a.dto.academicYear.name.localeCompare(b.dto.academicYear.name) ||
            a.row.order - b.row.order ||
            a.row.sectionName.localeCompare(b.row.sectionName, undefined, { numeric: true, sensitivity: "base" }) ||
            a.dto.subjectName.localeCompare(b.dto.subjectName)
        )
        .map((x) => x.dto),
    };
  }

  /** Another username for a teacher's login; the password and the sessions stay. */
  static async changeUsername(tenantId: string, id: string, username: string): Promise<TeacherDto> {
    const teacher = await Teacher.findOne({ _id: id, tenantId }).select("name userId").lean();
    if (!teacher) throw NOT_FOUND();
    if (!teacher.userId) throw ApiError.conflict(`${teacher.name} has no login yet.`, "TEACHER_HAS_NO_LOGIN");
    await TeacherLogin.setUsername(teacher.userId, username);
    return TeacherService.get(tenantId, id);
  }

  /** The teacher who signed in: their own record (found by their login, never by an id they send). */
  static async mine(tenantId: string, userId: string): Promise<TeacherDto> {
    const teacher = await Teacher.findOne({ tenantId, userId }).select("_id").lean();
    if (!teacher) throw ApiError.notFound("Your teacher record was not found. Ask your school.", "TEACHER_NOT_FOUND");
    return TeacherService.get(tenantId, teacher._id.toString());
  }

  /**
   * `options.custom`: how the answers to the school's own fields are held: `admit` (the default: a needed field must be answered, as in Add
   * teacher) or `format` (a bulk upload row: only what it gives is checked).
   */
  static async create(tenantId: string, input: CreateTeacherInput, options: { custom?: "admit" | "format" } = {}): Promise<TeacherDto> {
    if ((await Teacher.countDocuments({ tenantId })) >= MAX_TEACHERS) throw LIMIT();
    const answers = await TeacherSettingsService.check(tenantId, input.custom, options.custom ?? "admit");
    await TeacherService.assertSubjects(tenantId, input.subjectIds);
    await TeacherService.assertFree(tenantId, input.mobile ?? null, input.employeeCode ?? null, null);
    // Everything that can be checked is checked before anything is made: a refusal leaves nothing behind.
    if (input.login) await TeacherLogin.assertFree(input.login.username, input.email ?? null);

    let teacher;
    try {
      teacher = await Teacher.create({
        tenantId,
        name: input.name,
        nameKey: nameKeyOf(input.name),
        mobile: input.mobile ?? null,
        email: input.email ?? null,
        employeeCode: input.employeeCode ?? null,
        subjectIds: input.subjectIds,
        maxPeriodsPerDay: input.maxPeriodsPerDay ?? null,
        maxPeriodsPerWeek: input.maxPeriodsPerWeek ?? null,
        offDays: input.offDays,
        gender: input.gender ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        address: { line1: null, city: null, state: null, pincode: null, ...input.address },
        designation: input.designation ?? null,
        qualification: input.qualification ?? null,
        experienceYears: input.experienceYears ?? null,
        joiningDate: input.joiningDate ?? null,
        employmentType: input.employmentType ?? null,
        custom: answers.set,
      });
    } catch (err) {
      throw TeacherService.explainDuplicate(err);
    }

    let login: TeacherLoginDto | null = null;
    if (input.login) {
      // The unique indexes settle two requests at once: whoever loses undoes the teacher it just made.
      let userId: Types.ObjectId | null = null;
      try {
        userId = await TeacherLogin.create(tenantId, { name: teacher.name, mobile: teacher.mobile, email: teacher.email, isActive: true }, input.login);
        teacher.userId = userId;
        await Teacher.updateOne({ _id: teacher._id, tenantId }, { $set: { userId } });
        login = { username: input.login.username, isActive: true };
      } catch (err) {
        await Teacher.deleteOne({ _id: teacher._id, tenantId });
        if (userId) await TeacherLogin.remove(userId);
        throw err;
      }
    }
    return toTeacherDto(teacher, undefined, login);
  }

  static async update(tenantId: string, id: string, input: UpdateTeacherInput): Promise<TeacherDto> {
    const current = await Teacher.findOne({ _id: id, tenantId }).lean();
    if (!current) throw NOT_FOUND();

    if (input.isActive === false && current.isActive) {
      const load = (await teacherLoads(tenantId)).get(id);
      if (load && load.sections > 0) {
        throw ApiError.conflict(
          `${current.name} teaches ${load.sections} section${load.sections === 1 ? "" : "s"} this year (${load.periodsAllotted} period${load.periodsAllotted === 1 ? "" : "s"} a week). Give those classes to another teacher first.`,
          "TEACHER_HAS_CLASSES"
        );
      }
      // A lesson of a timetable may name a teacher on its own (a substitute for a subject's usual teacher).
      const years = await openYearIds(tenantId);
      if (years.length > 0 && (await Timetable.exists({ tenantId, academicYearId: { $in: years }, "cells.lessons.teacherId": new Types.ObjectId(id) }))) {
        throw ApiError.conflict(`${current.name} is named on lessons of a timetable. Give those lessons to another teacher first.`, "TEACHER_HAS_LESSONS");
      }
    }
    if (input.subjectIds) await TeacherService.assertSubjects(tenantId, input.subjectIds);
    await TeacherService.assertFree(tenantId, input.mobile ?? null, input.employeeCode ?? null, id);
    // The login repeats the email: it must be free before the teacher is changed.
    if (current.userId && input.email) await TeacherLogin.assertFree(null, input.email, current.userId);

    const changes = detailsOf(input);
    if (input.isActive !== undefined) changes.isActive = input.isActive;
    // The school's own fields: an answer given is set, an empty one (null) clears it.
    const answers = input.custom !== undefined ? await TeacherSettingsService.check(tenantId, input.custom, "change") : null;
    for (const [key, value] of Object.entries(answers?.set ?? {})) changes[`custom.${key}`] = value;
    const cleared = Object.fromEntries((answers?.clear ?? []).map((key) => [`custom.${key}`, ""]));
    let teacher;
    try {
      teacher = await Teacher.findOneAndUpdate({ _id: id, tenantId }, { ...(Object.keys(changes).length > 0 ? { $set: changes } : {}), ...(Object.keys(cleared).length > 0 ? { $unset: cleared } : {}) }, { new: true });
    } catch (err) {
      throw TeacherService.explainDuplicate(err);
    }
    if (!teacher) throw NOT_FOUND();

    if (current.userId) {
      await TeacherLogin.sync(current.userId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.mobile !== undefined ? { phone: input.mobile } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      });
      if (input.isActive !== undefined) await TeacherLogin.setActive(current.userId, input.isActive);
    }
    // A teacher who has left is nobody's class teacher any more (the classes show no class teacher until the school picks one).
    if (input.isActive === false && current.isActive) await ClassTeacherService.release(tenantId, id);
    // A staff member who also teaches (Staff > Add staff) is on and off with their teacher record, on both lists.
    if (input.isActive !== undefined) await StaffMember.updateOne({ tenantId, teacherId: current._id, status: { $ne: "invited" } }, { $set: { status: input.isActive ? "active" : "inactive" } });
    return TeacherService.get(tenantId, id);
  }

  /** Gives a teacher who has no login one (the same checks as when a teacher is added with one). */
  static async createLogin(tenantId: string, id: string, login: LoginAccountInput): Promise<TeacherDto> {
    const teacher = await Teacher.findOne({ _id: id, tenantId }).lean();
    if (!teacher) throw NOT_FOUND();
    if (teacher.userId) throw ApiError.conflict(`${teacher.name} already has a login.`, "TEACHER_HAS_LOGIN");
    if (!teacher.mobile) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "mobile", message: NEEDS_MOBILE_MESSAGE }]);
    await TeacherLogin.assertFree(login.username, teacher.email ?? null);

    const userId = await TeacherLogin.create(tenantId, { name: teacher.name, mobile: teacher.mobile, email: teacher.email ?? null, isActive: teacher.isActive }, login);
    const linked = await Teacher.updateOne({ _id: id, tenantId, userId: null }, { $set: { userId } });
    if (linked.modifiedCount === 0) {
      await TeacherLogin.remove(userId);
      throw ApiError.conflict(`${teacher.name} already has a login.`, "TEACHER_HAS_LOGIN");
    }
    return TeacherService.get(tenantId, id);
  }

  /** The school gives the teacher a new password (the teacher cannot ask for one: there may be no email to send it to). */
  static async resetPassword(tenantId: string, id: string, password: string): Promise<void> {
    const teacher = await Teacher.findOne({ _id: id, tenantId }).select("name userId").lean();
    if (!teacher) throw NOT_FOUND();
    if (!teacher.userId) throw ApiError.conflict(`${teacher.name} has no login yet.`, "TEACHER_HAS_NO_LOGIN");
    await TeacherLogin.setPassword(teacher.userId, password);
  }

  /** The teacher exists in this school (a 404 before anything about the request body is checked). */
  static async exists(tenantId: string, id: string): Promise<boolean> {
    return !!(await Teacher.exists({ _id: id, tenantId }));
  }

  /** Every subject named is a subject of this school. */
  static async assertSubjects(tenantId: string, subjectIds: string[]): Promise<void> {
    if (subjectIds.length === 0) return;
    const found = await Subject.countDocuments({ tenantId, _id: { $in: subjectIds.map((s) => new Types.ObjectId(s)) } });
    if (found !== subjectIds.length) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "subjectIds", message: "Choose subjects from your school's list" }]);
    }
  }

  /** The school has room for one more teacher. */
  static async assertRoom(tenantId: string): Promise<void> {
    if ((await Teacher.countDocuments({ tenantId })) >= MAX_TEACHERS) throw LIMIT();
  }

  /** The mobile number and the employee code are not another teacher's. `except` is the teacher being changed. */
  static async assertFree(tenantId: string, mobile: string | null, code: string | null, except: string | null): Promise<void> {
    const other = except ? { _id: { $ne: new Types.ObjectId(except) } } : {};
    if (mobile) {
      const clash = await Teacher.findOne({ tenantId, mobile, ...other }).select("name").lean();
      if (clash) {
        throw ApiError.conflict(`${clash.name} already has this mobile number.`, "TEACHER_MOBILE_EXISTS", [{ path: "mobile", message: `${clash.name} already has this mobile number` }]);
      }
    }
    if (code) {
      const clash = await Teacher.findOne({ tenantId, employeeCode: code, ...other }).select("name").lean();
      if (clash) {
        throw ApiError.conflict(`${clash.name} already has this employee code.`, "TEACHER_CODE_EXISTS", [{ path: "employeeCode", message: `${clash.name} already has this employee code` }]);
      }
    }
  }

  /** A duplicate the pre-check could not see (two requests at once), said the same way. */
  private static explainDuplicate(err: unknown): unknown {
    if (!isDuplicateKey(err)) return err;
    const pattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
    return "mobile" in pattern
      ? ApiError.conflict("Another teacher already has this mobile number.", "TEACHER_MOBILE_EXISTS", [{ path: "mobile", message: "Another teacher already has this mobile number" }])
      : ApiError.conflict("Another teacher already has this employee code.", "TEACHER_CODE_EXISTS", [{ path: "employeeCode", message: "Another teacher already has this employee code" }]);
  }
}
