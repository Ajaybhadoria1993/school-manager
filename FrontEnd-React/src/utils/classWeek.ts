import { DAY_NAMES } from "../constants/timetable";
import type { ClassDayInput, Schedule, Slot } from "../types";
import { DEFAULT_SETUP, clockToMinutes, generateDay, minutesToClock } from "./timings";

/**
 * A class's own periods in a day, as the "Periods per day" box of its timetable thinks of them: for each day of the week how many
 * periods the class has, which the class follows from the school (or its department) and which are its own. Changing a number makes the
 * rows of that day (fewer: the rows up to that period; more: periods after the last row, as long as the last one; none: no school), and
 * only the days that end up different from what the class would follow anyway are sent (`PUT /timetable/class-day`). The rules of which
 * timing a class follows are the server's (backend scheduleRules.ts `resolveSchedule`); this is the same, so the box can say before
 * anything is sent what each day is now.
 */

export const periodCount = (rows: readonly Slot[]): number => rows.filter((s) => s.kind === "period").length;

const sameRow = (a: Slot, b: Slot) => a.kind === b.kind && a.start === b.start && a.end === b.end && (a.label ?? "") === (b.label ?? "");
export const sameRows = (a: readonly Slot[], b: readonly Slot[]): boolean => a.length === b.length && a.every((s, i) => sameRow(s, b[i]));
/** `a` is the first rows of `b` (or all of them). */
const isPrefix = (a: readonly Slot[], b: readonly Slot[]) => a.length <= b.length && a.every((s, i) => sameRow(s, b[i]));

/** A timing made for exactly this class (not a department's, not one for several classes): what "Periods per day" writes. */
export const isOwnTiming = (s: Pick<Schedule, "scope" | "classIds" | "departmentId">, classId: string): boolean =>
  s.scope === "only" && !s.departmentId && s.classIds.length === 1 && s.classIds[0] === classId;

const appliesTo = (s: Pick<Schedule, "scope" | "classIds">, classId: string) => (s.scope === "only" ? s.classIds.includes(classId) : s.scope === "except" ? !s.classIds.includes(classId) : true);
/** The more particular timing wins: named classes, then a department, then the school (the server's `specificity`). */
const rank = (s: Pick<Schedule, "scope" | "departmentId">) => (s.scope !== "only" ? 1 : s.departmentId ? 2 : 3);

/**
 * The rows a class follows on a day: the most particular timing that covers the day and the class. Null when none does, or when the one
 * that does has no periods (a holiday).
 */
export function resolveSlots(schedules: readonly Schedule[], classId: string, day: number): Slot[] | null {
  const candidates = schedules.filter((s) => s.days.includes(day) && appliesTo(s, classId));
  if (candidates.length === 0) return null;
  const top = Math.max(...candidates.map(rank));
  const winner = candidates.filter((s) => rank(s) === top).sort((a, b) => a.id.localeCompare(b.id))[0];
  return periodCount(winner.slots) > 0 ? winner.slots : null;
}

export interface ClassDay {
  /** 1 = Monday ... 7 = Sunday. */
  day: number;
  /** The rows the class has now (none: no school). */
  current: Slot[];
  /** The rows it would have if it had no days of its own. */
  inherited: Slot[];
  /** The class has a timing of its own for this day. */
  own: boolean;
}

/** The seven days of a class's week, from the school's timings (all of them, as the server lists them). */
export function classWeek(schedules: readonly Schedule[], classId: string): ClassDay[] {
  const inheritedFrom = schedules.filter((s) => !isOwnTiming(s, classId));
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    day,
    current: resolveSlots(schedules, classId, day) ?? [],
    inherited: resolveSlots(inheritedFrom, classId, day) ?? [],
    own: schedules.some((s) => isOwnTiming(s, classId) && s.days.includes(day)),
  }));
}

