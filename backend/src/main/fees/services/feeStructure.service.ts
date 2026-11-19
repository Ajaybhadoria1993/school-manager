import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Department } from "../../academics/models/Department";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { NOT_INACTIVE } from "../../academics/models/status";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { viewedYear } from "../../academics/services/viewedYear";
import { DEVELOPMENT_FEE_CAP_PERCENT, defaultMonths, yearlyCost, type AppliesTo, type FeeFrequency } from "../constants";
import { FeeHead, type IFeeHead } from "../models/FeeHead";
import { FeeLine, type IFeeLine } from "../models/FeeLine";
import { appliesProblem, monthsProblem, type CopyClassInput, type CopyYearInput, type CreateLinesInput, type UpdateLineInput } from "../schemas/fees.schemas";
import { asId, headDto, isDuplicateKey } from "./feeHead.service";

type Detail = { path: string; message: string };
const validation = (details: Detail[]) => ApiError.badRequest("Validation failed", "VALIDATION_ERROR", details);
const LINE_NOT_FOUND = () => ApiError.notFound("Fee not found on this class's fee chart", "FEE_LINE_NOT_FOUND");
const NO_YEAR = () => ApiError.conflict("Set up the school's academic year first", "NO_ACADEMIC_YEAR");
const CLASS_NOT_FOUND = () => ApiError.badRequest("A class you chose is not in your school", "CLASS_NOT_FOUND", [{ path: "classIds", message: "Choose classes of your school" }]);

const round2 = (n: number) => Math.round(n * 100) / 100;

interface YearInfo {
  id: Types.ObjectId;
  name: string;
  startDate: Date;
  status: "pending" | "active" | "closed";
}

export interface LineDto {
  id: string;
  headId: string;
  headName: string;
  kind: IFeeHead["kind"];
  refundable: boolean;
  amount: number;
  frequency: FeeFrequency;
  dueMonths: number[];
  appliesTo: AppliesTo;
  optional: boolean;
  notes: string | null;
  /** What one student pays for it over the session. */
  yearly: number;
}

const lineKey = (classId: unknown, headId: unknown, appliesTo: string) => `${String(classId)}|${String(headId)}|${appliesTo}`;

/** What a class's fee chart comes to for each kind of student, in rupees. Only compulsory fees are in the first three; the optional ones are said apart. */
function totalsOf(lines: LineDto[]) {
  const sum = (rows: LineDto[]) => round2(rows.reduce((total, l) => total + l.yearly, 0));
  const compulsory = lines.filter((l) => !l.optional);
  const forNew = compulsory.filter((l) => l.appliesTo !== "existing");
  const forExisting = compulsory.filter((l) => l.appliesTo !== "new");
  return {
    /** A student who joins, in their first session. */
    newStudent: sum(forNew),
    /** Only what is paid once, at joining (registration, admission, caution money). */
    atJoining: sum(forNew.filter((l) => l.frequency === "one_time")),
    /** A student who is already in the school, for the session. */
    existingStudent: sum(forExisting),
    /** The refundable part of what a new student pays (caution money). */
    refundable: sum(forNew.filter((l) => l.refundable)),
    /** Everything the family may choose to add (a uniform, a hostel bed), over the session. */
    optional: sum(lines.filter((l) => l.optional)),
  };
}

/** Plain words about a class's fee chart that a school should read twice (the law's limit on a development fee). */
function warningsOf(lines: LineDto[]): string[] {
  const warnings: string[] = [];
  for (const audience of ["new", "existing"] as const) {
    const rows = lines.filter((l) => !l.optional && l.appliesTo !== (audience === "new" ? "existing" : "new"));
    const tuition = rows.filter((l) => l.kind === "tuition").reduce((t, l) => t + l.yearly, 0);
    const development = rows.filter((l) => l.kind === "development").reduce((t, l) => t + l.yearly, 0);
    if (tuition > 0 && development > (tuition * DEVELOPMENT_FEE_CAP_PERCENT) / 100 + 0.005) {
      warnings.push(`The development fee is ${Math.round((development / tuition) * 100)}% of the tuition fee. The Supreme Court allows up to ${DEVELOPMENT_FEE_CAP_PERCENT}% (some states set a lower limit).`);
      break;
    }
  }
  return warnings;
}

