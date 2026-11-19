import { ApiError } from "../../../utils/ApiError";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { actorRecord, type Actor } from "../../students/services/actor";
import { MAX_CLASSES, MAX_DEPARTMENTS } from "../constants";
import { Department } from "../models/Department";
import { SchoolClass } from "../models/SchoolClass";
import { NOT_INACTIVE, isInactive } from "../models/status";
import type { AddClassesInput } from "../schemas/academics.schemas";
import { ClassService } from "./class.service";
import { departmentInactive, nameTaken } from "./guards";
import { isDuplicateKey, toDepartmentDto, type DepartmentDto } from "./shared";

const NOT_FOUND = () => ApiError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");

/** The refusal for a name another department holds (in any case or spacing), saying whether that department is inactive. */
async function nameTakenError(tenantId: string, name: string): Promise<ApiError> {
  return nameTaken("department", await Department.findOne({ tenantId, nameKey: nameKeyOf(name) }).select("name status").lean(), name);
}

/** The classes in a department that a school works with: the active ones. */
const activeClassCount = (tenantId: string, departmentId: unknown) =>
  SchoolClass.countDocuments({ tenantId, departmentId, ...NOT_INACTIVE });

export class DepartmentService {
  static async create(tenantId: string, name: string): Promise<DepartmentDto> {
    if ((await Department.countDocuments({ tenantId })) >= MAX_DEPARTMENTS) {
      throw ApiError.conflict(`A school can have up to ${MAX_DEPARTMENTS} departments.`, "LIMIT_REACHED");
    }
    try {
      const department = await Department.create({ tenantId, name, nameKey: nameKeyOf(name) });
      return toDepartmentDto(department, 0);
    } catch (err) {
      if (isDuplicateKey(err)) throw await nameTakenError(tenantId, name);
      throw err;
    }
  }

  /**
   * Puts `classIds` in the department called `name`, creating the department when the school does not have one by that
   * name (a name is the same whatever its case or spacing). Classes that were in another department are moved. The classes
   * are checked first, so a wrong id creates nothing. A department that is inactive takes no class.
   */
  static async assign(
    tenantId: string,
    name: string,
    classIds: string[]
  ): Promise<{ department: DepartmentDto; created: boolean; assigned: number }> {
    const ids = [...new Set(classIds)];
    if (ids.length > 0 && (await SchoolClass.countDocuments({ tenantId, _id: { $in: ids } })) !== ids.length) {
      throw ApiError.notFound("One of those classes no longer exists. Reload the page and try again.", "CLASS_NOT_FOUND");
    }

    const nameKey = nameKeyOf(name);
    let created = false;
    const existing = await Department.findOne({ tenantId, nameKey }).select("name status").lean();
    if (existing && isInactive(existing)) throw departmentInactive(existing.name);
    if (!existing) {
      try {
        await DepartmentService.create(tenantId, name);
        created = true;
      } catch (err) {
        // Someone created the same name a moment ago: use that one.
        if (!(err instanceof ApiError) || err.code !== "DEPARTMENT_EXISTS") throw err;
      }
    }
    const department = await Department.findOne({ tenantId, nameKey });
    if (!department) throw NOT_FOUND();
    if (isInactive(department)) throw departmentInactive(department.name);

    if (ids.length > 0) {
      await SchoolClass.updateMany({ tenantId, _id: { $in: ids } }, { $set: { departmentId: department._id } });
    }
    return { department: toDepartmentDto(department, await activeClassCount(tenantId, department._id)), created, assigned: ids.length };
  }

