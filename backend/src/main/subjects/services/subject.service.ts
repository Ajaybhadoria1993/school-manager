import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { isDuplicateKey } from "../../academics/services/shared";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { MAX_SUBJECTS, SUBJECT_PRESETS, type SubjectCategory } from "../constants";
import { Allotment } from "../models/Allotment";
import { Subject, type ISubject } from "../models/Subject";
import type { CreateSubjectInput, ListSubjectsQuery, UpdateSubjectInput } from "../schemas/subjects.schemas";

/** A subject as it leaves the API. `sections` is how many classes or sections study it in the school's running (or waiting) year. */
export interface SubjectDto {
  id: string;
  name: string;
  code: string | null;
  category: SubjectCategory;
  isActive: boolean;
  sections: number;
}

type SubjectLike = Pick<ISubject, "_id" | "name" | "code" | "category" | "isActive">;

export const toSubjectDto = (s: SubjectLike, sections = 0): SubjectDto => ({
  id: s._id.toString(),
  name: s.name,
  code: s.code ?? null,
  category: s.category,
  isActive: s.isActive,
  sections,
});

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const PRESET_CATEGORY = new Map(SUBJECT_PRESETS.map((p) => [nameKeyOf(p.name), p.category]));

const NOT_FOUND = () => ApiError.notFound("Subject not found", "SUBJECT_NOT_FOUND");
const LIMIT = () => ApiError.conflict(`A school can have up to ${MAX_SUBJECTS} subjects.`, "LIMIT_REACHED");
const NAME_EXISTS = (existing: string) =>
  ApiError.conflict(`Your school already has a subject called ${existing}.`, "SUBJECT_EXISTS", [
    { path: "name", message: `Your school already has a subject called ${existing}` },
  ]);
const CODE_EXISTS = (existing: string) =>
  ApiError.conflict(`The code ${existing} is already used by another subject.`, "SUBJECT_CODE_EXISTS", [
    { path: "code", message: `The code ${existing} is already used by another subject` },
  ]);

/** The years a class's subjects can still change in: the running one and the next one that waits. */
export async function openYearIds(tenantId: string): Promise<Types.ObjectId[]> {
  const years = await AcademicYear.find({ tenantId: new Types.ObjectId(tenantId), status: { $in: ["active", "pending"] } }).select("_id").lean();
  return years.map((y) => y._id);
}

/** How many classes or sections study each subject in the open years, by subject id. */
async function sectionCounts(tenantId: string): Promise<Map<string, number>> {
  const years = await openYearIds(tenantId);
  if (years.length === 0) return new Map();
  const rows = await Allotment.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { tenantId: new Types.ObjectId(tenantId), academicYearId: { $in: years } } },
    { $group: { _id: "$subjectId", n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.n]));
}

export class SubjectService {
  static async list(tenantId: string, query: ListSubjectsQuery): Promise<{ items: SubjectDto[] }> {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (query.status !== "all") filter.isActive = query.status === "active";
    const [subjects, counts] = await Promise.all([Subject.find(filter).lean(), sectionCounts(tenantId)]);
    return { items: subjects.map((s) => toSubjectDto(s, counts.get(s._id.toString()) ?? 0)).sort(byName) };
  }

  static async create(tenantId: string, input: CreateSubjectInput): Promise<SubjectDto> {
    if ((await Subject.countDocuments({ tenantId })) >= MAX_SUBJECTS) throw LIMIT();
    await SubjectService.assertFree(tenantId, input.name, input.code ?? null, null);
    try {
      const subject = await Subject.create({
        tenantId,
        name: input.name,
        nameKey: nameKeyOf(input.name),
        code: input.code ?? null,
        category: input.category,
      });
      return toSubjectDto(subject);
    } catch (err) {
      throw SubjectService.explainDuplicate(err, input.name, input.code ?? null);
    }
  }

  /**
   * The usual subjects added by their names in one request. A name the school already has is skipped (and handed back as typed),
   * a name on the usual list gets that list's category, any other name is an academic subject.
   */
  static async quickAdd(tenantId: string, names: string[]): Promise<{ created: SubjectDto[]; skipped: string[] }> {
    const existing = new Set((await Subject.find({ tenantId }).select("nameKey").lean()).map((s) => s.nameKey));
    const skipped: string[] = [];
    const fresh: string[] = [];
    for (const name of names) {
      const key = nameKeyOf(name);
      if (existing.has(key)) skipped.push(name);
      else {
        existing.add(key);
        fresh.push(name);
      }
    }
    if (existing.size > MAX_SUBJECTS) throw LIMIT();

    const created: SubjectDto[] = [];
    for (const name of fresh) {
      try {
        const subject = await Subject.create({ tenantId, name, nameKey: nameKeyOf(name), code: null, category: PRESET_CATEGORY.get(nameKeyOf(name)) ?? "academic" });
        created.push(toSubjectDto(subject));
      } catch (err) {
        // Added at the same moment by another request: it is there, which is what was asked for.
        if (!isDuplicateKey(err)) throw err;
        skipped.push(name);
      }
    }
    return { created, skipped };
  }

  static async update(tenantId: string, id: string, input: UpdateSubjectInput): Promise<SubjectDto> {
    const current = await Subject.findOne({ _id: id, tenantId }).lean();
    if (!current) throw NOT_FOUND();

    if (input.isActive === false && current.isActive) {
      const used = (await sectionCounts(tenantId)).get(id) ?? 0;
      if (used > 0) {
        throw ApiError.conflict(
          `${current.name} is taught in ${used} section${used === 1 ? "" : "s"} this year. Take it out of ${used === 1 ? "it" : "them"} first.`,
          "SUBJECT_IN_USE"
        );
      }
    }

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) Object.assign(changes, { name: input.name, nameKey: nameKeyOf(input.name) });
    if (input.code !== undefined) changes.code = input.code;
    if (input.category !== undefined) changes.category = input.category;
    if (input.isActive !== undefined) changes.isActive = input.isActive;
    await SubjectService.assertFree(tenantId, input.name ?? null, input.code ?? null, id);

    try {
      const subject = await Subject.findOneAndUpdate({ _id: id, tenantId }, { $set: changes }, { new: true });
      if (!subject) throw NOT_FOUND();
      return toSubjectDto(subject, (await sectionCounts(tenantId)).get(id) ?? 0);
    } catch (err) {
      throw SubjectService.explainDuplicate(err, input.name ?? "", input.code ?? null);
    }
  }

  /** The subject exists in this school (a 404 before anything about the request body is checked). */
  static async exists(tenantId: string, id: string): Promise<boolean> {
    return !!(await Subject.exists({ _id: id, tenantId }));
  }

  /** The name and the code are not another subject's. `except` is the subject being changed. */
  private static async assertFree(tenantId: string, name: string | null, code: string | null, except: string | null): Promise<void> {
    const other = except ? { _id: { $ne: new Types.ObjectId(except) } } : {};
    if (name) {
      const clash = await Subject.findOne({ tenantId, nameKey: nameKeyOf(name), ...other }).select("name").lean();
      if (clash) throw NAME_EXISTS(clash.name);
    }
    if (code) {
      const clash = await Subject.findOne({ tenantId, code, ...other }).select("code").lean();
      if (clash) throw CODE_EXISTS(code);
    }
  }

  /** A duplicate the pre-check could not see (two requests at once), said the same way. */
  private static explainDuplicate(err: unknown, name: string, code: string | null): unknown {
    if (!isDuplicateKey(err)) return err;
    const pattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
    return "code" in pattern && code ? CODE_EXISTS(code) : NAME_EXISTS(name);
  }
}