/** A class's fee chart for a session: the lines, what they come to, and what to look at twice. */
export class FeeStructureService {
  /** The session a read is about: the one asked for (any of the school's), else the one being looked at, else the running one. */
  private static async readYear(school: Types.ObjectId, yearId?: string): Promise<YearInfo | null> {
    if (yearId) {
      const year = await AcademicYear.findOne({ _id: yearId, tenantId: school }).select("name startDate status").lean();
      if (!year) throw ApiError.notFound("That academic year is not in your school.", "YEAR_NOT_FOUND");
      return { id: year._id, name: year.name, startDate: year.startDate, status: year.status };
    }
    const year = await AcademicYearService.shownYear(school);
    return year ? { id: year._id, name: year.name, startDate: year.startDate, status: year.status } : null;
  }

  /** The session a change goes to: the one asked for (the running one or the upcoming one), else the running one. A year that is over is never changed. */
  private static async writeYear(school: Types.ObjectId, yearId?: string): Promise<YearInfo> {
    if (viewedYear()) throw ApiError.conflict("A year that is over can only be looked at.", "YEAR_READ_ONLY");
    const year = yearId
      ? await AcademicYear.findOne({ _id: yearId, tenantId: school }).select("name startDate status").lean()
      : await AcademicYear.findOne({ tenantId: school, status: "active" }).select("name startDate status").lean();
    if (!year) throw yearId ? ApiError.notFound("That academic year is not in your school.", "YEAR_NOT_FOUND") : NO_YEAR();
    if (year.status === "closed") throw ApiError.conflict(`${year.name} is over, so its fees can only be looked at.`, "YEAR_READ_ONLY");
    return { id: year._id, name: year.name, startDate: year.startDate, status: year.status };
  }

  private static lineDto(l: IFeeLine, head: IFeeHead | undefined): LineDto {
    return {
      id: l._id.toString(),
      headId: l.headId.toString(),
      headName: head?.name ?? "A fee that was removed",
      kind: head?.kind ?? "other",
      refundable: head?.refundable ?? false,
      amount: l.amount,
      frequency: l.frequency,
      dueMonths: l.dueMonths,
      appliesTo: l.appliesTo,
      optional: l.optional,
      notes: l.notes,
      yearly: yearlyCost(l.amount, l.frequency, l.dueMonths),
    };
  }

  static async get(tenantId: string, yearId?: string) {
    const school = asId(tenantId);
    const year = await FeeStructureService.readYear(school, yearId);
    const [classes, departments, heads, years] = await Promise.all([
      SchoolClass.find({ tenantId: school, ...NOT_INACTIVE }).sort({ order: 1, nameKey: 1 }).lean(),
      Department.find({ tenantId: school }).select("name").lean(),
      FeeHead.find({ tenantId: school }).sort({ nameKey: 1 }).lean(),
      AcademicYear.find({ tenantId: school, status: { $in: ["active", "pending"] } }).sort({ startDate: 1 }).select("name status").lean(),
    ]);
    const lines = year ? await FeeLine.find({ tenantId: school, academicYearId: year.id }).lean() : [];
    const headById = new Map(heads.map((h) => [h._id.toString(), h]));
    const departmentName = new Map(departments.map((d) => [d._id.toString(), d.name]));
    const byClass = new Map<string, LineDto[]>();
    for (const l of lines) {
      const list = byClass.get(l.classId.toString()) ?? [];
      list.push(FeeStructureService.lineDto(l, headById.get(l.headId.toString())));
      byClass.set(l.classId.toString(), list);
    }
    const order = (l: LineDto) => ["admission", "deposit", "tuition", "development", "annual", "exam", "facility", "supplies", "hostel", "transport", "other"].indexOf(l.kind);
    return {
      // `startMonth` (1 = January) is where the usual months of a repeating fee start from: the session's own first month, not always April.
      year: year ? { id: year.id.toString(), name: year.name, status: year.status, startMonth: year.startDate.getUTCMonth() + 1 } : null,
      years: years.map((y) => ({ id: y._id.toString(), name: y.name, status: y.status })),
      classes: classes.map((c) => {
        const list = (byClass.get(c._id.toString()) ?? []).sort((a, b) => order(a) - order(b) || a.headName.localeCompare(b.headName));
        return {
          id: c._id.toString(),
          name: c.name,
          department: c.departmentId ? (departmentName.get(c.departmentId.toString()) ?? null) : null,
          lines: list,
          totals: totalsOf(list),
          warnings: warningsOf(list),
        };
      }),
      heads: heads.filter((h) => h.isActive).map((h) => headDto(h)),
    };
  }

