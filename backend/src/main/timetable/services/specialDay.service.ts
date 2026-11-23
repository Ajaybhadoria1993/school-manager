import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow } from "../../../utils/clock";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { Notify, shortDay } from "../../notifications/services/events";
import { SpecialDay, type ISpecialDay } from "../models/SpecialDay";
import type { SpecialDayInput } from "../schemas/timetable.schemas";
import { minutesToClock } from "../time";
import { slotProblems } from "./scheduleRules";

/**
 * Days with a timing of their own (2026-11-22): a PTM, a half day, the annual day, for the whole school or some classes, with the rows of those days
 * or no classes at all. One day or several in a row (2026-11-23, user: "3-4 din roj chale, jaise 3 se 6 tak": `date` to `endDate`, both included).
 * Set from today on only (days that are over keep what they had: attendance was read with them). Two that share a day never share a class. The
 * classes' parents and teachers (everyone, for the whole school) hear it when it is set, changed or taken off.
 */

export interface SpecialDayDto {
  id: string;
  /** The first day. */
  date: string;
  /** The last day (the first one for a single day). */
  endDate: string;
  title: string;
  /** Empty for the whole school. */
  classIds: string[];
  classNames: string[];
  /** The rows of the day ("08:30"), empty for no classes. */
  slots: { kind: string; label: string; start: string; end: string }[];
}

type Stored = Pick<ISpecialDay, "_id" | "date" | "endDate" | "title" | "classIds" | "slots">;

const school = (tenantId: string | Types.ObjectId) => new Types.ObjectId(tenantId);
/** The last day of a stored special day (one saved before days in a row existed has none: it is one day). */
const lastDay = (day: Pick<ISpecialDay, "date" | "endDate">) => day.endDate ?? day.date;
/** "on 28 Nov", "from 3 Dec to 6 Dec". */
export const whenWords = (from: string, to: string) => (to === from ? `on ${shortDay(from)}` : `from ${shortDay(from)} to ${shortDay(to)}`);

/** "09:00 to 12:00" for a day with rows, null for no classes. */
const hoursOf = (slots: readonly { start: number; end: number }[]) => (slots.length === 0 ? null : `${minutesToClock(slots[0].start)} to ${minutesToClock(slots[slots.length - 1].end)}`);

async function classNamesOf(tenantId: string): Promise<Map<string, string>> {
  const classes = await SchoolClass.find({ tenantId: school(tenantId) }).select("name").lean();
  return new Map(classes.map((c) => [c._id.toString(), c.name]));
}

function toDto(day: Stored, names: Map<string, string>): SpecialDayDto {
  const classIds = day.classIds.map((id) => id.toString());
  return {
    id: day._id.toString(),
    date: day.date,
    endDate: lastDay(day),
    title: day.title,
    classIds,
    classNames: classIds.map((id) => names.get(id) ?? "A class"),
    slots: day.slots.map((s) => ({ kind: s.kind, label: s.label, start: minutesToClock(s.start), end: minutesToClock(s.end) })),
  };
}

const over = () => ApiError.conflict("These days are over: their timing stays as it was.", "SPECIAL_DAY_OVER");
/** The special days that have a day between `from` and `to` (both included). */
const overlapping = (from: string, to: string) => ({ date: { $lte: to }, $or: [{ endDate: { $gte: from } }, { endDate: { $exists: false }, date: { $gte: from } }] });

export class SpecialDayService {
  static async exists(tenantId: string, id: string): Promise<boolean> {
    return (await SpecialDay.countDocuments({ _id: new Types.ObjectId(id), tenantId: school(tenantId) })) > 0;
  }

  /** The special days of the year being looked at, by their first day. */
  static async list(tenantId: string): Promise<{ items: SpecialDayDto[] }> {
    const yearId = await AcademicYearService.shownYearId(tenantId);
    if (!yearId) return { items: [] };
    const [days, names] = await Promise.all([SpecialDay.find({ tenantId: school(tenantId), academicYearId: yearId }).sort({ date: 1, createdAt: 1 }).lean(), classNamesOf(tenantId)]);
    return { items: days.map((d) => toDto(d, names)) };
  }

  /**
   * The special days with a day between `from` and `to` (for the days the attendance and the arrangement page read), any year, each with its last day
   * filled in. `on(day, date)` says whether one is in force on a date.
   */
  static async between(tenantId: string | Types.ObjectId, from: string, to: string): Promise<{ date: string; endDate: string; classIds: Types.ObjectId[]; slots: ISpecialDay["slots"]; title: string }[]> {
    const days = await SpecialDay.find({ tenantId: school(tenantId), ...overlapping(from, to) })
      .select("date endDate classIds slots title")
      .lean();
    return days.map((d) => ({ date: d.date, endDate: lastDay(d), classIds: d.classIds, slots: d.slots, title: d.title }));
  }

