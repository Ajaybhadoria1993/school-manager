import { MAX_PERIODS, MIN_PERIOD_MINUTES } from "../constants/timetable";
import type { Schedule, Slot } from "../types";
import { daySummaryOf } from "./classWeek";
import { dayProblem, daySummary, departmentRows, readWeek } from "./schoolWeek";
import { isPrePrimaryName } from "./timetable";
import { clashMessage, clockToMinutes, formatMinutes, generateDay, slotProblems, type BreakClash, type DaySetup } from "./timings";

/**
 * A department's own day on the School timings page. Most departments set it like the school's: when school starts, how long a period is,
 * how many, the lunch (`periods`). **Pre-Primary** is set as **hours** (2026-11-13, user: one teacher teaches one thing a day, so periods do
 * not matter): from when to when, and a lunch if there is one. The periods are made from the school's own length of a period, the last one
 * cut to end where the day ends, so the timetable still has its rows (a whole day can go to one subject there).
 */

export interface Hours {
  start: string;
  end: string;
  /** The lunch, from when to when; null for a day without one. */
  lunchStart: string | null;
  lunchEnd: string | null;
  /** How long a period of this department is (2026-11-22, its own when it is given one); the school's when missing. */
  periodMinutes?: number;
  /** Time to come in after school starts, before the first period (2026-11-22: school time and class time apart, an "Arrival" row); none when missing. */
  arrivalMinutes?: number;
}

/** The length of a period of a day set by hours: its own, else the school's. */
const lengthOf = (hours: Hours, schoolPeriod: number) => hours.periodMinutes ?? schoolPeriod;

