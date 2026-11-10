import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import type { UserRole } from "../../users/models/User";
import { isDuplicateKey } from "../../academics/services/shared";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Allotment } from "../../subjects/models/Allotment";
import { MAX_PERIODS_PER_WEEK } from "../../subjects/constants";
import { DAY_NAMES, type SlotKind } from "../constants";
import { Timetable } from "../models/Timetable";
import type { SaveGridInput } from "../schemas/timetable.schemas";
import { minutesToClock, overlaps } from "../time";
import { analyse, type AllotmentInfo, type CellIn, type Issue } from "./checker";
import { resolveSchedule } from "./scheduleRules";
import { resolveUnit, type Unit } from "./unit";
import { busyFrom, loadWorld, unitDays, unitKey, type World } from "./world";

export interface GridDay {
  day: number;
  name: string;
  /** The rows of the day as the class lives them: periods (numbered), the lunch, other breaks. */
  slots: { kind: SlotKind; label: string; start: string; end: string; period: number | null }[];
}

export interface GridView {
  unit: { classId: string; className: string; sectionId: string | null; sectionName: string | null; label: string; academicYear: { id: string; name: string } };
  /** False until the first save: the grid is empty and nothing is stored yet. */
  exists: boolean;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string | null;
  days: GridDay[];
  cells: CellIn[];
  /** What the class studies, with its teacher and choice. */
  allotments: { subjectId: string; subjectName: string; subjectCode: string | null; category: "academic" | "activity"; periodsPerWeek: number; blockSize: number; teacherId: string | null; group: string | null }[];
  /** The teachers a lesson may have: the school's, and any named here that has since left. */
  teachers: { id: string; name: string; isActive: boolean; offDays: number[]; maxPerDay: number | null; maxPerWeek: number | null; subjectIds: string[] }[];
  /** What other classes take, at the times of this class's periods: a teacher or a room that cannot be used there. */
  busy: { day: number; period: number; teacherId: string | null; room: string | null; where: string; subjectName: string }[];
  /** The periods each teacher already has in other classes, by day and in all (for their daily and weekly limits). */
  load: { teacherId: string; perDay: Record<string, number>; week: number }[];
  issues: Issue[];
  stats: { total: number; filled: number; free: number; placed: Record<string, number> };
  /** The unit's class teacher this year (in a Pre-Primary class, the mother teacher the screen puts on its periods), or nobody. */
  classTeacher: { id: string; name: string } | null;
}

const NO_TIMING = (label: string) => ApiError.conflict(`${label} has no timing yet. Set the school's timings first.`, "NO_TIMING");

/** Stored lessons as the checker reads them. */
const cellsOf = (world: World, key: string): CellIn[] => (world.timetables.get(key)?.cells ?? []).map((c) => ({ ...c, lessons: c.lessons.map((l) => ({ ...l })) }));

