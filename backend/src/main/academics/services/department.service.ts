import { ApiError } from "../../../utils/ApiError";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { MAX_CLASSES, MAX_DEPARTMENTS } from "../constants";
import { Department } from "../models/Department";
import { SchoolClass } from "../models/SchoolClass";
import type { AddClassesInput } from "../schemas/academics.schemas";
import { ClassService } from "./class.service";
import { isDuplicateKey, type DepartmentDto } from "./shared";

const NOT_FOUND = () => ApiError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
const EXISTS = (name: string) =>
  ApiError.conflict(`You already have a department called "${name}".`, "DEPARTMENT_EXISTS");

export class DepartmentService {
  static async create(tenantId: string, name: string): Promise<DepartmentDto> {
    if ((await Department.countDocuments({ tenantId })) >= MAX_DEPARTMENTS) {
      throw ApiError.conflict(`A school can have up to ${MAX_DEPARTMENTS} departments.`, "LIMIT_REACHED");
    }
    try {
      const department = await Department.create({ tenantId, name, nameKey: nameKeyOf(name) });
      return { id: department._id.toString(), name: department.name, classCount: 0 };
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS(name);
      throw err;
    }
  }

  /**
   * Puts `classIds` in the department called `name`, creating the department when the school does not have one by that
   * name (a name is the same whatever its case or spacing). Classes that were in another department are moved. The classes
   * are checked first, so a wrong id creates nothing.
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
    if (!(await Department.exists({ tenantId, nameKey }))) {
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

    if (ids.length > 0) {
      await SchoolClass.updateMany({ tenantId, _id: { $in: ids } }, { $set: { departmentId: department._id } });
    }
    const classCount = await SchoolClass.countDocuments({ tenantId, departmentId: department._id });
    return { department: { id: department._id.toString(), name: department.name, classCount }, created, assigned: ids.length };
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

    const ids = [...new Set(input.classIds)];
    if (ids.length > 0 && (await SchoolClass.countDocuments({ tenantId, _id: { $in: ids } })) !== ids.length) {
      throw ApiError.notFound("One of those classes no longer exists. Reload the page and try again.", "CLASS_NOT_FOUND");
    }

    const wanted = new Map(input.names.map((name) => [nameKeyOf(name), name]));
    const clash = await SchoolClass.findOne({ tenantId, nameKey: { $in: [...wanted.keys()] } }).select("name").lean();
    if (clash) throw ApiError.conflict(`You already have a class called "${clash.name}".`, "CLASS_EXISTS");
    if ((await SchoolClass.countDocuments({ tenantId })) + wanted.size > MAX_CLASSES) {
      throw ApiError.conflict(`A school can have up to ${MAX_CLASSES} classes.`, "LIMIT_REACHED");
    }

    if (ids.length > 0) {
      await SchoolClass.updateMany({ tenantId, _id: { $in: ids } }, { $set: { departmentId: department._id } });
    }
    for (const name of wanted.values()) {
      await ClassService.create(tenantId, { name, departmentId: id, sectionCount: input.sectionCount });
    }

    const classCount = await SchoolClass.countDocuments({ tenantId, departmentId: department._id });
    return {
      department: { id: department._id.toString(), name: department.name, classCount },
      moved: ids.length,
      created: wanted.size,
    };
  }

  static async rename(tenantId: string, id: string, name: string): Promise<DepartmentDto> {
    try {
      const department = await Department.findOneAndUpdate(
        { _id: id, tenantId },
        { $set: { name, nameKey: nameKeyOf(name) } },
        { new: true }
      );
      if (!department) throw NOT_FOUND();
      const classCount = await SchoolClass.countDocuments({ tenantId, departmentId: department._id });
      return { id: department._id.toString(), name: department.name, classCount };
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS(name);
      throw err;
    }
  }

  /**
   * A department is only a label, so deleting it never deletes classes: they stay, without a department.
   * Returns how many classes that was, so the screen can say so.
   */
  static async remove(tenantId: string, id: string): Promise<{ unlinkedClasses: number }> {
    if (!(await Department.exists({ _id: id, tenantId }))) throw NOT_FOUND();
    const { modifiedCount } = await SchoolClass.updateMany({ tenantId, departmentId: id }, { $set: { departmentId: null } });
    await Department.deleteOne({ _id: id, tenantId });
    return { unlinkedClasses: modifiedCount };
  }
}