  /** Looks at the classes and the head a change names: all must be the school's, and the head must be on, and not transport. */
  private static async check(school: Types.ObjectId, classIds: string[], headId: string) {
    const [classes, head] = await Promise.all([SchoolClass.find({ tenantId: school, _id: { $in: classIds } }).select("name").lean(), FeeHead.findOne({ _id: headId, tenantId: school }).lean()]);
    if (classes.length !== classIds.length) throw CLASS_NOT_FOUND();
    if (!head) throw ApiError.badRequest("Choose a fee from your list", "FEE_HEAD_NOT_FOUND", [{ path: "headId", message: "Choose a fee from your list" }]);
    if (!head.isActive) throw ApiError.badRequest(`${head.name} is switched off. Switch it on in Fee heads first.`, "FEE_HEAD_OFF", [{ path: "headId", message: `${head.name} is switched off` }]);
    if (head.kind === "transport") {
      throw ApiError.badRequest("The transport fee comes from the stop a child boards at: set it in Transport > Routes.", "TRANSPORT_FEE_BY_STOP", [{ path: "headId", message: "Transport is set by the stop, in Transport > Routes" }]);
    }
    return { classes, head };
  }

  static async createLines(tenantId: string, input: CreateLinesInput) {
    const school = asId(tenantId);
    const year = await FeeStructureService.writeYear(school, input.yearId);
    const { classes, head } = await FeeStructureService.check(school, input.classIds, input.headId);
    const startMonth = year.startDate.getUTCMonth() + 1;
    const dueMonths = input.frequency === "one_time" ? [] : (input.dueMonths ?? defaultMonths(input.frequency, startMonth));
    const problem = monthsProblem(input.frequency, dueMonths);
    if (problem) throw validation([{ path: "dueMonths", message: problem }]);

    const taken = await FeeLine.find({ tenantId: school, academicYearId: year.id, headId: head._id, appliesTo: input.appliesTo, classId: { $in: input.classIds.map(asId) } }).select("classId").lean();
    if (taken.length > 0) {
      const names = classes.filter((c) => taken.some((t) => t.classId.equals(c._id))).map((c) => c.name);
      const who = input.appliesTo === "new" ? " for new students" : input.appliesTo === "existing" ? " for existing students" : "";
      throw ApiError.conflict(`${head.name}${who} is already on the fee chart of ${names.join(", ")}. Change it there, or choose other classes.`, "FEE_LINE_EXISTS", [
        { path: "classIds", message: `Already has ${head.name}: ${names.join(", ")}` },
      ]);
    }
    try {
      await FeeLine.insertMany(
        input.classIds.map((classId) => ({
          tenantId: school,
          academicYearId: year.id,
          classId: asId(classId),
          headId: head._id,
          amount: input.amount,
          frequency: input.frequency,
          dueMonths,
          appliesTo: input.appliesTo,
          optional: input.optional,
          notes: input.notes,
        }))
      );
    } catch (err) {
      if (isDuplicateKey(err)) throw ApiError.conflict(`${head.name} is already on one of these fee charts.`, "FEE_LINE_EXISTS", [{ path: "classIds", message: "Already on a fee chart" }]);
      throw err;
    }
    return { created: input.classIds.length };
  }