/** One grid as it is sent: the timing, the lessons, what is studied, and what can and cannot be done. `cells` default to the stored ones. */
export function buildView(world: World, unit: Unit, cells?: CellIn[]): GridView {
  const key = unitKey(unit.classId, unit.sectionId);
  const stored = world.timetables.get(key);
  const days = unitDays(world, unit.classId);
  const grid = cells ?? cellsOf(world, key);
  const allotments = world.allotments.get(key) ?? new Map();
  const busy = busyFrom(world, key);
  const result = analyse({ days, cells: grid, allotments, teachers: world.teachers, busy });

  const dayViews: GridDay[] = days.map(({ day }) => {
    const schedule = resolveSchedule(world.rules, unit.classId, day)!;
    let n = 0;
    return {
      day,
      name: DAY_NAMES[day],
      slots: schedule.slots.map((slot) => {
        const period = slot.kind === "period" ? (n += 1) : null;
        return {
          kind: slot.kind,
          label: slot.kind === "period" ? slot.label || `Period ${period}` : slot.label,
          start: minutesToClock(slot.start),
          end: minutesToClock(slot.end),
          period,
        };
      }),
    };
  });

  const named = new Set<string>([...allotments.values()].flatMap((a) => (a.teacherId ? [a.teacherId] : [])));
  for (const cell of grid) for (const lesson of cell.lessons) if (lesson.teacherId) named.add(lesson.teacherId);
  const teachers = [...world.teachers.values()]
    .filter((t) => t.isActive || named.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  const busyHere: GridView["busy"] = [];
  for (const { day, periods } of days) {
    for (const span of periods) {
      for (const b of busy) {
        if (b.day === day && overlaps(b, span) && (b.teacherId || b.room)) {
          busyHere.push({ day, period: span.period, teacherId: b.teacherId, room: b.room, where: b.where, subjectName: b.subjectName });
        }
      }
    }
  }

  const load = new Map<string, { perDay: Record<string, number>; week: number }>();
  for (const b of busy) {
    if (!b.teacherId) continue;
    const entry = load.get(b.teacherId) ?? { perDay: {}, week: 0 };
    entry.perDay[String(b.day)] = (entry.perDay[String(b.day)] ?? 0) + 1;
    entry.week += 1;
    load.set(b.teacherId, entry);
  }

  return {
    unit: { classId: unit.classId, className: unit.className, sectionId: unit.sectionId, sectionName: unit.sectionName, label: unit.label, academicYear: { id: unit.yearId.toString(), name: unit.yearName } },
    exists: !!stored,
    status: stored?.status ?? "draft",
    publishedAt: null,
    updatedAt: null,
    days: dayViews,
    cells: grid,
    allotments: [...allotments.values()].map((a) => ({
      subjectId: a.subjectId,
      subjectName: a.subjectName,
      subjectCode: world.subjects.get(a.subjectId)?.code ?? null,
      category: world.subjects.get(a.subjectId)?.category ?? "academic",
      periodsPerWeek: a.periodsPerWeek,
      blockSize: a.blockSize,
      teacherId: a.teacherId,
      group: a.group,
    })),
    teachers: teachers.map((t) => ({ id: t.id, name: t.name, isActive: t.isActive, offDays: t.offDays, maxPerDay: t.maxPerDay, maxPerWeek: t.maxPerWeek, subjectIds: t.subjectIds })),
    busy: busyHere,
    load: [...load].map(([teacherId, v]) => ({ teacherId, ...v })),
    issues: result.issues,
    stats: { total: result.total, filled: result.total - result.free, free: result.free, placed: Object.fromEntries(result.placed) },
    classTeacher: null,
  };
}

/** The rule violations that stop a timetable from being kept, said as the API says every refusal. */
export function clashError(errors: Issue[]): ApiError {
  const first = errors[0];
  const message = errors.length === 1 ? first.message : `${first.message} (and ${errors.length - 1} more)`;
  return ApiError.conflict(message, "TIMETABLE_CLASHES", errors.map((e) => ({ path: e.day && e.period ? `d${e.day}p${e.period}` : "cells", message: e.message, code: e.code })));
}

/** What is stored of a class's timetable that the view cannot say (when it was changed and published), and the unit's class teacher. */
async function stamps(tenantId: string, unit: Unit, world: World): Promise<{ publishedAt: string | null; updatedAt: string | null; classTeacher: GridView["classTeacher"] }> {
  const doc = await Timetable.findOne({ tenantId: new Types.ObjectId(tenantId), academicYearId: unit.yearId, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null })
    .select("publishedAt updatedAt")
    .lean();
  const head = await ClassTeacher.findOne({ tenantId: new Types.ObjectId(tenantId), academicYearId: unit.yearId, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null })
    .select("teacherId")
    .lean();
  const teacher = head ? world.teachers.get(head.teacherId.toString()) : undefined;
  return { publishedAt: doc?.publishedAt ? doc.publishedAt.toISOString() : null, updatedAt: doc ? doc.updatedAt.toISOString() : null, classTeacher: teacher ? { id: teacher.id, name: teacher.name } : null };
}

export class GridService {
  /** A class's timetable as it stands. A teacher sees only published ones. */
  static async get(tenantId: string, role: UserRole, classId: string, sectionId: string | null): Promise<GridView> {
    const unit = await resolveUnit(tenantId, classId, sectionId);
    const world = await loadWorld(tenantId, unit.yearId);
    const stored = world.timetables.get(unitKey(unit.classId, unit.sectionId));
    if (role === "teacher" && stored?.status !== "published") {
      throw ApiError.notFound("This timetable has not been published yet.", "TIMETABLE_NOT_PUBLISHED");
    }
    return { ...buildView(world, unit), ...(await stamps(tenantId, unit, world)) };
  }

  /**
   * Keeps a class's timetable as the person made it: every lesson in a period the class has, with a teacher who is free and comes that
   * day. Any subject of the school that is in use may be put in: one the class did not study yet joins its list (with the periods it was
   * given here, no teacher, single periods), once the whole grid has passed the checks. One request, the whole grid; what is not sent is
   * not kept (an empty grid clears it). A draft stays a draft and a published timetable stays published (a change is live at once).
   */
  static async save(tenantId: string, userId: string, input: SaveGridInput): Promise<GridView> {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId);
    const world = await loadWorld(tenantId, unit.yearId);
    const key = unitKey(unit.classId, unit.sectionId);
    const days = unitDays(world, unit.classId);
    if (days.length === 0) throw NO_TIMING(unit.label);
    const allotments = new Map(world.allotments.get(key) ?? new Map<string, AllotmentInfo>());

    // The subjects put in that the class does not study yet, with how many periods each was given.
    const added = new Map<string, number>();
    for (const c of input.cells) for (const l of c.lessons) if (!allotments.has(l.subjectId)) added.set(l.subjectId, (added.get(l.subjectId) ?? 0) + 1);
    for (const [subjectId, count] of added) {
      const subject = world.subjects.get(subjectId);
      if (!subject) throw ApiError.conflict("A subject in this timetable is not one of your school's subjects.", "SUBJECT_NOT_AVAILABLE");
      if (!subject.isActive) throw ApiError.conflict(`${subject.name} is archived. Bring it back on the Subjects page first.`, "SUBJECT_NOT_AVAILABLE");
      allotments.set(subjectId, { subjectId, subjectName: subject.name, periodsPerWeek: Math.min(count, MAX_PERIODS_PER_WEEK), blockSize: 1, teacherId: null, group: null });
    }

    // A lesson names a teacher only when it is not the one the class's subject list names, so a later change of that teacher follows.
    const cells: CellIn[] = [...input.cells]
      .sort((a, b) => a.day - b.day || a.period - b.period)
      .map((c) => ({
        day: c.day,
        period: c.period,
        lessons: c.lessons.map((l) => ({ subjectId: l.subjectId, teacherId: l.teacherId && l.teacherId === allotments.get(l.subjectId)?.teacherId ? null : l.teacherId, room: l.room })),
      }));

    const result = analyse({ days, cells, allotments, teachers: world.teachers, busy: busyFrom(world, key) });
    const errors = result.issues.filter((i) => i.level === "error");
    if (errors.length > 0) throw clashError(errors);

    const filter = { tenantId: new Types.ObjectId(tenantId), academicYearId: unit.yearId, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null };
    if (added.size > 0) {
      const after = world.allotments.get(key)?.size ?? 0;
      const rows = [...added.keys()].map((subjectId, i) => ({
        ...filter,
        subjectId: new Types.ObjectId(subjectId),
        periodsPerWeek: allotments.get(subjectId)!.periodsPerWeek,
        blockSize: 1,
        teacherId: null,
        group: null,
        groupKey: null,
        position: after + i,
      }));
      try {
        await Allotment.insertMany(rows, { ordered: false });
      } catch (err) {
        // Added at the same moment by another save: the class studies it, which is what was wanted.
        if (!isDuplicateKey(err)) throw err;
      }
    }
    const document = cells.map((c) => ({
      day: c.day,
      period: c.period,
      lessons: c.lessons.map((l) => ({ subjectId: new Types.ObjectId(l.subjectId), teacherId: l.teacherId ? new Types.ObjectId(l.teacherId) : null, room: l.room })),
    }));
    await GridService.upsert(filter, { $set: { cells: document, updatedBy: new Types.ObjectId(userId) } });
    return GridService.reload(tenantId, unit);
  }

  /**
   * Publishes a class's timetable: it is then what teachers see. Refused for an empty timetable and for one that has clashes (a timing
   * changed under it, a teacher given two places since it was saved).
   */
  static async publish(tenantId: string, userId: string, classId: string, sectionId: string | null): Promise<GridView> {
    const unit = await resolveUnit(tenantId, classId, sectionId);
    const world = await loadWorld(tenantId, unit.yearId);
    const key = unitKey(unit.classId, unit.sectionId);
    const stored = world.timetables.get(key);
    if (!stored || stored.cells.length === 0) {
      throw ApiError.conflict(`${unit.label} has no lessons yet. Put some lessons in before publishing.`, "TIMETABLE_EMPTY");
    }
    const result = analyse({ days: unitDays(world, unit.classId), cells: cellsOf(world, key), allotments: world.allotments.get(key) ?? new Map(), teachers: world.teachers, busy: busyFrom(world, key) });
    const errors = result.issues.filter((i) => i.level === "error");
    if (errors.length > 0) throw clashError(errors);

    await Timetable.updateOne(
      { tenantId: new Types.ObjectId(tenantId), _id: new Types.ObjectId(stored.id) },
      { $set: { status: "published", publishedAt: new Date(), publishedBy: new Types.ObjectId(userId) } }
    );
    return GridService.reload(tenantId, unit);
  }

  /** Takes a published timetable back to a draft: teachers no longer see it. */
  static async unpublish(tenantId: string, classId: string, sectionId: string | null): Promise<GridView> {
    const unit = await resolveUnit(tenantId, classId, sectionId);
    await Timetable.updateOne(
      { tenantId: new Types.ObjectId(tenantId), academicYearId: unit.yearId, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null },
      { $set: { status: "draft", publishedAt: null, publishedBy: null } }
    );
    return GridService.reload(tenantId, unit);
  }

  /** The view as it is now, read again from the database. */
  static async reload(tenantId: string, unit: Unit): Promise<GridView> {
    const world = await loadWorld(tenantId, unit.yearId);
    return { ...buildView(world, unit), ...(await stamps(tenantId, unit, world)) };
  }

  /** Creates the timetable of a unit on its first save (a race between two first saves is settled by the unique index). */
  static async upsert(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await Timetable.updateOne(filter, { ...update, $setOnInsert: { status: "draft" } }, { upsert: true });
        return;
      } catch (err) {
        if (attempt === 1 || !(typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === 11000)) throw err;
      }
    }
  }
}
