import { Types } from "mongoose";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Teacher } from "../../staff/models/Teacher";
import { Subject } from "../../subjects/models/Subject";
import { periodsToPlace } from "../../subjects/services/allotment.service";
import { BellSchedule } from "../models/BellSchedule";
import { minutesToClock } from "../time";
import { analyse } from "./checker";
import { periodsOf, type ScheduleRule } from "./scheduleRules";
import { activeUnits } from "./unit";
import { busyFrom, loadWorld, unitDays, unitKey, type World } from "./world";

export interface OverviewUnit {
  classId: string;
  sectionId: string | null;
  label: string;
  className: string;
  /** Whether a timing covers the class on at least one day. */
  hasTiming: boolean;
  subjects: number;
  /** The periods a week the subjects need, and the periods a week the class's timing has (null without a timing). */
  periodsToPlace: number;
  periodsAvailable: number | null;
  /** How many of its subjects have no teacher yet. */
  withoutTeacher: number;
  /** `none`: no lesson placed yet. */
  status: "none" | "draft" | "published";
  filled: number;
  total: number;
  errors: number;
  warnings: number;
}

/** What the school has done so far, over ALL its classes (the filter below does not change it). */
export interface OverviewSummary {
  units: number;
  /** Classes (or sections) with at least one subject, with a timing, and by where their timetable stands. */
  withSubjects: number;
  withTiming: number;
  none: number;
  draft: number;
  published: number;
}

export interface OverviewFilter {
  /** Part of a class or section name. */
  search?: string;
  status?: "all" | "none" | "draft" | "published";
}

export interface Overview {
  academicYear: { id: string; name: string } | null;
  counts: { subjects: number; teachers: number; timings: number };
  summary: OverviewSummary;
  timings: { id: string; name: string; days: number[]; scope: "all" | "only" | "except"; classNames: string[]; periods: number; start: string | null; end: string | null; lunch: { start: string; end: string } | null }[];
  units: OverviewUnit[];
}

/** How a timing reads on a card: the day's first and last time, and the lunch. */
function timingSummary(rule: ScheduleRule): { start: string | null; end: string | null; lunch: { start: string; end: string } | null; periods: number } {
  const first = rule.slots[0];
  const last = rule.slots[rule.slots.length - 1];
  const lunch = rule.slots.find((s) => s.kind === "lunch");
  return {
    start: first ? minutesToClock(first.start) : null,
    end: last ? minutesToClock(last.end) : null,
    lunch: lunch ? { start: minutesToClock(lunch.start), end: minutesToClock(lunch.end) } : null,
    periods: periodsOf(rule).length,
  };
}

export class OverviewService {
  /** The school's timetable set-up in one read: the timings, and every class or section with where it stands. */
  static async get(tenantId: string, filter: OverviewFilter = {}): Promise<Overview> {
    const school = new Types.ObjectId(tenantId);
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("name").lean();
    const [subjects, teachers, schedules, classNames] = await Promise.all([
      Subject.countDocuments({ tenantId: school, isActive: true }),
      Teacher.countDocuments({ tenantId: school, isActive: true }),
      BellSchedule.find({ tenantId: school }).sort({ _id: 1 }).lean(),
      SchoolClass.find({ tenantId: school }).select("name").lean(),
    ]);
    const names = new Map(classNames.map((c) => [c._id.toString(), c.name]));
    const timings = schedules.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      days: [...s.days].sort((a, b) => a - b),
      scope: s.scope,
      classNames: s.classIds.map((id) => names.get(id.toString()) ?? "A class"),
      ...timingSummary({ id: s._id.toString(), name: s.name, days: s.days, scope: s.scope, classIds: [], slots: s.slots.map((x) => ({ kind: x.kind, label: x.label, start: x.start, end: x.end })) }),
    }));
    const empty: OverviewSummary = { units: 0, withSubjects: 0, withTiming: 0, none: 0, draft: 0, published: 0 };
    if (!year) return { academicYear: null, counts: { subjects, teachers, timings: schedules.length }, summary: empty, timings, units: [] };

    const world = await loadWorld(tenantId, year._id);
    const all = (await activeUnits(tenantId)).map((unit) => OverviewService.unit(world, unit));
    const summary: OverviewSummary = {
      units: all.length,
      withSubjects: all.filter((u) => u.subjects > 0).length,
      withTiming: all.filter((u) => u.hasTiming).length,
      none: all.filter((u) => u.status === "none").length,
      draft: all.filter((u) => u.status === "draft").length,
      published: all.filter((u) => u.status === "published").length,
    };
    const search = filter.search?.trim().toLowerCase();
    const units = all.filter((u) => (!filter.status || filter.status === "all" || u.status === filter.status) && (!search || u.label.toLowerCase().includes(search)));
    return { academicYear: { id: year._id.toString(), name: year.name }, counts: { subjects, teachers, timings: schedules.length }, summary, timings, units };
  }

  /** The classes whose timetable is published: what a teacher may open. */
  static async published(tenantId: string): Promise<{ units: { classId: string; sectionId: string | null; label: string }[] }> {
    const year = await AcademicYear.findOne({ tenantId: new Types.ObjectId(tenantId), status: "active" }).select("_id").lean();
    if (!year) return { units: [] };
    const units = await activeUnits(tenantId);
    const world = await loadWorld(tenantId, year._id);
    return {
      units: units
        .filter((u) => world.timetables.get(unitKey(u.classId, u.sectionId))?.status === "published")
        .map((u) => ({ classId: u.classId, sectionId: u.sectionId, label: u.label })),
    };
  }

  private static unit(world: World, unit: Awaited<ReturnType<typeof activeUnits>>[number]): OverviewUnit {
    const key = unitKey(unit.classId, unit.sectionId);
    const allotments = world.allotments.get(key) ?? new Map();
    const days = unitDays(world, unit.classId);
    const stored = world.timetables.get(key);
    const available = days.length === 0 ? null : days.reduce((sum, d) => sum + d.periods.length, 0);
    const result = stored && stored.cells.length > 0 ? analyse({ days, cells: stored.cells, allotments, teachers: world.teachers, busy: busyFrom(world, key) }) : null;
    return {
      classId: unit.classId,
      sectionId: unit.sectionId,
      label: unit.label,
      className: unit.className,
      hasTiming: days.length > 0,
      subjects: allotments.size,
      periodsToPlace: periodsToPlace([...allotments.values()]),
      periodsAvailable: available,
      withoutTeacher: [...allotments.values()].filter((a) => !a.teacherId).length,
      status: !stored || stored.cells.length === 0 ? "none" : stored.status,
      filled: result ? result.total - result.free : 0,
      total: available ?? 0,
      errors: result ? result.issues.filter((i) => i.level === "error").length : 0,
      warnings: result ? result.issues.filter((i) => i.level === "warning").length : 0,
    };
  }
}
