import { MAX_PERIODS, MIN_PERIOD_MINUTES } from "../constants/timetable";
import type { Schedule, Slot } from "../types";
import { daySummaryOf } from "./classWeek";
import { dayProblem, daySummary, departmentRows, readWeek } from "./schoolWeek";
import { isPrePrimaryName } from "./timetable";
import { clockToMinutes, generateDay, slotProblems, type DaySetup } from "./timings";

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
}

export type DeptSetup = { kind: "periods"; setup: DaySetup } | { kind: "hours"; hours: Hours };

/** Only Pre-Primary, however it is written, is set as hours. */
export const isHoursDepartment = (name: string): boolean => isPrePrimaryName(name);

/** The hours of a day's rows: when the first starts and the last ends, and the lunch. */
export function hoursFromRows(rows: readonly Slot[]): Hours {
  const lunch = rows.find((s) => s.kind === "lunch");
  return { start: rows[0]?.start ?? "", end: rows[rows.length - 1]?.end ?? "", lunchStart: lunch?.start ?? null, lunchEnd: lunch?.end ?? null };
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
    periodMinutes,
    periods: MAX_PERIODS,
    assemblyMinutes: 0,
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

/** The first thing wrong with the hours, said before anything is sent. */
export function hoursProblem(hours: Hours, periodMinutes: number): string | undefined {
  const from = clockToMinutes(hours.start);
  const to = clockToMinutes(hours.end);
  if (from === null || to === null) return "Enter when school starts and ends";
  if (to <= from) return "School must end after it starts";
  if (hours.lunchStart !== null || hours.lunchEnd !== null) {
    const lunchFrom = hours.lunchStart ? clockToMinutes(hours.lunchStart) : null;
    const lunchTo = hours.lunchEnd ? clockToMinutes(hours.lunchEnd) : null;
    if (lunchFrom === null || lunchTo === null) return "Enter the lunch times";
    if (lunchTo <= lunchFrom) return "The lunch must end after it starts";
    if (lunchFrom < from || lunchTo > to) return "The lunch must be inside the school hours";
  }
  const rows = hoursRows(hours, periodMinutes);
  if (!rows) return "These hours are too short for a period";
  return slotProblems(rows)[0]?.message;
}

/** What a department starts from when it is given a timing of its own: the school's usual day, as the kind of numbers the department is set with. */
export function startingSetup(departmentName: string, usual: DaySetup): DeptSetup {
  return isHoursDepartment(departmentName) ? { kind: "hours", hours: hoursFromRows(generateDay(usual).slots) } : { kind: "periods", setup: { ...usual } };
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
