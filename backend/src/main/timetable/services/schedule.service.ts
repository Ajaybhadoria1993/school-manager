import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { Department } from "../../academics/models/Department";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { isDuplicateKey } from "../../academics/services/shared";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { DAY_NAMES, MAX_SCHEDULE_NAME, MAX_SCHEDULES, type ScheduleScope, type SlotKind } from "../constants";
import { Section } from "../../academics/models/Section";
import { openYearIds } from "../../subjects/services/subject.service";
import { BellSchedule, type IBellSchedule } from "../models/BellSchedule";
import { Timetable } from "../models/Timetable";
import type { ClassDayInput, CreateScheduleInput, SchoolDayInput, UpdateScheduleInput } from "../schemas/timetable.schemas";
import { minutesToClock } from "../time";
import { FUTURE_CLASS, clashes, periodsOf, resolveSchedule, slotProblems, type Clash, type ScheduleRule, type Slot } from "./scheduleRules";

/** One row of a day as it leaves the API: times as "08:30". */
export interface SlotDto {
  kind: SlotKind;
  label: string;
  start: string;
  end: string;
}

export interface ScheduleDto {
  id: string;
  name: string;
  days: number[];
  scope: ScheduleScope;
  classIds: string[];
  /** A department's own timing; null for the whole school's or one made for named classes. */
  departmentId: string | null;
  /** The rows of the day; none for a department's holiday. */
  slots: SlotDto[];
  /** How many periods a day has. */
  periods: number;
}

/** The lessons of one timetable that would have no period. */
interface OrphanedUnit {
  timetableId: Types.ObjectId;
  classId: string;
  sectionId: string | null;
  cells: { day: number; period: number }[];
}

type ScheduleLike = Pick<IBellSchedule, "_id" | "name" | "days" | "scope" | "classIds" | "slots"> & { departmentId?: Types.ObjectId | null };

export const toSlotDto = (s: Slot): SlotDto => ({ kind: s.kind, label: s.label, start: minutesToClock(s.start), end: minutesToClock(s.end) });

/** The classes of each department now: a department's timing is followed by these. */
async function classesByDepartment(tenantId: string): Promise<Map<string, string[]>> {
  const classes = await SchoolClass.find({ tenantId: new Types.ObjectId(tenantId), departmentId: { $ne: null } }).select("departmentId").lean();
  const map = new Map<string, string[]>();
  for (const c of classes) {
    const key = c.departmentId!.toString();
    map.set(key, [...(map.get(key) ?? []), c._id.toString()]);
  }
  return map;
}

/** The classes a timing is for: the ones it names, or, for a department's timing, the department's classes now. */
const classIdsOf = (s: ScheduleLike, departments: Map<string, string[]>): string[] =>
  s.departmentId ? (departments.get(s.departmentId.toString()) ?? []) : s.classIds.map((id) => id.toString());

export const toScheduleDto = (s: ScheduleLike, departments: Map<string, string[]> = new Map()): ScheduleDto => ({
  id: s._id.toString(),
  name: s.name,
  days: [...s.days].sort((a, b) => a - b),
  scope: s.scope,
  classIds: classIdsOf(s, departments),
  departmentId: s.departmentId ? s.departmentId.toString() : null,
  slots: s.slots.map(toSlotDto),
  periods: s.slots.filter((slot) => slot.kind === "period").length,
});

/** A schedule as the pure rules read it. */
export const toRule = (s: ScheduleLike, departments: Map<string, string[]> = new Map()): ScheduleRule => ({
  id: s._id.toString(),
  name: s.name,
  days: [...s.days],
  scope: s.scope,
  classIds: classIdsOf(s, departments),
  departmentId: s.departmentId ? s.departmentId.toString() : null,
  slots: s.slots.map((slot) => ({ kind: slot.kind, label: slot.label ?? "", start: slot.start, end: slot.end })),
});

const NOT_FOUND = () => ApiError.notFound("Timing not found", "SCHEDULE_NOT_FOUND");
const DEPARTMENT_NOT_FOUND = () => ApiError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
const EXISTS = () =>
  ApiError.conflict("Your school already has a timing with this name.", "SCHEDULE_EXISTS", [{ path: "name", message: "Your school already has a timing with this name" }]);
const OF_DEPARTMENT = (name: string) =>
  ApiError.conflict(`"${name}" is a department's own timing. Change it on the School timings tab, with that department picked.`, "SCHEDULE_OF_DEPARTMENT");

