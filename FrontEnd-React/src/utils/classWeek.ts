import { MAX_PERIODS, MIN_PERIOD_MINUTES } from "../constants/timetable";
import type { ClassDayInput, Schedule, Slot } from "../types";
import { DEFAULT_SETUP, clockToMinutes, generateDay, setupFromSlots, type DaySetup } from "./timings";

/**
 * A class's own hours, as the "Class timing" box of its timetable thinks of them. A class has the school's times (the school's one day:
 * when it starts, how long a period is, the lunch) and is there for as many periods as it has lessons that day; nothing is set for it.
 * Only a class that is called at other hours (9 to 2, say) gets a timing of its own: its rows are made from the hours and the school's
 * length of a period and lunch, and only the days that end up different from what the class would follow anyway are sent
 * (`PUT /timetable/class-day`). The rules of which timing a class follows are the server's (backend scheduleRules.ts `resolveSchedule`);
 * this is the same, so the box can say before anything is sent what the class has now.
 */

export const periodCount = (rows: readonly Slot[]): number => rows.filter((s) => s.kind === "period").length;

const sameRow = (a: Slot, b: Slot) => a.kind === b.kind && a.start === b.start && a.end === b.end && (a.label ?? "") === (b.label ?? "");
const sameRows = (a: readonly Slot[], b: readonly Slot[]): boolean => a.length === b.length && a.every((s, i) => sameRow(s, b[i]));

/** A timing made for exactly this class (not a department's, not one for several classes): what the "Class timing" box writes. */
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

/** When the class comes and goes now: its own day's hours if it has one, else the day it follows (the usual day when it has no school). */
export function classHours(days: readonly ClassDay[]): { start: string; end: string } {
  const own = days.find((d) => d.own && d.current.length > 0);
  const rows = own ? own.current : referenceDay(days);
  return { start: rows[0].start, end: rows[rows.length - 1].end };
}

/**
 * The numbers of a class's day from `start`: the school's length of a period (taken from `reference`, a day of the school), its lunch and
 * short break when they fall inside the hours (after the start, and before `until` when the end is known), no assembly.
 */
function classSetup(start: string, from: number, until: number, reference: readonly Slot[], periods: number): DaySetup {
  const school = setupFromSlots(reference);
  const inside = (a: string | null, b: string | null) => {
    const x = a ? clockToMinutes(a) : null;
    const y = b ? clockToMinutes(b) : null;
    return x !== null && y !== null && x >= from && y <= until;
  };
  const lunch = inside(school.lunchStart, school.lunchEnd);
  const rest = inside(school.breakStart, school.breakEnd);
  return {
    ...school,
    start,
    periods,
    assemblyMinutes: 0,
    lunchStart: lunch ? school.lunchStart : null,
    lunchEnd: lunch ? school.lunchEnd : null,
    breakStart: rest ? school.breakStart : null,
    breakEnd: rest ? school.breakEnd : null,
  };
}

/**
 * The rows of a class that comes from `start` to `end` (9:00 to 14:00 say): periods as long as the school's, the school's lunch and short
 * break where they fall inside those hours, no assembly. The last period is cut to end where the class ends when what is left is long
 * enough for a period; a shorter bit is left out, so the day ends with the last whole period. Null when the hours make no day: a time
 * is missing, the end is not after the start, or no period fits.
 */
export function rowsBetween(start: string, end: string, reference: readonly Slot[]): Slot[] | null {
  const from = clockToMinutes(start);
  const to = clockToMinutes(end);
  if (from === null || to === null || to <= from) return null;
  const rows: Slot[] = [];
  for (const slot of generateDay(classSetup(start, from, to, reference, MAX_PERIODS)).slots) {
    const opens = clockToMinutes(slot.start) ?? 0;
    const closes = clockToMinutes(slot.end) ?? 0;
    if (opens >= to) break;
    if (closes <= to) {
      rows.push(slot);
      continue;
    }
    // This row runs past the end of the class: a period is cut to end with it (when that is still a period), a break is dropped.
    if (slot.kind === "period" && to - opens >= MIN_PERIOD_MINUTES) rows.push({ ...slot, end });
    break;
  }
  // A day does not end with a break.
  while (rows.length > 0 && rows[rows.length - 1].kind !== "period") rows.pop();
  return rows.length > 0 ? rows : null;
}

