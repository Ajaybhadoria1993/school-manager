import { Types, type PipelineStage } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { CLASS_LEVELS } from "../../tenants/constants";
import { MAX_CLASSES, levelToClass, sectionLetters } from "../constants";
import { Department } from "../models/Department";
import { SchoolClass, type ISchoolClass } from "../models/SchoolClass";
import { Section, type ISection } from "../models/Section";
import type { CreateClassInput, ListClassesQuery, UpdateClassInput } from "../schemas/academics.schemas";
import { AcademicYearService } from "./academicYear.service";
import { isDuplicateKey, toClassDto, type ClassDto } from "./shared";
import { enrolmentCountsByClass, studentCountsBySection } from "./usage";

const NOT_FOUND = () => ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
const EXISTS = (name: string) => ApiError.conflict(`You already have a class called "${name}".`, "CLASS_EXISTS");

/** The department a class is being put in must be one of this school's. */
async function assertDepartment(tenantId: string, departmentId: string | null | undefined): Promise<void> {
  if (departmentId && !(await Department.exists({ _id: departmentId, tenantId }))) {
    throw ApiError.badRequest("That department no longer exists. Reload the page and pick again.", "DEPARTMENT_NOT_FOUND");
  }
}

/** Where each standard class sits in the teaching order: Pre-Nursery 0, Nursery 1, LKG 2, UKG 3, Class 1 4 ... Class 12 15. */
const STANDARD_RANK = new Map(CLASS_LEVELS.map((level, rank) => [nameKeyOf(levelToClass(level).name), rank]));
/** A numbered class continues the same count ("Class 13" is 16), so a school with more classes than the usual twelve keeps its order. */
const BEFORE_CLASS_1 = 3;
const standardRank = (name: string): number | null => {
  const key = nameKeyOf(name);
  const number = /^class (\d{1,2})$/.exec(key)?.[1];
  return STANDARD_RANK.get(key) ?? (number ? BEFORE_CLASS_1 + Number(number) : null);
};

