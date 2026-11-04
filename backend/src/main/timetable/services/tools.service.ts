import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import type { AutofillBody, CopyBody } from "../schemas/timetable.schemas";
import { autofill } from "./autofill";
import { analyse, type CellIn, type Issue } from "./checker";
import { buildView, GridService, type GridView } from "./grid.service";
import { resolveUnit, type Unit } from "./unit";
import { busyFrom, loadWorld, unitDays, unitKey } from "./world";

export interface AutofillAnswer {
  /** The grid as it would be: the lessons kept and the ones added. Not saved. */
  cells: CellIn[];
  issues: Issue[];
  stats: GridView["stats"];
  /** Subjects that did not get all their periods, and how many are missing. */
  unplaced: { subjectId: string; subjectName: string; missing: number }[];
  /** How many of the lessons sent were left out because they clash (they are not kept). */
  dropped: number;
  seed: number;
}

export interface CopyAnswer {
  results: { sectionId: string; label: string; status: "copied" | "skipped"; copied: number; reason?: string; left: { day: number; period: number; reason: string }[] }[];
}

/** Everything a request needs of one unit: the school's year, the periods the class has and what it studies. */
async function context(tenantId: string, classId: string, sectionId: string | null) {
  const unit = await resolveUnit(tenantId, classId, sectionId);
  const world = await loadWorld(tenantId, unit.yearId);
  const key = unitKey(unit.classId, unit.sectionId);
  const days = unitDays(world, unit.classId);
  if (days.length === 0) throw ApiError.conflict(`${unit.label} has no timing yet. Set the school's timings first.`, "NO_TIMING");
  return { unit, world, key, days, allotments: world.allotments.get(key) ?? new Map() };
}

/** The cells without a clash: a lesson is kept only if nothing wrong is said about its period. */
function withoutClashes(cells: CellIn[], issues: Issue[]): { kept: CellIn[]; dropped: number } {
  const bad = new Set(issues.filter((i) => i.level === "error" && i.day && i.period).map((i) => `${i.day}:${i.period}`));
  const kept = cells.filter((c) => !bad.has(`${c.day}:${c.period}`));
  return { kept, dropped: cells.length - kept.length };
}

export class ToolsService {
  /**
   * The empty periods of the grid filled by the program (see autofill.ts). The lessons sent are kept (the ones with a clash are
   * dropped, and counted). Nothing is saved: the person looks at it, changes what they like and saves.
   */
  static async autofill(tenantId: string, input: AutofillBody): Promise<AutofillAnswer> {
    const { unit, world, key, days, allotments } = await context(tenantId, input.classId, input.sectionId);
    const busy = busyFrom(world, key);
    const sent: CellIn[] = input.cells.map((c) => ({ day: c.day, period: c.period, lessons: c.lessons.map((l) => ({ subjectId: l.subjectId, teacherId: l.teacherId, room: l.room })) }));
    const { kept, dropped } = withoutClashes(sent, analyse({ days, cells: sent, allotments, teachers: world.teachers, busy }).issues);

    const seed = input.seed ?? 1;
    const result = autofill({ days, cells: kept, allotments, teachers: world.teachers, busy, seed });
    const view = buildView(world, unit, result.cells);
    return { cells: result.cells, issues: view.issues, stats: view.stats, unplaced: result.unplaced, dropped, seed };
  }

  /**
   * One section's saved timetable given to other sections of the same class: the same periods, each with the subject the section
   * studies and ITS teacher (a lesson of a subject the section does not study, or one that would put a teacher in two places, is left
   * out and said). A section that already has lessons is left alone unless `replace` is set. Rooms are not copied.
   */
  static async copy(tenantId: string, userId: string, input: CopyBody): Promise<CopyAnswer> {
    const source = await resolveUnit(tenantId, input.classId, input.sectionId);
    if (!source.sectionId) throw ApiError.badRequest("A class without sections has no other section to copy to.", "NO_OTHER_SECTION");
    const world = await loadWorld(tenantId, source.yearId);
    const from = world.timetables.get(unitKey(source.classId, source.sectionId));
    if (!from || from.cells.length === 0) throw ApiError.conflict(`${source.label} has no lessons to copy yet.`, "TIMETABLE_EMPTY");

    // Every target must be a section of this class, of this year, and not the source itself.
    const targets: Unit[] = [];
    for (const sectionId of input.toSections) {
      if (sectionId === source.sectionId) continue;
      targets.push(await resolveUnit(tenantId, source.classId, sectionId));
    }

    const results: CopyAnswer["results"] = [];
    for (const target of targets) {
      const key = unitKey(target.classId, target.sectionId);
      const existing = world.timetables.get(key);
      if (existing && existing.cells.length > 0 && !input.replace) {
        results.push({ sectionId: target.sectionId!, label: target.label, status: "skipped", copied: 0, reason: "It already has lessons", left: [] });
        continue;
      }
      const allotments = world.allotments.get(key) ?? new Map();
      const days = unitDays(world, target.classId);
      const studied = from.cells.map((c) => ({ day: c.day, period: c.period, lessons: c.lessons.filter((l) => allotments.has(l.subjectId)).map((l) => ({ subjectId: l.subjectId, teacherId: null, room: null })) }));
      const left: CopyAnswer["results"][number]["left"] = [];
      for (const cell of from.cells) {
        const missing = cell.lessons.filter((l) => !allotments.has(l.subjectId));
        for (const lesson of missing) left.push({ day: cell.day, period: cell.period, reason: `${target.label} does not study ${world.subjects.get(lesson.subjectId)?.name ?? "this subject"}` });
      }
      const candidate = studied.filter((c) => c.lessons.length > 0);
      const analysis = analyse({ days, cells: candidate, allotments, teachers: world.teachers, busy: busyFrom(world, key) });
      const bad = new Map<string, string>();
      for (const issue of analysis.issues) if (issue.level === "error" && issue.day && issue.period) bad.set(`${issue.day}:${issue.period}`, issue.message);
      const cells = candidate.filter((c) => !bad.has(`${c.day}:${c.period}`));
      for (const c of candidate) if (bad.has(`${c.day}:${c.period}`)) left.push({ day: c.day, period: c.period, reason: bad.get(`${c.day}:${c.period}`)! });

      await GridService.upsert(
        { tenantId: new Types.ObjectId(tenantId), academicYearId: target.yearId, classId: new Types.ObjectId(target.classId), sectionId: new Types.ObjectId(target.sectionId!) },
        {
          $set: {
            cells: cells.map((c) => ({ day: c.day, period: c.period, lessons: c.lessons.map((l) => ({ subjectId: new Types.ObjectId(l.subjectId), teacherId: null, room: null })) })),
            updatedBy: new Types.ObjectId(userId),
          },
        }
      );
      // The next section is checked against this one as it now is.
      world.timetables.set(key, { id: existing?.id ?? "new", classId: target.classId, sectionId: target.sectionId, cells, status: existing?.status ?? "draft" });
      results.push({ sectionId: target.sectionId!, label: target.label, status: "copied", copied: cells.length, left });
    }
    return { results };
  }
}