/** Every timing of the school, as the rules read them (the oldest first, so the answer is the same every time). */
export async function loadRules(tenantId: string): Promise<ScheduleRule[]> {
  const [schedules, departments] = await Promise.all([BellSchedule.find({ tenantId: new Types.ObjectId(tenantId) }).sort({ _id: 1 }).lean(), classesByDepartment(tenantId)]);
  return schedules.map((s) => toRule(s, departments));
}

const dayList = (days: number[]) => days.map((d) => DAY_NAMES[d]).join(", ");

export class ScheduleService {
  static async list(tenantId: string): Promise<{ items: ScheduleDto[] }> {
    const [schedules, departments] = await Promise.all([BellSchedule.find({ tenantId: new Types.ObjectId(tenantId) }).sort({ _id: 1 }).lean(), classesByDepartment(tenantId)]);
    return { items: schedules.map((s) => toScheduleDto(s, departments)) };
  }

  static async create(tenantId: string, input: CreateScheduleInput): Promise<ScheduleDto> {
    if ((await BellSchedule.countDocuments({ tenantId })) >= MAX_SCHEDULES) {
      throw ApiError.conflict(`A school can have up to ${MAX_SCHEDULES} timings.`, "LIMIT_REACHED");
    }
    if (await BellSchedule.exists({ tenantId, nameKey: nameKeyOf(input.name) })) throw EXISTS();
    await ScheduleService.assertClasses(tenantId, input.classIds);
    ScheduleService.assertRows(input.slots);
    await ScheduleService.assertNoClash(tenantId, null, { name: input.name, days: input.days, scope: input.scope, classIds: input.classIds });
    await ScheduleService.assertNoOrphans(tenantId, [...(await loadRules(tenantId)), { id: "new", name: input.name, days: input.days, scope: input.scope, classIds: input.classIds, slots: input.slots }]);
    try {
      const schedule = await BellSchedule.create({
        tenantId,
        name: input.name,
        nameKey: nameKeyOf(input.name),
        days: input.days,
        scope: input.scope,
        classIds: input.classIds,
        slots: input.slots,
      });
      return toScheduleDto(schedule);
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS();
      throw err;
    }
  }