  static async updateLine(tenantId: string, id: string, input: UpdateLineInput) {
    const school = asId(tenantId);
    const line = await FeeLine.findOne({ _id: id, tenantId: school }).lean();
    if (!line) throw LINE_NOT_FOUND();
    const year = await AcademicYear.findOne({ _id: line.academicYearId, tenantId: school }).select("name startDate status").lean();
    if (viewedYear() || year?.status === "closed") throw ApiError.conflict(`${year?.name ?? "That year"} is over, so its fees can only be looked at.`, "YEAR_READ_ONLY");

    const frequency = input.frequency ?? line.frequency;
    const appliesTo = input.appliesTo ?? (input.frequency === "one_time" ? "new" : line.appliesTo);
    const startMonth = (year?.startDate ?? new Date()).getUTCMonth() + 1;
    // A new frequency without months gets the usual ones; the months kept for the same frequency stay.
    const dueMonths = frequency === "one_time" ? [] : (input.dueMonths ?? (input.frequency && input.frequency !== line.frequency ? defaultMonths(frequency, startMonth) : line.dueMonths));
    const details: Detail[] = [];
    const months = monthsProblem(frequency, dueMonths);
    if (months) details.push({ path: "dueMonths", message: months });
    const applies = appliesProblem(frequency, appliesTo);
    if (applies) details.push({ path: "appliesTo", message: applies });
    if (details.length > 0) throw validation(details);

    const set: Record<string, unknown> = { frequency, dueMonths, appliesTo };
    if (input.amount !== undefined) set.amount = input.amount;
    if (input.optional !== undefined) set.optional = input.optional;
    if (input.notes !== undefined) set.notes = input.notes;
    try {
      const saved = await FeeLine.findOneAndUpdate({ _id: id, tenantId: school }, { $set: set }, { new: true }).lean();
      const head = await FeeHead.findOne({ _id: saved!.headId, tenantId: school }).lean();
      return FeeStructureService.lineDto(saved!, head ?? undefined);
    } catch (err) {
      if (isDuplicateKey(err)) throw ApiError.conflict("This class already has this fee for that kind of student.", "FEE_LINE_EXISTS", [{ path: "appliesTo", message: "Already on this fee chart" }]);
      throw err;
    }
  }

  static async removeLine(tenantId: string, id: string) {
    const school = asId(tenantId);
    const line = await FeeLine.findOne({ _id: id, tenantId: school }).lean();
    if (!line) throw LINE_NOT_FOUND();
    const year = await AcademicYear.findOne({ _id: line.academicYearId, tenantId: school }).select("name status").lean();
    if (viewedYear() || year?.status === "closed") throw ApiError.conflict(`${year?.name ?? "That year"} is over, so its fees can only be looked at.`, "YEAR_READ_ONLY");
    await FeeLine.deleteOne({ _id: id, tenantId: school });
  }