/** The length most periods of some rows have (the usual one), or null when there is no period. */
function usualLength(rows: readonly Slot[]): number | null {
  const counts = new Map<number, number>();
  for (const s of rows) if (s.kind === "period") counts.set((clockToMinutes(s.end) ?? 0) - (clockToMinutes(s.start) ?? 0), (counts.get((clockToMinutes(s.end) ?? 0) - (clockToMinutes(s.start) ?? 0)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

export type DeptSetup = { kind: "periods"; setup: DaySetup } | { kind: "hours"; hours: Hours };

/** Only Pre-Primary, however it is written, is set as hours. */
export const isHoursDepartment = (name: string): boolean => isPrePrimaryName(name);

/**
 * The hours of a day's rows: when the first starts and the last ends, the lunch, how long most of its periods are, and the time before the first
 * period (2026-11-22: the school's arrival and assembly are this day's time to come in, a day set by hours has no assembly).
 */
export function hoursFromRows(rows: readonly Slot[]): Hours {
  const lunch = rows.find((s) => s.kind === "lunch");
  const length = usualLength(rows);
  const start = rows[0]?.start ?? "";
  const firstPeriod = rows.find((s) => s.kind === "period");
  const before = firstPeriod ? (clockToMinutes(firstPeriod.start) ?? 0) - (clockToMinutes(start) ?? 0) : 0;
  return {
    start,
    end: rows[rows.length - 1]?.end ?? "",
    lunchStart: lunch?.start ?? null,
    lunchEnd: lunch?.end ?? null,
    ...(before > 0 ? { arrivalMinutes: before } : {}),
    ...(length ? { periodMinutes: length } : {}),
  };
}

/**
 * The rows of a day that runs from `hours.start` to `hours.end`: periods of `periodMinutes` one after another, the lunch at its own time,
 * the last period cut to end where the day ends (a bit left that is too short for a period is left out, so the day ends with the last
 * whole one). Null when the hours make no day: a time is missing, the end is not after the start, or there is no room for a period.
 */
export function hoursRows(hours: Hours, periodMinutes: number): Slot[] | null {
  const from = clockToMinutes(hours.start);
  const to = clockToMinutes(hours.end);
  if (from === null || to === null || to <= from) return null;
  const { slots } = generateDay({
    start: hours.start,
    periodMinutes: lengthOf(hours, periodMinutes),
    periods: MAX_PERIODS,
    assemblyMinutes: 0,
    arrivalMinutes: hours.arrivalMinutes,
    lunchStart: hours.lunchStart,
    lunchEnd: hours.lunchEnd,
    breakStart: null,
    breakEnd: null,
  });
  const rows: Slot[] = [];
  for (const slot of slots) {
    const opens = clockToMinutes(slot.start) ?? 0;
    const closes = clockToMinutes(slot.end) ?? 0;
    if (opens >= to) break;
    if (closes <= to) {
      rows.push(slot);
      continue;
    }
    // This row runs past the end of the day: a period is cut to end with it (when that is still a period), a break is dropped.
    if (slot.kind === "period" && to - opens >= MIN_PERIOD_MINUTES) rows.push({ ...slot, end: hours.end });
    break;
  }
  // A day does not end with a break.
  while (rows.length > 0 && rows[rows.length - 1].kind !== "period") rows.pop();
  return rows.length > 0 ? rows : null;
}

/** What is wrong with the hours themselves (a time missing, the end before the start, a lunch outside them), before the periods are looked at. */
function hoursBasics(hours: Hours): string | undefined {
  const from = clockToMinutes(hours.start);
  const to = clockToMinutes(hours.end);
  if (from === null || to === null) return "Enter when school starts and ends";
  if (to <= from) return "School must end after it starts";
  // Classes start after school starts (the time to come in between) and before it ends.
  const arrival = hours.arrivalMinutes ?? 0;
  if (arrival < 0) return `Classes can start at ${hours.start} at the earliest, when school starts`;
  if (from + arrival >= to) return "Classes must start before school ends";
  if (hours.lunchStart !== null || hours.lunchEnd !== null) {
    const lunchFrom = hours.lunchStart ? clockToMinutes(hours.lunchStart) : null;
    const lunchTo = hours.lunchEnd ? clockToMinutes(hours.lunchEnd) : null;
    if (lunchFrom === null || lunchTo === null) return "Enter the lunch times";
    if (lunchTo <= lunchFrom) return "The lunch must end after it starts";
    if (lunchFrom < from || lunchTo > to) return "The lunch must be inside the school hours";
    if (lunchFrom < from + arrival) return "The lunch must start after classes start";
  }
  return undefined;
}

/** A day set by hours that ends inside a period: that period at its full length, and where the day could end instead. */
export interface EndClash {
  end: string;
  period: number;
  periodStart: string;
  periodEnd: string;
  periodMinutes: number;
  /** End where that period would start (none when it is the first: the day would have no period). */
  earlier: string | null;
  /** End where that period ends. */
  later: string;
}

/**
 * Where a day set by hours does not line up with whole periods (2026-11-22: every period is the same length): a lunch that starts inside a period,
 * or else the day's end inside one. Said only once the hours themselves are right; nothing when every period fits.
 */
export function hoursClash(hours: Hours, schoolPeriod: number): { lunch: BreakClash | null; end: EndClash | null } {
  const none = { lunch: null, end: null };
  if (hoursBasics(hours)) return none;
  const length = lengthOf(hours, schoolPeriod);
  const to = clockToMinutes(hours.end)!;
  const { slots, clashes } = generateDay({ start: hours.start, periodMinutes: length, periods: MAX_PERIODS, assemblyMinutes: 0, arrivalMinutes: hours.arrivalMinutes, lunchStart: hours.lunchStart, lunchEnd: hours.lunchEnd, breakStart: null, breakEnd: null });
  const lunch = clashes.find((c) => c.kind === "lunch" && (clockToMinutes(c.periodStart) ?? 0) < to) ?? null;
  if (lunch) return { lunch, end: null };
  let period = 0;
  for (const s of slots) {
    if (s.kind !== "period") continue;
    period += 1;
    const opens = clockToMinutes(s.start) ?? 0;
    const closes = clockToMinutes(s.end) ?? 0;
    if (opens < to && to < closes) return { lunch: null, end: { end: hours.end, period, periodStart: s.start, periodEnd: s.end, periodMinutes: length, earlier: period > 1 ? s.start : null, later: s.end } };
  }
  return none;
}

/** "School ends at 12:30, in the middle of Period 5 (12:10 to 12:50). End it 20 min earlier (at 12:10) or 20 min later (at 12:50) so that every period is 40 min." */
export function endMessage(clash: EndClash): string {
  const between = (a: string, b: string) => Math.abs((clockToMinutes(b) ?? 0) - (clockToMinutes(a) ?? 0));
  const later = `${between(clash.end, clash.later)} min later (at ${clash.later})`;
  const ways = clash.earlier ? `${between(clash.earlier, clash.end)} min earlier (at ${clash.earlier}) or ${later}` : later;
  return `School ends at ${clash.end}, in the middle of Period ${clash.period} (${clash.periodStart} to ${clash.periodEnd}). End it ${ways} so that every period is ${formatMinutes(clash.periodMinutes)}.`;
}

/** The first thing wrong with the hours, said before anything is sent: the hours themselves, then a lunch or an end that does not line up with whole periods. */
export function hoursProblem(hours: Hours, periodMinutes: number): string | undefined {
  const basic = hoursBasics(hours);
  if (basic) return basic;
  const clash = hoursClash(hours, periodMinutes);
  if (clash.lunch) return clashMessage(clash.lunch);
  if (clash.end) return endMessage(clash.end);
  const rows = hoursRows(hours, periodMinutes);
  if (!rows) return "These hours are too short for a period";
  return slotProblems(rows)[0]?.message;
}

/** What a department starts from when it is given a timing of its own: the school's usual day, as the kind of numbers the department is set with. */
export function startingSetup(departmentName: string, usual: DaySetup): DeptSetup {
  return isHoursDepartment(departmentName) ? { kind: "hours", hours: { ...hoursFromRows(generateDay(usual).slots), periodMinutes: usual.periodMinutes } } : { kind: "periods", setup: { ...usual } };
}

/**
 * What a department has now: its own timing read back (its numbers for a department set by periods, its hours for Pre-Primary), or, when
 * it has none (a holiday with no period is none), the school's usual day as the kind of numbers it is set with. `stored` says which.
 */
export function storedSetup(department: { id: string; name: string }, schedules: readonly Schedule[], usual: DaySetup): { stored: boolean; setup: DeptSetup } {
  const stored = schedules.some((s) => s.departmentId === department.id && s.slots.some((slot) => slot.kind === "period"));
  if (!stored) return { stored, setup: startingSetup(department.name, usual) };
  return {
    stored,
    setup: isHoursDepartment(department.name) ? { kind: "hours", hours: hoursFromRows(departmentRows(schedules, department.id)) } : { kind: "periods", setup: readWeek(schedules, department.id).plan.usual },
  };
}

/** The rows of the day these numbers make (`periodMinutes` is the school's; hours use it). Empty when they make no day. */
export function deptRows(setup: DeptSetup, periodMinutes: number): Slot[] {
  return setup.kind === "periods" ? generateDay(setup.setup).slots : (hoursRows(setup.hours, periodMinutes) ?? []);
}

export function deptProblem(setup: DeptSetup, periodMinutes: number): string | undefined {
  return setup.kind === "periods" ? dayProblem(setup.setup) : hoursProblem(setup.hours, periodMinutes);
}

/** The day in a few words: with its periods when it is set by periods, only the hours (and the lunch) when it is set by hours. */
export function deptSummary(setup: DeptSetup, periodMinutes: number): string {
  if (setup.kind === "periods") return daySummary(setup.setup);
  const rows = deptRows(setup, periodMinutes);
  return rows.length === 0 ? "Set the hours" : daySummaryOf(rows);
}