  static async update(tenantId: string, id: string, input: UpdateScheduleInput): Promise<ScheduleDto> {
    const current = await BellSchedule.findOne({ _id: id, tenantId }).lean();
    if (!current) throw NOT_FOUND();
    if (current.departmentId) throw OF_DEPARTMENT(current.name);

    if (input.name !== undefined && (await BellSchedule.exists({ tenantId, nameKey: nameKeyOf(input.name), _id: { $ne: new Types.ObjectId(id) } }))) throw EXISTS();
    const scope = input.scope ?? current.scope;
    let classIds = input.classIds ?? current.classIds.map((c) => c.toString());
    const next: ScheduleRule = {
      id,
      name: input.name ?? current.name,
      days: input.days ?? current.days,
      scope: input.scope === "except" && classIds.length === 0 ? "all" : scope,
      classIds,
      slots: input.slots ?? toRule(current).slots,
    };
    if (next.scope === "all") classIds = next.classIds = [];

    await ScheduleService.assertClasses(tenantId, classIds);
    if (input.slots) ScheduleService.assertRows(input.slots);
    await ScheduleService.assertNoClash(tenantId, id, next);
    await ScheduleService.assertNoOrphans(tenantId, [...(await loadRules(tenantId)).filter((r) => r.id !== id), next]);

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) Object.assign(changes, { name: input.name, nameKey: nameKeyOf(input.name) });
    if (input.days !== undefined) changes.days = input.days;
    if (input.scope !== undefined || input.classIds !== undefined) Object.assign(changes, { scope: next.scope, classIds });
    if (input.slots !== undefined) changes.slots = input.slots;
    try {
      const schedule = await BellSchedule.findOneAndUpdate({ _id: id, tenantId }, { $set: changes }, { new: true });
      if (!schedule) throw NOT_FOUND();
      return toScheduleDto(schedule);
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS();
      throw err;
    }
  }

  static async remove(tenantId: string, id: string): Promise<void> {
    const current = await BellSchedule.findOne({ _id: id, tenantId }).select("name departmentId").lean();
    if (!current) throw NOT_FOUND();
    if (current.departmentId) throw OF_DEPARTMENT(current.name);
    await ScheduleService.assertNoOrphans(tenantId, (await loadRules(tenantId)).filter((r) => r.id !== id));
    const deleted = await BellSchedule.findOneAndDelete({ _id: id, tenantId });
    if (!deleted) throw NOT_FOUND();
  }

  /**
   * The lessons that would have no period under the timings `proposed` (a period taken out of the day, a day taken off, a class moved to
   * a timing with fewer periods): by timetable (a section, or a class that has none, in an open year), with the periods. `classId`
   * looks at one class only.
   */
  private static async findOrphans(tenantId: string, proposed: ScheduleRule[], classId?: string): Promise<OrphanedUnit[]> {
    const years = await openYearIds(tenantId);
    if (years.length === 0) return [];
    const timetables = await Timetable.find({
      tenantId: new Types.ObjectId(tenantId),
      academicYearId: { $in: years },
      ...(classId ? { classId: new Types.ObjectId(classId) } : {}),
      "cells.0": { $exists: true },
    })
      .sort({ _id: 1 })
      .select("classId sectionId cells")
      .lean();
    const found: OrphanedUnit[] = [];
    for (const t of timetables) {
      const id = t.classId.toString();
      const cells = t.cells
        .filter((cell) => {
          const schedule = resolveSchedule(proposed, id, cell.day);
          return cell.period > (schedule ? periodsOf(schedule).length : 0);
        })
        .map((cell) => ({ day: cell.day, period: cell.period }));
      if (cells.length > 0) found.push({ timetableId: t._id, classId: id, sectionId: t.sectionId ? t.sectionId.toString() : null, cells });
    }
    return found;
  }

  /**
   * The timings as they would be must still give every lesson already in a timetable (this year's and the next one's) a period: a
   * period taken out of the day, a day taken off, a class moved to a timing with fewer periods would leave lessons in the air.
   */
  private static async assertNoOrphans(tenantId: string, proposed: ScheduleRule[]): Promise<void> {
    const found = await ScheduleService.findOrphans(tenantId, proposed);
    if (found.length === 0) return;
    throw await ScheduleService.orphanError(tenantId, found);
  }

  private static async orphanError(tenantId: string, found: OrphanedUnit[]): Promise<ApiError> {
    const school = new Types.ObjectId(tenantId);
    const periods = found.reduce((n, u) => n + u.cells.length, 0);
    const units = new Set(found.map((u) => `${u.classId}:${u.sectionId ?? "-"}`));
    const example = { ...found[0], ...found[0].cells[0] };
    const [klass, section] = await Promise.all([
      SchoolClass.findOne({ _id: example.classId, tenantId: school }).select("name").lean(),
      example.sectionId ? Section.findOne({ _id: example.sectionId, tenantId: school }).select("name").lean() : Promise.resolve(null),
    ]);
    const label = [klass?.name ?? "A class", section?.name].filter(Boolean).join(" - ");
    return ApiError.conflict(
      `This change would leave ${periods} period${periods === 1 ? "" : "s"} with lessons in ${units.size} class${units.size === 1 ? "" : "es"} without a place in the day (for example ${label}, ${DAY_NAMES[example.day]} period ${example.period}). Take those lessons out of the timetable first.`,
      "SCHEDULE_IN_USE"
    );
  }

  /** "Class 2 has 3 lessons in periods that would no longer be there (Class 2 - A: 2, Class 2 - B: 1).": what a class's own days ask before they go on. */
  private static async lessonsError(tenantId: string, className: string, units: OrphanedUnit[]): Promise<ApiError> {
    const sectionIds = units.flatMap((u) => (u.sectionId ? [new Types.ObjectId(u.sectionId)] : []));
    const sections = sectionIds.length > 0 ? await Section.find({ tenantId: new Types.ObjectId(tenantId), _id: { $in: sectionIds } }).select("name").lean() : [];
    const names = new Map(sections.map((x) => [x._id.toString(), x.name]));
    // The same section can have a timetable in this year and in the next one: counted together.
    const per = new Map<string, number>();
    for (const u of units) {
      const label = u.sectionId ? `${className} - ${names.get(u.sectionId) ?? "?"}` : className;
      per.set(label, (per.get(label) ?? 0) + u.cells.length);
    }
    const total = [...per.values()].reduce((n, c) => n + c, 0);
    const breakdown = [...per]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([label, n]) => `${label}: ${n}`)
      .join(", ");
    const split = units.some((u) => u.sectionId);
    return ApiError.conflict(
      `${className} has ${total} lesson${total === 1 ? "" : "s"} in periods that would no longer be there${split ? ` (${breakdown})` : ""}.`,
      "LESSONS_IN_REMOVED_PERIODS",
      [{ path: "lessons", message: breakdown, lessons: total }]
    );
  }

  /**
   * A week in one save, for the whole school or for one department (`departmentId`): the rows of each day. Days with the same rows become
   * one timing; the biggest keeps the usual name (the school's usual timing's, or the department's name), the others are named after
   * their days. For the whole school a day not sent has no school. A department's week is its own, every day: a day sent with no rows is
   * its holiday (its classes have no school even when the school does), a day not sent follows the school. The timings being replaced go
   * together, after the whole new week was checked: the rows, no class following two timings on a day, and no lesson of a timetable left
   * without its period. Every other timing is left as it is.
   */
  static async replaceSchoolDay(tenantId: string, input: SchoolDayInput): Promise<{ items: ScheduleDto[] }> {
    const school = new Types.ObjectId(tenantId);
    const department = input.departmentId
      ? await Department.findOne({ _id: new Types.ObjectId(input.departmentId), tenantId: school }).select("name").lean()
      : null;
    if (input.departmentId && !department) throw DEPARTMENT_NOT_FOUND();
    const departmentId = department ? department._id.toString() : null;

    // A day with no rows is a holiday, which only a department's week has; every other day must make sense.
    const problems = input.days.flatMap((d, i) =>
      departmentId && d.slots.length === 0 ? [] : slotProblems(d.slots).map((p) => ({ path: `days.${i}.${p.path}`, message: p.message }))
    );
    if (problems.length > 0) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", problems);
    if (!input.days.some((d) => d.slots.some((s) => s.kind === "period"))) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "days", message: "Keep at least one day with school" }]);
    }

    // The days whose rows are the same, as one group: the days with school first, the group with the most days first.
    const groups = new Map<string, { days: number[]; slots: Slot[] }>();
    for (const { day, slots } of input.days) {
      const key = JSON.stringify(slots.map((s) => [s.kind, s.label, s.start, s.end]));
      const group = groups.get(key) ?? { days: [], slots };
      group.days.push(day);
      groups.set(key, group);
    }
    const ordered = [...groups.values()]
      .map((g) => ({ ...g, days: [...g.days].sort((a, b) => a - b) }))
      .sort((a, b) => Number(a.slots.length === 0) - Number(b.slots.length === 0) || b.days.length - a.days.length || a.days[0] - b.days[0]);

    const rules = await loadRules(tenantId);
    const replaced = (r: ScheduleRule) => (departmentId ? r.departmentId === departmentId : r.scope === "all");
    const kept = rules.filter((r) => !replaced(r));
    if (kept.length + ordered.length > MAX_SCHEDULES) {
      throw ApiError.conflict(`A school can have up to ${MAX_SCHEDULES} timings.`, "LIMIT_REACHED");
    }

    const usualName = department ? department.name : (rules.filter(replaced).sort((a, b) => b.days.length - a.days.length || a.id.localeCompare(b.id))[0]?.name ?? "Regular");
    const daysName = (days: number[]) => (days.length === 1 ? DAY_NAMES[days[0]] : days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", "));
    const members = departmentId ? (await classesByDepartment(tenantId)).get(departmentId) ?? [] : [];
    const taken = new Set(kept.map((r) => nameKeyOf(r.name)));
    const named: ScheduleRule[] = ordered.map((g, i) => {
      const own = g.slots.length === 0 ? "holiday" : daysName(g.days);
      const base = (i === 0 && g.slots.length > 0 ? usualName : department ? `${department.name} - ${own}` : own).slice(0, MAX_SCHEDULE_NAME);
      let name = taken.has(nameKeyOf(base)) ? `${base} (${department ? "own" : "all classes"})`.slice(0, MAX_SCHEDULE_NAME) : base;
      for (let n = 2; taken.has(nameKeyOf(name)); n += 1) name = `${base.slice(0, MAX_SCHEDULE_NAME - 3)} ${n}`;
      taken.add(nameKeyOf(name));
      return departmentId
        ? { id: `new-${i}`, name, days: g.days, scope: "only", classIds: members, departmentId, slots: g.slots }
        : { id: `new-${i}`, name, days: g.days, scope: "all", classIds: [], departmentId: null, slots: g.slots };
    });

    const proposed = [...kept, ...named];
    await ScheduleService.assertNoClashes(tenantId, proposed, named);
    await ScheduleService.assertNoOrphans(tenantId, proposed);

    await BellSchedule.deleteMany(departmentId ? { tenantId: school, departmentId: new Types.ObjectId(departmentId) } : { tenantId: school, scope: "all" });
    await BellSchedule.create(
      named.map((r) => ({
        tenantId,
        name: r.name,
        nameKey: nameKeyOf(r.name),
        days: r.days,
        scope: r.scope,
        // A department's timing names no class: it is followed by whichever classes are in the department when it is read.
        classIds: [],
        departmentId: r.departmentId ? new Types.ObjectId(r.departmentId) : null,
        slots: r.slots,
      }))
    );
    return ScheduleService.list(tenantId);
  }

  /**
   * A class's own days in one save (`ClassDayInput`): the rows of each day that is the class's own (more or fewer periods, or a holiday
   * sent with no rows); every other day follows the department's or the school's timing. They are saved as timings made for the class
   * (the days with the same rows as one), named after it, and replace what the class had of its own before; no days sets it back to
   * following the school. A class's own day beats its department's. A lesson in a period the class will no longer have is refused with
   * LESSONS_IN_REMOVED_PERIODS unless `removeLessons` agrees to take it out (of every section of the class). Every other timing is left as it is.
   */
  static async replaceClassDay(tenantId: string, input: ClassDayInput): Promise<{ items: ScheduleDto[] }> {
    const school = new Types.ObjectId(tenantId);
    const klass = await SchoolClass.findOne({ _id: new Types.ObjectId(input.classId), tenantId: school }).select("name").lean();
    if (!klass) throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
    const classId = klass._id.toString();

    const problems = input.days.flatMap((d, i) => (d.slots.length === 0 ? [] : slotProblems(d.slots).map((p) => ({ path: `days.${i}.${p.path}`, message: p.message }))));
    if (problems.length > 0) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", problems);

    // The days whose rows are the same, as one group: the days with school first, the group with the most days first.
    const groups = new Map<string, { days: number[]; slots: Slot[] }>();
    for (const { day, slots } of input.days) {
      const key = JSON.stringify(slots.map((s) => [s.kind, s.label, s.start, s.end]));
      const group = groups.get(key) ?? { days: [], slots };
      group.days.push(day);
      groups.set(key, group);
    }
    const ordered = [...groups.values()]
      .map((g) => ({ ...g, days: [...g.days].sort((a, b) => a - b) }))
      .sort((a, b) => Number(a.slots.length === 0) - Number(b.slots.length === 0) || b.days.length - a.days.length || a.days[0] - b.days[0]);

    const rules = await loadRules(tenantId);
    const isOwn = (r: ScheduleRule) => r.scope === "only" && !r.departmentId && r.classIds.length === 1 && r.classIds[0] === classId;
    const kept = rules.filter((r) => !isOwn(r));
    if (kept.length + ordered.length > MAX_SCHEDULES) {
      throw ApiError.conflict(`A school can have up to ${MAX_SCHEDULES} timings.`, "LIMIT_REACHED");
    }

    const daysName = (days: number[]) => (days.length === 1 ? DAY_NAMES[days[0]] : days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", "));
    const taken = new Set(kept.map((r) => nameKeyOf(r.name)));
    const named: ScheduleRule[] = ordered.map((g, i) => {
      const base = (i === 0 && g.slots.length > 0 ? klass.name : `${klass.name} - ${g.slots.length === 0 ? "holiday" : daysName(g.days)}`).slice(0, MAX_SCHEDULE_NAME);
      let name = taken.has(nameKeyOf(base)) ? `${base} (own)`.slice(0, MAX_SCHEDULE_NAME) : base;
      for (let n = 2; taken.has(nameKeyOf(name)); n += 1) name = `${base.slice(0, MAX_SCHEDULE_NAME - 3)} ${n}`;
      taken.add(nameKeyOf(name));
      return { id: `new-${i}`, name, days: g.days, scope: "only", classIds: [classId], departmentId: null, slots: g.slots };
    });

    const proposed = [...kept, ...named];
    await ScheduleService.assertNoClashes(tenantId, proposed, named);
    // Lessons of other classes that were already without a period are not this save's to settle: they stop it, as they stop any timing change.
    const lost = await ScheduleService.findOrphans(tenantId, proposed);
    const others = lost.filter((u) => u.classId !== classId);
    if (others.length > 0) throw await ScheduleService.orphanError(tenantId, others);
    const mine = lost.filter((u) => u.classId === classId);
    if (mine.length > 0 && !input.removeLessons) throw await ScheduleService.lessonsError(tenantId, klass.name, mine);

    await BellSchedule.deleteMany({ tenantId: school, departmentId: null, scope: "only", classIds: [klass._id] });
    if (named.length > 0) {
      await BellSchedule.create(
        named.map((r) => ({ tenantId, name: r.name, nameKey: nameKeyOf(r.name), days: r.days, scope: r.scope, classIds: [klass._id], departmentId: null, slots: r.slots }))
      );
    }
    // The timings first: if taking the lessons out fails, asking again finds them still there and takes them out.
    for (const unit of mine) {
      await Timetable.updateOne({ _id: unit.timetableId, tenantId: school }, { $pull: { cells: { $or: unit.cells.map((c) => ({ day: c.day, period: c.period })) } } });
    }
    return ScheduleService.list(tenantId);
  }

  /** A department follows the school's timing again: its own timings go, unless a lesson of its classes would lose its period. */
  static async removeDepartmentDay(tenantId: string, departmentId: string): Promise<{ items: ScheduleDto[] }> {
    const school = new Types.ObjectId(tenantId);
    if (!(await Department.exists({ _id: new Types.ObjectId(departmentId), tenantId: school }))) throw DEPARTMENT_NOT_FOUND();
    await ScheduleService.assertNoOrphans(tenantId, (await loadRules(tenantId)).filter((r) => r.departmentId !== departmentId));
    await BellSchedule.deleteMany({ tenantId: school, departmentId: new Types.ObjectId(departmentId) });
    return ScheduleService.list(tenantId);
  }

  /** No class would follow two of the proposed timings on one day (one of `mine` is always one of the two). */
  private static async assertNoClashes(tenantId: string, proposed: ScheduleRule[], mine: ScheduleRule[]): Promise<void> {
    const classes = await SchoolClass.find({ tenantId }).select("name").lean();
    const names = new Set(mine.map((r) => r.name));
    const found = clashes(proposed, classes.map((c) => c._id.toString())).filter((c) => names.has(c.first) || names.has(c.second));
    if (found.length === 0) return;
    const ours = names.has(found[0].first) ? found[0].first : found[0].second;
    throw ScheduleService.clashError(found[0], ours, classes);
  }

  static async exists(tenantId: string, id: string): Promise<boolean> {
    return !!(await BellSchedule.exists({ _id: id, tenantId }));
  }

  /** Every class named is a class of this school. */
  private static async assertClasses(tenantId: string, classIds: string[]): Promise<void> {
    if (classIds.length === 0) return;
    const found = await SchoolClass.countDocuments({ tenantId, _id: { $in: classIds.map((c) => new Types.ObjectId(c)) } });
    if (found !== classIds.length) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "classIds", message: "Choose classes from your school's list" }]);
    }
  }

  /** The rows of the day make sense (see slotProblems), said by the box they are about. */
  private static assertRows(slots: Slot[]): void {
    const problems = slotProblems(slots);
    if (problems.length > 0) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", problems);
  }

  /** No class would follow two timings at once on a day. `id` is the timing being changed (null for a new one). */
  private static async assertNoClash(tenantId: string, id: string | null, candidate: Pick<ScheduleRule, "name" | "days" | "scope" | "classIds">): Promise<void> {
    const [others, classes] = await Promise.all([loadRules(tenantId), SchoolClass.find({ tenantId }).select("name").lean()]);
    const rules = [...others.filter((r) => r.id !== id), { ...candidate, id: id ?? "new", slots: [] }];
    const found = clashes(rules, classes.map((c) => c._id.toString())).filter((c) => c.first === candidate.name || c.second === candidate.name);
    if (found.length === 0) return;
    throw ScheduleService.clashError(found[0], candidate.name, classes);
  }

  /** "Class 5 already follows "Saturday" on Saturday...": the error for a class that two timings both claim on a day. */
  private static clashError(clash: Clash, mine: string, classes: { _id: Types.ObjectId; name: string }[]): ApiError {
    const other = clash.first === mine ? clash.second : clash.first;
    const who = clash.classId === FUTURE_CLASS ? "Every class" : (classes.find((c) => c._id.toString() === clash.classId)?.name ?? "A class");
    return ApiError.conflict(
      `${who} already follows "${other}" on ${DAY_NAMES[clash.day]}. A class follows one timing a day: give one of them other days or other classes.`,
      "SCHEDULE_CLASH",
      [{ path: "days", message: `${who} already follows "${other}" on ${dayList([clash.day])}` }]
    );
  }
}