/** One page of the class list, and how many classes matched in all. */
export interface ClassPage {
  items: ClassDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class ClassService {
  /** One class with its sections of the current session. */
  static async get(tenantId: string, id: string): Promise<ClassDto> {
    const found = await SchoolClass.findOne({ _id: id, tenantId }).lean();
    if (!found) throw NOT_FOUND();
    const academicYearId = await AcademicYearService.activeYearId(tenantId);
    return toClassDto(found, await Section.find({ tenantId, classId: found._id, academicYearId }).lean());
  }

  /**
   * The school's classes, filtered, sorted and cut into pages by the database (one aggregation), each with its sections.
   * A class's seats are the sum of its sections' limits; a class whose seats are not set at all is left out when the list is
   * filtered by seats, because "no limit" is not a number of seats.
   */
  static async list(tenantId: string, query: ListClassesQuery): Promise<ClassPage> {
    const school = new Types.ObjectId(tenantId);
    // A class's sections (and so its seats) are those of the current session.
    const academicYearId = await AcademicYearService.activeYearId(tenantId);
    const match: Record<string, unknown> = { tenantId: school };
    if (query.departmentId) match.departmentId = query.departmentId === "none" ? null : new Types.ObjectId(query.departmentId);
    if (query.search) match.nameKey = { $regex: escapeRegex(nameKeyOf(query.search)) };

    const seatsLimits: Record<string, number> = {};
    if (query.seatsMin !== undefined) seatsLimits.$gte = query.seatsMin;
    if (query.seatsMax !== undefined) seatsLimits.$lte = query.seatsMax;
    const filteredBySeats = Object.keys(seatsLimits).length > 0;

    const direction = query.dir === "desc" ? -1 : 1;
    const sort: Record<string, 1 | -1> =
      query.sort === "name"
        ? { nameKey: direction, _id: 1 }
        : query.sort === "seats"
          ? { seatsTotal: direction, order: 1, _id: 1 }
          : { order: direction, _id: direction };

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: Section.collection.name,
          let: { classId: "$_id" },
          pipeline: [{ $match: { tenantId: school, academicYearId, $expr: { $eq: ["$classId", "$$classId"] } } }],
          as: "sections",
        },
      },
      { $addFields: { seatsTotal: { $sum: "$sections.capacity" } } },
      ...(filteredBySeats ? [{ $match: { seatsTotal: { $gt: 0, ...seatsLimits } } } as PipelineStage] : []),
      { $sort: sort },
      {
        $facet: {
          items: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
          total: [{ $count: "n" }],
        },
      },
    ];
    // Natural order for names: "Class 2" before "Class 10".
    const [result] = await SchoolClass.aggregate<{ items: (ISchoolClass & { sections: ISection[] })[]; total: { n: number }[] }>(
      pipeline
    ).collation({ locale: "en", numericOrdering: true });
    const total = result?.total[0]?.n ?? 0;
    return {
      items: (result?.items ?? []).map((c) => toClassDto(c, c.sections)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /** The new class goes last (a standard one goes in its teaching place, see placeInTeachingOrder). It starts with `sectionCount` sections (A, B, ...). */
  static async create(tenantId: string, input: CreateClassInput): Promise<ClassDto> {
    if ((await SchoolClass.countDocuments({ tenantId })) >= MAX_CLASSES) {
      throw ApiError.conflict(`A school can have up to ${MAX_CLASSES} classes.`, "LIMIT_REACHED");
    }
    await assertDepartment(tenantId, input.departmentId);

    const last = await SchoolClass.findOne({ tenantId }).sort({ order: -1 }).select("order").lean();
    let created;
    try {
      created = await SchoolClass.create({
        tenantId,
        name: input.name,
        nameKey: nameKeyOf(input.name),
        departmentId: input.departmentId ?? null,
        order: (last?.order ?? 0) + 1,
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS(input.name);
      throw err;
    }

    const order = await ClassService.placeInTeachingOrder(tenantId, created._id, input.name, created.order);

    const academicYearId = await AcademicYearService.activeYearId(tenantId);
    const sections = await Section.insertMany(
      sectionLetters(input.sectionCount).map((name) => ({ tenantId, classId: created._id, academicYearId, name, nameKey: nameKeyOf(name) }))
    );
    return toClassDto({ _id: created._id, name: created.name, departmentId: created.departmentId, order }, sections);
  }

  /**
   * A new class goes last, except a standard one (Class 4, LKG...): it goes before the first standard class the school has
   * that comes after it, so adding Class 4 to a school that has Class 3 and Class 5 puts it between them; with none after it,
   * it goes right behind the last one that comes before it. A class with a name of its own stays last. Returns the order the class ended up with.
   */
  private static async placeInTeachingOrder(
    tenantId: string,
    classId: Types.ObjectId,
    name: string,
    lastOrder: number
  ): Promise<number> {
    const rank = standardRank(name);
    if (rank === null) return lastOrder;
    const all = await SchoolClass.find({ tenantId }).sort({ order: 1, _id: 1 }).select("_id name").lean();
    const added = all.find((c) => c._id.equals(classId));
    const others = all.filter((c) => !c._id.equals(classId));
    const ranks = others.map((c) => standardRank(c.name));
    const firstAfter = ranks.findIndex((other) => other !== null && other > rank);
    const lastBefore = ranks.reduce<number>((found, other, i) => (other !== null && other < rank ? i : found), -1);
    const at = firstAfter >= 0 ? firstAfter : lastBefore >= 0 ? lastBefore + 1 : others.length;
    if (!added || at >= others.length) return lastOrder;
    const sequence = [...others.slice(0, at), added, ...others.slice(at)];
    await SchoolClass.bulkWrite(
      sequence.map((c, index) => ({ updateOne: { filter: { _id: c._id, tenantId }, update: { $set: { order: index + 1 } } } }))
    );
    return at + 1;
  }

  static async update(tenantId: string, id: string, input: UpdateClassInput): Promise<ClassDto> {
    await assertDepartment(tenantId, input.departmentId);

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) Object.assign(changes, { name: input.name, nameKey: nameKeyOf(input.name) });
    if (input.departmentId !== undefined) changes.departmentId = input.departmentId;

    try {
      const updated = await SchoolClass.findOneAndUpdate({ _id: id, tenantId }, { $set: changes }, { new: true });
      if (!updated) throw NOT_FOUND();
      const academicYearId = await AcademicYearService.activeYearId(tenantId);
      return toClassDto(updated, await Section.find({ tenantId, classId: updated._id, academicYearId }));
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS(input.name ?? "");
      throw err;
    }
  }

  /**
   * A class goes with all its sections, unless it has students: this year's (in a section or in the class itself) or any other
   * year's (history). The Students module counts them, see usage.ts.
   */
  static async remove(tenantId: string, id: string): Promise<{ removedSections: number }> {
    if (!(await SchoolClass.exists({ _id: id, tenantId }))) throw NOT_FOUND();

    // Deleting a class deletes its sections, so it cannot be done while the class holds sections of another academic year: those are
    // that year's records (its students, its attendance) and are kept.
    const currentYear = await AcademicYearService.activeYearId(tenantId);
    if (await Section.exists({ tenantId, classId: id, academicYearId: { $ne: currentYear } })) {
      throw ApiError.conflict(
        "This class has sections in another academic year, so it cannot be deleted. Its history is kept.",
        "CLASS_HAS_HISTORY"
      );
    }

    const sections = await Section.find({ tenantId, classId: id }).select("_id").lean();
    const counts = await studentCountsBySection(tenantId, sections.map((s) => s._id.toString()));
    // A class with no sections holds its students itself, so they are counted by class too, in every academic year.
    const enrolments = await enrolmentCountsByClass(tenantId, id, currentYear);
    const students = Math.max([...counts.values()].reduce((sum, n) => sum + n, 0), enrolments.thisYear);
    if (students > 0) {
      throw ApiError.conflict(
        `This class has ${students} student${students === 1 ? "" : "s"}. Move them to another class first.`,
        "CLASS_HAS_STUDENTS"
      );
    }
    if (enrolments.otherYears > 0) {
      throw ApiError.conflict(
        "This class has students in another academic year, so it cannot be deleted. Its history is kept.",
        "CLASS_HAS_HISTORY"
      );
    }

    await Section.deleteMany({ tenantId, classId: id });
    await SchoolClass.deleteOne({ _id: id, tenantId });
    return { removedSections: sections.length };
  }
}