/** The rows a day with no rows to start from begins with: the class's fullest day, or the usual day when it has no school at all. */
export function referenceDay(days: readonly ClassDay[]): Slot[] {
  const fullest = days.reduce<Slot[]>((best, d) => (periodCount(d.current) > periodCount(best) ? d.current : best), []);
  return fullest.length > 0 ? fullest : generateDay(DEFAULT_SETUP).slots;
}

/**
 * The same day with `n` periods. Fewer: the rows up to the n-th period (what came after, lunch or breaks, goes). More: periods after the
 * last row, each as long as the last period. None: no rows. Null when it cannot be done: nothing to start from, or the day would run
 * past midnight.
 */
export function withPeriods(rows: readonly Slot[], n: number): Slot[] | null {
  if (n <= 0) return [];
  const have = periodCount(rows);
  if (have === 0) return null;
  if (n === have) return [...rows];
  if (n < have) {
    const out: Slot[] = [];
    let seen = 0;
    for (const row of rows) {
      out.push(row);
      if (row.kind === "period") {
        seen += 1;
        if (seen === n) break;
      }
    }
    return out;
  }
  const last = [...rows].reverse().find((s) => s.kind === "period")!;
  const length = (clockToMinutes(last.end) ?? 0) - (clockToMinutes(last.start) ?? 0);
  const from = clockToMinutes(rows[rows.length - 1].end);
  if (from === null || length <= 0) return null;
  let cursor: number = from;
  const out = [...rows];
  for (let i = have; i < n; i += 1) {
    const end: number = cursor + length;
    if (end > 1439) return null;
    out.push({ kind: "period", label: "", start: minutesToClock(cursor), end: minutesToClock(end) });
    cursor = end;
  }
  return out;
}

/**
 * The rows a day starts from when its number changes: the rows it has, unless they are only the school's day cut short (then the
 * school's, so going back up gives the school's day again), or it has none (then the school's, or the class's fullest day).
 */
function startFrom(day: ClassDay, reference: readonly Slot[]): readonly Slot[] {
  if (day.current.length === 0) return day.inherited.length > 0 ? day.inherited : reference;
  if (day.own && isPrefix(day.current, day.inherited)) return day.inherited;
  return day.current;
}

/** The rows of a day with `n` periods, or null when that cannot be made. The rows it has now when the number is the same. */
export function rowsFor(day: ClassDay, n: number, reference: readonly Slot[]): Slot[] | null {
  if (n === periodCount(day.current)) return day.current;
  return withPeriods(startFrom(day, reference), n) ?? withPeriods(reference, n);
}

/**
 * What `PUT /timetable/class-day` is sent for these numbers of periods: the days that are not what the class would follow anyway (a day
 * with no periods is sent with no rows). `problem` says why a day cannot be made, and then nothing should be sent.
 */
export function classDayBody(
  classId: string,
  days: readonly ClassDay[],
  counts: Readonly<Record<number, number>>,
  reference: readonly Slot[],
  removeLessons: boolean
): { body: ClassDayInput; problem: string | null } {
  const sent: ClassDayInput["days"] = [];
  let problem: string | null = null;
  for (const d of days) {
    const n = counts[d.day] ?? periodCount(d.current);
    const rows = rowsFor(d, n, reference);
    if (!rows) {
      problem ??= `${DAY_NAMES[d.day]} cannot have ${n} period${n === 1 ? "" : "s"}: the day would run past midnight.`;
      continue;
    }
    if (!sameRows(rows, d.inherited)) sent.push({ day: d.day, slots: rows });
  }
  return { body: { classId, days: sent, removeLessons }, problem };
}

/** "08:30 to 12:20 · lunch 10:30 to 11:00": a day in a few words; "No school" for a day with no rows. */
export function daySummaryOf(rows: readonly Slot[]): string {
  if (rows.length === 0) return "No school";
  const lunch = rows.find((s) => s.kind === "lunch");
  return [`${rows[0].start} to ${rows[rows.length - 1].end}`, lunch ? `lunch ${lunch.start} to ${lunch.end}` : null].filter(Boolean).join(" · ");
}
