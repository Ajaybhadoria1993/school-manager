import { DAYS, MAX_BREAK_MINUTES, MAX_PERIODS, MAX_PERIOD_MINUTES, MAX_SLOTS, MIN_PERIOD_MINUTES, type ScheduleScope, type SlotKind } from "../constants";
import { minutesToClock } from "../time";

/**
 * The rules of a school's timings, with no database in them: which timing a class follows on a day, whether two timings can both be
 * true, and whether the rows of one day make sense. The service saves, these decide. (The browser has the same rules in its own
 * helper to say what is wrong before anything is sent; this is the one that counts.)
 */

/** One row of a day: a period, the lunch, or another break. Times are minutes after midnight. */
export interface Slot {
  kind: SlotKind;
  /** What the row is called ("Assembly", "Library"); empty for a plain "Period 3". */
  label: string;
  start: number;
  end: number;
}

/** One timing of the school: the days it runs on, the classes it is for, and the rows of its day. */
export interface ScheduleRule {
  id: string;
  name: string;
  /** 1 = Monday ... 7 = Sunday. */
  days: number[];
  scope: ScheduleScope;
  classIds: string[];
  slots: Slot[];
  /** A department's own timing (its `classIds` are the department's classes when the rules were read). */
  departmentId?: string | null;
}

/** Stands for a class the school does not have yet, so two timings for "all classes" clash even in a school with no class. */
export const FUTURE_CLASS = "*";

/** Whether a timing is for this class. */
export function appliesTo(schedule: Pick<ScheduleRule, "scope" | "classIds">, classId: string): boolean {
  if (schedule.scope === "only") return schedule.classIds.includes(classId);
  if (schedule.scope === "except") return !schedule.classIds.includes(classId);
  return true;
}

/**
 * The more particular timing wins: one made for named classes (a class's own day) beats a department's, and a department's beats the
 * school's (a timing for all classes, or for all but some). Two at the same level on one day are a clash.
 */
const specificity = (schedule: Pick<ScheduleRule, "scope" | "departmentId">) => (schedule.scope !== "only" ? 1 : schedule.departmentId ? 2 : 3);

/**
 * The timing a class follows on a day: the one that covers the day and the class, a timing made for the class first. Null when none does,
 * or when the one that does has no periods (a department's holiday, which beats the school's timing): the class has no school that day.
 */
export function resolveSchedule<T extends ScheduleRule>(schedules: readonly T[], classId: string, day: number): T | null {
  const candidates = schedules.filter((s) => s.days.includes(day) && appliesTo(s, classId));
  if (candidates.length === 0) return null;
  const top = Math.max(...candidates.map(specificity));
  // Two at the top would be a clash (refused when saved); the first by id keeps the answer the same every time.
  const winner = candidates.filter((s) => specificity(s) === top).sort((a, b) => a.id.localeCompare(b.id))[0];
  return winner.slots.some((s) => s.kind === "period") ? winner : null;
}

export interface PeriodSpan {
  /** 1, 2, 3 ... in the order of the day. */
  period: number;
  label: string;
  start: number;
  end: number;
}

/** The periods of a day (not the breaks), numbered from 1 in the order of the day. */
export function periodsOf(schedule: Pick<ScheduleRule, "slots">): PeriodSpan[] {
  let n = 0;
  const out: PeriodSpan[] = [];
  for (const slot of schedule.slots) {
    if (slot.kind !== "period") continue;
    n += 1;
    out.push({ period: n, label: slot.label || `Period ${n}`, start: slot.start, end: slot.end });
  }
  return out;
}

/** How many periods a class has on each day it has school, in the order of the week. */
export function weekPeriods(schedules: readonly ScheduleRule[], classId: string): { day: number; periods: number }[] {
  const week: { day: number; periods: number }[] = [];
  for (const day of DAYS) {
    const schedule = resolveSchedule(schedules, classId, day);
    if (schedule) week.push({ day, periods: periodsOf(schedule).length });
  }
  return week;
}

export interface Clash {
  classId: string;
  day: number;
  first: string;
  second: string;
}

/**
 * The (class, day) pairs that two timings both claim at the same level: two for all classes, two made for the same class. A timing for the
 * class and one for all classes do not clash (the class's own wins). `classIds` are the school's classes.
 */
export function clashes(schedules: readonly ScheduleRule[], classIds: readonly string[]): Clash[] {
  const found: Clash[] = [];
  for (const classId of [...classIds, FUTURE_CLASS]) {
    for (const day of DAYS) {
      const covering = schedules.filter((s) => s.days.includes(day) && appliesTo(s, classId));
      if (covering.length < 2) continue;
      const top = Math.max(...covering.map(specificity));
      const same = covering.filter((s) => specificity(s) === top);
      if (same.length >= 2) found.push({ classId, day, first: same[0].name, second: same[1].name });
    }
  }
  return found;
}

export interface SlotProblem {
  /** "slots" for the day as a whole, "slots.3.end" for a box of the fourth row. */
  path: string;
  message: string;
}

/** Whether the rows of one day make sense: at least a period, each row has some length, they follow each other, one lunch. */
export function slotProblems(slots: readonly Slot[]): SlotProblem[] {
  const found: SlotProblem[] = [];
  const periods = slots.filter((s) => s.kind === "period").length;
  if (periods === 0) found.push({ path: "slots", message: "Add at least one period" });
  if (periods > MAX_PERIODS) found.push({ path: "slots", message: `Up to ${MAX_PERIODS} periods in a day` });
  if (slots.length > MAX_SLOTS) found.push({ path: "slots", message: `Up to ${MAX_SLOTS} rows in a day` });

  let lunches = 0;
  slots.forEach((slot, i) => {
    if (slot.kind === "lunch") {
      lunches += 1;
      if (lunches > 1) found.push({ path: `slots.${i}.kind`, message: "A day has one lunch break" });
    }
    const length = slot.end - slot.start;
    if (length <= 0) {
      found.push({ path: `slots.${i}.end`, message: "The end must be after the start" });
      return;
    }
    if (slot.kind === "period" && (length < MIN_PERIOD_MINUTES || length > MAX_PERIOD_MINUTES)) {
      found.push({ path: `slots.${i}.end`, message: `A period lasts ${MIN_PERIOD_MINUTES} to ${MAX_PERIOD_MINUTES} minutes` });
    } else if (slot.kind !== "period" && length > MAX_BREAK_MINUTES) {
      found.push({ path: `slots.${i}.end`, message: `A break lasts up to ${MAX_BREAK_MINUTES} minutes` });
    }
    const above = slots[i - 1];
    if (above && slot.start < above.end) {
      found.push({ path: `slots.${i}.start`, message: `Starts before the row above ends (${minutesToClock(above.end)})` });
    }
  });
  return found;
}