  static async create(tenantId: string, actorId: string, input: SpecialDayInput): Promise<SpecialDayDto> {
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    const endDate = input.endDate ?? input.date;
    if (input.date < indiaNow().date) throw notAhead();
    const names = await SpecialDayService.check(tenantId, input, endDate, null);
    const made = await SpecialDay.create({ tenantId, academicYearId: yearId, date: input.date, endDate, title: input.title, classIds: input.classIds, slots: input.slots });
    SpecialDayService.tell(tenantId, actorId, "added", made, names, yearId);
    return toDto(made, names);
  }

  static async update(tenantId: string, actorId: string, id: string, input: SpecialDayInput): Promise<SpecialDayDto> {
    const before = await SpecialDay.findOne({ _id: new Types.ObjectId(id), tenantId: school(tenantId) }).lean();
    if (!before) throw ApiError.notFound("Special day not found", "SPECIAL_DAY_NOT_FOUND");
    const today = indiaNow().date;
    if (lastDay(before) < today) throw over();
    // Days in a row that have begun keep their first day; anything else starts from today on.
    if (input.date < today && input.date !== before.date) throw notAhead();
    const endDate = input.endDate ?? input.date;
    if (endDate < today) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "endDate", message: "Choose today or a day to come" }]);
    const names = await SpecialDayService.check(tenantId, input, endDate, id);
    const after = await SpecialDay.findOneAndUpdate(
      { _id: before._id, tenantId: school(tenantId) },
      { $set: { date: input.date, endDate, title: input.title, classIds: input.classIds.map((c) => new Types.ObjectId(c)), slots: input.slots } },
      { new: true }
    ).lean();
    if (!after) throw ApiError.notFound("Special day not found", "SPECIAL_DAY_NOT_FOUND");
    SpecialDayService.tell(tenantId, actorId, "changed", after, names, before.academicYearId);
    return toDto(after, names);
  }

  static async remove(tenantId: string, actorId: string, id: string): Promise<void> {
    const day = await SpecialDay.findOne({ _id: new Types.ObjectId(id), tenantId: school(tenantId) }).lean();
    if (!day) throw ApiError.notFound("Special day not found", "SPECIAL_DAY_NOT_FOUND");
    if (lastDay(day) < indiaNow().date) throw over();
    await SpecialDay.deleteOne({ _id: day._id, tenantId: school(tenantId) });
    SpecialDayService.tell(tenantId, actorId, "removed", day, await classNamesOf(tenantId), day.academicYearId);
  }

  /**
   * Everything checked before anything is written: the school's own classes, rows the server would take for a timing, and no class with two special
   * days on one day. Answers the names of the school's classes.
   */
  private static async check(tenantId: string, input: SpecialDayInput, endDate: string, selfId: string | null): Promise<Map<string, string>> {
    const names = await classNamesOf(tenantId);
    if (input.classIds.some((id) => !names.has(id))) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "classIds", message: "Choose the school's own classes" }]);
    if (input.slots.length > 0) {
      const problems = slotProblems(input.slots).map((p) => ({ path: p.path, message: p.message }));
      if (problems.length > 0) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", problems);
    }
    const others = await SpecialDay.find({ tenantId: school(tenantId), ...overlapping(input.date, endDate), ...(selfId ? { _id: { $ne: new Types.ObjectId(selfId) } } : {}) })
      .select("title date endDate classIds")
      .lean();
    for (const other of others) {
      const theirs = other.classIds.map((c) => c.toString());
      const when = whenWords(other.date, lastDay(other));
      if (theirs.length === 0 || input.classIds.length === 0) throw ApiError.conflict(`There is already a special timing ${when}: ${other.title}.`, "SPECIAL_DAY_CLASH");
      const shared = input.classIds.find((c) => theirs.includes(c));
      if (shared) throw ApiError.conflict(`${names.get(shared) ?? "A class"} already has a special timing ${when}: ${other.title}.`, "SPECIAL_DAY_CLASH");
    }
    return names;
  }

  private static tell(tenantId: string, actorId: string, change: "added" | "changed" | "removed", day: Pick<ISpecialDay, "date" | "endDate" | "title" | "classIds" | "slots">, names: Map<string, string>, yearId: Types.ObjectId) {
    const classes = day.classIds.length === 0 ? null : day.classIds.map((c) => ({ id: c.toString(), name: names.get(c.toString()) ?? "A class" }));
    Notify.specialDay(tenantId, actorId, change, { title: day.title, when: whenWords(day.date, lastDay(day)), hours: hoursOf(day.slots), classes, yearId });
  }
}

const notAhead = () => ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "date", message: "Choose today or a day to come" }]);
