import { ApiError } from "../../../utils/ApiError";
import { openYearIds } from "../../subjects/services/subject.service";
import { analyse, type CellIn } from "./checker";
import type { ScheduleRule } from "./scheduleRules";
import { busyFrom, labelOf, loadWorld, unitDays, type World } from "./world";

/**
 * A change of the timings must not put a teacher (or a room) in two places (2026-11-18). A timetable is checked when it is SAVED, against the
 * hours the classes had then; the hours are a separate thing that can be changed later (a class starts earlier, the usual day starts later), and
 * two lessons that did not meet can then meet. This is asked before a timing is written: every timetable of the open years (this year's and the
 * next one's) is checked under the timings as they would be, and the change is refused for the FIRST clash it brings that was not there before.
 * A clash that was already there is not blamed on the change (that is how a timing change is allowed at all in a school with an old clash); moving
 * everything together (the winter shift) keeps every gap, so it brings none.
 */

const BUSY = new Set(["TEACHER_BUSY", "ROOM_BUSY"]);

const clashesOf = (world: World, key: string): { code: string; message: string; day?: number; period?: number }[] => {
  const t = world.timetables.get(key);
  if (!t || t.cells.length === 0) return [];
  return analyse({
    days: unitDays(world, t.classId),
    cells: t.cells as CellIn[],
    allotments: world.allotments.get(key) ?? new Map(),
    teachers: world.teachers,
    busy: busyFrom(world, key),
  }).issues.filter((i) => i.level === "error" && BUSY.has(i.code));
};

const signature = (e: { code: string; day?: number; period?: number }) => `${e.code}:${e.day}:${e.period}`;

export async function assertNoNewClashes(tenantId: string, proposed: ScheduleRule[]): Promise<void> {
  for (const yearId of await openYearIds(tenantId)) {
    const now = await loadWorld(tenantId, yearId);
    if ([...now.timetables.values()].every((t) => t.cells.length === 0)) continue;
    const then: World = { ...now, rules: proposed };
    for (const [key, t] of now.timetables) {
      if (t.cells.length === 0) continue;
      const known = new Set(clashesOf(now, key).map(signature));
      const added = clashesOf(then, key).find((e) => !known.has(signature(e)));
      if (!added) continue;
      const label = labelOf(now, t.classId, t.sectionId);
      throw ApiError.conflict(`This change would put a teacher in two places at the same time. ${label}: ${added.message}. Change that timetable first, or keep these hours.`, "TIMETABLE_CLASHES", [
        { path: "timings", message: `${label}: ${added.message}`, code: added.code },
      ]);
    }
  }
}