  /**
   * Fills a department from its own screen: moves the classes the school already has into it and creates the ones it does not
   * have (a standard class such as Class 4 goes where it belongs in the teaching order). Everything is checked before anything
   * is changed, so a wrong id, a class that exists already or the class limit changes nothing.
   */
  static async addClasses(
    tenantId: string,
    id: string,
    input: AddClassesInput
  ): Promise<{ department: DepartmentDto; moved: number; created: number }> {
    const department = await Department.findOne({ _id: id, tenantId });
    if (!department) throw NOT_FOUND();
    if (isInactive(department)) throw departmentInactive(department.name);

    const ids = [...new Set(input.classIds)];
    if (ids.length > 0 && (await SchoolClass.countDocuments({ tenantId, _id: { $in: ids } })) !== ids.length) {
      throw ApiError.notFound("One of those classes no longer exists. Reload the page and try again.", "CLASS_NOT_FOUND");
    }

    const wanted = new Map(input.names.map((name) => [nameKeyOf(name), name]));
    const clash = await SchoolClass.findOne({ tenantId, nameKey: { $in: [...wanted.keys()] } }).select("name").lean();
    if (clash) throw await ClassService.nameTaken(tenantId, clash.name);
    if ((await SchoolClass.countDocuments({ tenantId })) + wanted.size > MAX_CLASSES) {
      throw ApiError.conflict(`A school can have up to ${MAX_CLASSES} classes.`, "LIMIT_REACHED");
    }

    if (ids.length > 0) {
      await SchoolClass.updateMany({ tenantId, _id: { $in: ids } }, { $set: { departmentId: department._id } });
    }
    for (const name of wanted.values()) {
      // The schema asks for the seats whenever a new class is made, so `capacity` is there.
      await ClassService.create(tenantId, { name, departmentId: id, capacity: input.capacity!, sectionCount: input.sectionCount });
    }

    return {
      department: toDepartmentDto(department, await activeClassCount(tenantId, department._id)),
      moved: ids.length,
      created: wanted.size,
    };
  }

  static async rename(tenantId: string, id: string, name: string): Promise<DepartmentDto> {
    const current = await Department.findOne({ _id: id, tenantId }).select("name status").lean();
    if (!current) throw NOT_FOUND();
    if (isInactive(current)) throw departmentInactive(current.name);
    try {
      const department = await Department.findOneAndUpdate(
        { _id: id, tenantId },
        { $set: { name, nameKey: nameKeyOf(name) } },
        { new: true }
      );
      if (!department) throw NOT_FOUND();
      return toDepartmentDto(department, await activeClassCount(tenantId, department._id));
    } catch (err) {
      if (isDuplicateKey(err)) throw await nameTakenError(tenantId, name);
      throw err;
    }
  }

  /**
   * A department is never deleted: a school makes it inactive when it no longer uses it. It must have no active class left (they are made
   * inactive first, which asks for their students to be moved): so the order is always the student, the class, the department. Its inactive
   * classes keep pointing at it, so making it active again brings the whole wing back as it was.
   */
  static async deactivate(tenantId: string, actor: Actor, id: string): Promise<DepartmentDto> {
    const department = await Department.findOne({ _id: id, tenantId });
    if (!department) throw NOT_FOUND();
    if (isInactive(department)) throw ApiError.conflict(`${department.name} is already inactive.`, "DEPARTMENT_ALREADY_INACTIVE");

    const active = await activeClassCount(tenantId, department._id);
    if (active > 0) {
      throw ApiError.conflict(
        `${department.name} still has ${active} active class${active === 1 ? "" : "es"}. Make ${active === 1 ? "it" : "them"} inactive first.`,
        "DEPARTMENT_HAS_CLASSES"
      );
    }
    const done = await Department.findOneAndUpdate(
      { _id: id, tenantId, ...NOT_INACTIVE },
      { $set: { status: "inactive", inactive: { at: new Date(), by: await actorRecord(actor) } } },
      { new: true }
    );
    if (!done) throw ApiError.conflict(`${department.name} is already inactive.`, "DEPARTMENT_ALREADY_INACTIVE");
    return toDepartmentDto(done, 0);
  }

  static async reactivate(tenantId: string, id: string): Promise<DepartmentDto> {
    const department = await Department.findOne({ _id: id, tenantId });
    if (!department) throw NOT_FOUND();
    if (!isInactive(department)) throw ApiError.conflict(`${department.name} is already active.`, "DEPARTMENT_ALREADY_ACTIVE");
    const done = await Department.findOneAndUpdate({ _id: id, tenantId }, { $set: { status: "active", inactive: null } }, { new: true });
    if (!done) throw NOT_FOUND();
    return toDepartmentDto(done, await activeClassCount(tenantId, done._id));
  }
}