/**
 * The rows of a class that starts at `start` and has `n` periods (more or fewer than the school's day: the day is cut after the n-th
 * period, or goes on after the last one). Null for no period, more than a day can have, or a day that would run past midnight.
 */
export function rowsForPeriods(start: string, n: number, reference: readonly Slot[]): Slot[] | null {
  const from = clockToMinutes(start);
  if (from === null || n < 1 || n > MAX_PERIODS) return null;
  const { slots } = generateDay(classSetup(start, from, Infinity, reference, n));
  const last = slots.at(-1);
  return last && clockToMinutes(last.end) !== null ? slots : null;
}

/**
 * What `PUT /timetable/class-day` is sent for a class that comes from `start` to `end`: every day the class has school and follows the
 * school's usual day gets those hours (a class with no school at all: Monday to Friday from the usual day); a day the school keeps
 * different (a short Saturday) stays as it is, the class's own rows if it has any; a day it has off by itself stays off; a day with no
 * school stays without. Only the days that differ from what the class would follow anyway are sent, so the school's own hours send
 * nothing. `problem` says why the hours make no day, and then nothing should be sent.
 */
export function classTimingBody(classId: string, days: readonly ClassDay[], start: string, end: string, removeLessons: boolean): { body: ClassDayInput; problem: string | null } {
  const empty = { body: { classId, days: [], removeLessons } as ClassDayInput };
  const from = clockToMinutes(start);
  const to = clockToMinutes(end);
  if (from === null || to === null) return { ...empty, problem: "Enter when the class starts and ends" };
  if (to <= from) return { ...empty, problem: "The class must end after it starts" };

  const reference = referenceDay(days);
  const hasSchool = days.some((d) => d.current.length > 0);
  // The school's usual day: the rows most of its days have.
  const signature = (rows: readonly Slot[]) => JSON.stringify(rows.map((r) => [r.kind, r.start, r.end]));
  const tally = new Map<string, number>();
  for (const d of days) if (d.inherited.length > 0) tally.set(signature(d.inherited), (tally.get(signature(d.inherited)) ?? 0) + 1);
  const usual = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const sent: ClassDayInput["days"] = [];
  for (const d of days) {
    const schooled = hasSchool ? d.current.length > 0 : d.day <= 5;
    if (!schooled) {
      // A day the class has off by itself (the school has school that day) stays off.
      if (hasSchool && d.own && d.inherited.length > 0) sent.push({ day: d.day, slots: [] });
      continue;
    }
    const follows = !hasSchool || usual === null || signature(d.inherited) === usual;
    if (!follows) {
      // A day the school keeps different is left to the school, unless the class already has rows of its own on it.
      if (d.own) sent.push({ day: d.day, slots: d.current });
      continue;
    }
    const rows = rowsBetween(start, end, d.inherited.length > 0 ? d.inherited : d.current.length > 0 ? d.current : reference);
    if (!rows) return { ...empty, problem: "These hours are too short for a period" };
    if (!sameRows(rows, d.inherited)) sent.push({ day: d.day, slots: rows });
  }
  return { body: { classId, days: sent, removeLessons }, problem: null };
}

/** "08:30 to 12:20 · lunch 10:30 to 11:00": a day in a few words; "No school" for a day with no rows. */
export function daySummaryOf(rows: readonly Slot[]): string {
  if (rows.length === 0) return "No school";
  const lunch = rows.find((s) => s.kind === "lunch");
  return [`${rows[0].start} to ${rows[rows.length - 1].end}`, lunch ? `lunch ${lunch.start} to ${lunch.end}` : null].filter(Boolean).join(" · ");
}