  /** Gives other classes the same fee chart as one class (Class 6, 7 and 8 often pay the same). A fee a class already has is kept, or changed when `replace` says so. */
  static async copyClass(tenantId: string, input: CopyClassInput) {
    const school = asId(tenantId);
    const year = await FeeStructureService.writeYear(school, input.yearId);
    const to = input.toClassIds.filter((id) => id !== input.fromClassId);
    if (to.length === 0) throw validation([{ path: "toClassIds", message: "Choose a class other than the one you copy from" }]);
    const classes = await SchoolClass.find({ tenantId: school, _id: { $in: [input.fromClassId, ...to] } }).select("_id").lean();
    if (classes.length !== to.length + 1) throw CLASS_NOT_FOUND();
    const source = await FeeLine.find({ tenantId: school, academicYearId: year.id, classId: asId(input.fromClassId) }).lean();
    if (source.length === 0) throw ApiError.conflict("This class has no fees yet, so there is nothing to copy.", "NOTHING_TO_COPY");
    const existing = await FeeLine.find({ tenantId: school, academicYearId: year.id, classId: { $in: to.map(asId) } }).select("classId headId appliesTo").lean();
    const have = new Map(existing.map((l) => [lineKey(l.classId, l.headId, l.appliesTo), l._id]));

    const add: Record<string, unknown>[] = [];
    let replaced = 0;
    let skipped = 0;
    for (const classId of to) {
      for (const l of source) {
        const found = have.get(lineKey(classId, l.headId, l.appliesTo));
        const body = { amount: l.amount, frequency: l.frequency, dueMonths: l.dueMonths, optional: l.optional, notes: l.notes };
        if (!found) add.push({ ...body, tenantId: school, academicYearId: year.id, classId: asId(classId), headId: l.headId, appliesTo: l.appliesTo });
        else if (input.replace) {
          await FeeLine.updateOne({ _id: found, tenantId: school }, { $set: body });
          replaced += 1;
        } else skipped += 1;
      }
    }
    try {
      if (add.length > 0) await FeeLine.insertMany(add);
    } catch (err) {
      if (isDuplicateKey(err)) throw ApiError.conflict("Someone else changed these fee charts at the same moment. Try again.", "FEE_LINE_EXISTS");
      throw err;
    }
    return { added: add.length, replaced, skipped };
  }

  /** Starts a session's fee chart from the session before it, every amount raised by a percentage (0 = the same). Fees a class already has are kept. */
  static async copyYear(tenantId: string, input: CopyYearInput) {
    const school = asId(tenantId);
    const year = await FeeStructureService.writeYear(school, input.yearId);
    const previous = await AcademicYear.findOne({ tenantId: school, startDate: { $lt: year.startDate } }).sort({ startDate: -1 }).select("name").lean();
    if (!previous) throw ApiError.conflict("There is no earlier session to copy the fees from.", "NO_PREVIOUS_YEAR");
    const source = await FeeLine.find({ tenantId: school, academicYearId: previous._id }).lean();
    if (source.length === 0) throw ApiError.conflict(`${previous.name} has no fees to copy.`, "NOTHING_TO_COPY");
    const [existing, classes] = await Promise.all([
      FeeLine.find({ tenantId: school, academicYearId: year.id }).select("classId headId appliesTo").lean(),
      SchoolClass.find({ tenantId: school, ...NOT_INACTIVE }).select("_id").lean(),
    ]);
    const have = new Set(existing.map((l) => lineKey(l.classId, l.headId, l.appliesTo)));
    const classIds = new Set(classes.map((c) => c._id.toString()));
    const heads = new Set((await FeeHead.find({ tenantId: school }).select("_id").lean()).map((h) => h._id.toString()));
    const factor = 1 + input.raisePercent / 100;

    const add = source
      .filter((l) => classIds.has(l.classId.toString()) && heads.has(l.headId.toString()) && !have.has(lineKey(l.classId, l.headId, l.appliesTo)))
      .map((l) => ({
        tenantId: school,
        academicYearId: year.id,
        classId: l.classId,
        headId: l.headId,
        // A raised fee is a whole rupee: nobody charges 1,337.50.
        amount: input.raisePercent === 0 ? l.amount : Math.max(1, Math.round(l.amount * factor)),
        frequency: l.frequency,
        dueMonths: l.dueMonths,
        appliesTo: l.appliesTo,
        optional: l.optional,
        notes: l.notes,
      }));
    try {
      if (add.length > 0) await FeeLine.insertMany(add);
    } catch (err) {
      if (isDuplicateKey(err)) throw ApiError.conflict("Someone else changed this fee chart at the same moment. Try again.", "FEE_LINE_EXISTS");
      throw err;
    }
    return { added: add.length, skipped: source.length - add.length, from: previous.name, raisePercent: input.raisePercent };
  }
}
