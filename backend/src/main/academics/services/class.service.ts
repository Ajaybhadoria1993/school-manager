import { Types, type PipelineStage } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { CLASS_LEVELS } from "../../tenants/constants";
import { actorRecord, type Actor } from "../../students/services/actor";
import { MAX_CLASSES, levelToClass, sectionLetters } from "../constants";
import { Department } from "../models/Department";
import { SchoolClass, type ISchoolClass } from "../models/SchoolClass";
import { Section, type ISection } from "../models/Section";
import { NOT_INACTIVE, isInactive } from "../models/status";
import type { CreateClassInput, ListClassesQuery, UpdateClassInput } from "../schemas/academics.schemas";
import { AcademicYearService } from "./academicYear.service";
import { classInactive, departmentInactive, nameTaken } from "./guards";
import { assertClassHolds, assertSeatsHold, seatsHeldBySections } from "./seats";
import { isDuplicateKey, toClassDto, type ClassDto } from "./shared";
import { activeStudentsInClass, studentsInClassItself } from "./usage";

const NOT_FOUND = () => ApiError.notFound("Class not found", "CLASS_NOT_FOUND");

/** The department a class is being put in must be one of this school's, and active: an inactive department takes no class. */
async function assertDepartment(tenantId: string, departmentId: string | null | undefined): Promise<void> {
  if (!departmentId) return;
  const department = await Department.findOne({ _id: departmentId, tenantId }).select("name status").lean();
  if (!department) {
    throw ApiError.badRequest("That department no longer exists. Reload the page and pick again.", "DEPARTMENT_NOT_FOUND");
  }
  if (isInactive(department)) throw departmentInactive(department.name);
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
  /** The refusal for a name another class holds (in any case or spacing), saying whether that class is inactive. */
  static async nameTaken(tenantId: string, name: string) {
    return nameTaken("class", await SchoolClass.findOne({ tenantId, nameKey: nameKeyOf(name) }).select("name status").lean(), name);
  }

  /** One class with its sections of the current session. */
  static async get(tenantId: string, id: string): Promise<ClassDto> {
    const found = await SchoolClass.findOne({ _id: id, tenantId }).lean();
    if (!found) throw NOT_FOUND();
    const academicYearId = await AcademicYearService.shownYearId(tenantId);
    return toClassDto(found, await Section.find({ tenantId, classId: found._id, academicYearId }).lean());
  }

  /**
   * The school's classes, filtered, sorted and cut into pages by the database (one aggregation), each with its sections.
   * A class's seats are its own (SchoolClass.capacity, whether or not it has sections); a class whose seats are not set is left
   * out when the list is filtered by seats, because "not set" is not a number of seats.
   */
  static async list(tenantId: string, query: ListClassesQuery): Promise<ClassPage> {
    const school = new Types.ObjectId(tenantId);
    // A class's sections (and so its seats) are those of the session shown (the running one, or a past one being looked at).
    const academicYearId = await AcademicYearService.shownYearId(tenantId);
    const match: Record<string, unknown> = { tenantId: school };
    // The active ones by default (the classes a school works with); the inactive ones are asked for, to be made active again.
    if (query.status === "active") Object.assign(match, NOT_INACTIVE);
    else if (query.status === "inactive") match.status = "inactive";
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
      // The class's own seats; a class whose seats are not set counts as 0, which a seat filter then leaves out.
      { $addFields: { seatsTotal: { $ifNull: ["$capacity", 0] } } },
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

  /**
   * The new class goes last (a standard one goes in its teaching place, see placeInTeachingOrder). It has its `capacity` seats from the
   * start, with or without sections, and starts with `sectionCount` sections (A, B, ...), which have no seats of their own yet.
   */
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
        capacity: input.capacity,
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw await ClassService.nameTaken(tenantId, input.name);
      throw err;
    }

    const order = await ClassService.placeInTeachingOrder(tenantId, created._id, input.name, created.order);

    const academicYearId = await AcademicYearService.activeYearId(tenantId);
    const sections = await Section.insertMany(
      sectionLetters(input.sectionCount).map((name) => ({ tenantId, classId: created._id, academicYearId, name, nameKey: nameKeyOf(name) }))
    );
    return toClassDto({ _id: created._id, name: created.name, departmentId: created.departmentId, capacity: created.capacity, order }, sections);
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
    // 404 first, then an inactive class is read, not changed.
    const current = await SchoolClass.findOne({ _id: id, tenantId }).select("name status").lean();
    if (!current) throw NOT_FOUND();
    if (isInactive(current)) throw classInactive(current.name);
    await assertDepartment(tenantId, input.departmentId);

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) Object.assign(changes, { name: input.name, nameKey: nameKeyOf(input.name) });
    if (input.departmentId !== undefined) changes.departmentId = input.departmentId;
    if (input.capacity !== undefined) {
      // The sections of the class split its seats, so it cannot be given fewer than they hold.
      const academicYearId = await AcademicYearService.activeYearId(tenantId);
      assertClassHolds(current.name, input.capacity, await seatsHeldBySections(tenantId, id, academicYearId));
      // A class that is not split holds its students itself: its seats cannot go below them. (With sections, each section's seats are checked
      // against its own students, and the class's against its sections' seats above.)
      if (!(await Section.exists({ tenantId, classId: id, academicYearId }))) {
        assertSeatsHold(current.name, input.capacity, await studentsInClassItself(tenantId, id), "CLASS_SEATS_BELOW_STUDENTS");
      }
      changes.capacity = input.capacity;
    }

    try {
      const updated = await SchoolClass.findOneAndUpdate({ _id: id, tenantId }, { $set: changes }, { new: true });
      if (!updated) throw NOT_FOUND();
      const academicYearId = await AcademicYearService.activeYearId(tenantId);
      return toClassDto(updated, await Section.find({ tenantId, classId: updated._id, academicYearId }));
    } catch (err) {
      if (isDuplicateKey(err)) throw await ClassService.nameTaken(tenantId, input.name ?? "");
      throw err;
    }
  }

  /**
   * A class is never deleted: its students and their history belong to it. A school that no longer teaches it, or made it by mistake,
   * makes it inactive. It must have no student left in it (active this year, or promoted into it for the year that is waiting): they are
   * moved to another class first, or made inactive. A student who left, and the students of past years, are history and stay with it.
   * Nothing is thrown away: its sections, timetable and exam papers are kept for when it is made active again.
   */
  static async deactivate(tenantId: string, actor: Actor, id: string): Promise<ClassDto> {
    const klass = await SchoolClass.findOne({ _id: id, tenantId }).select("name status").lean();
    if (!klass) throw NOT_FOUND();
    if (isInactive(klass)) throw ApiError.conflict(`${klass.name} is already inactive.`, "CLASS_ALREADY_INACTIVE");

    const students = await activeStudentsInClass(tenantId, id);
    if (students > 0) {
      throw ApiError.conflict(
        `${klass.name} has ${students} student${students === 1 ? "" : "s"}. Move them to another class, or make them inactive, first.`,
        "CLASS_HAS_STUDENTS"
      );
    }

    const done = await SchoolClass.findOneAndUpdate(
      { _id: id, tenantId, ...NOT_INACTIVE },
      { $set: { status: "inactive", inactive: { at: new Date(), by: await actorRecord(actor) } } },
      { new: true }
    );
    // Two people pressing it at the same moment: the other one won.
    if (!done) throw ApiError.conflict(`${klass.name} is already inactive.`, "CLASS_ALREADY_INACTIVE");
    return ClassService.get(tenantId, id);
  }

  /** Makes it active again, as it was. Its department must be active too: a class never comes back under a department that is hidden. */
  static async reactivate(tenantId: string, id: string): Promise<ClassDto> {
    const klass = await SchoolClass.findOne({ _id: id, tenantId }).select("name status departmentId").lean();
    if (!klass) throw NOT_FOUND();
    if (!isInactive(klass)) throw ApiError.conflict(`${klass.name} is already active.`, "CLASS_ALREADY_ACTIVE");

    if (klass.departmentId) {
      const department = await Department.findOne({ _id: klass.departmentId, tenantId }).select("name status").lean();
      if (department && isInactive(department)) {
        throw ApiError.conflict(
          `${klass.name} belongs to ${department.name}, which is inactive. Make ${department.name} active first.`,
          "DEPARTMENT_INACTIVE"
        );
      }
    }
    await SchoolClass.updateOne({ _id: id, tenantId }, { $set: { status: "active", inactive: null } });
    return ClassService.get(tenantId, id);
  }
}
