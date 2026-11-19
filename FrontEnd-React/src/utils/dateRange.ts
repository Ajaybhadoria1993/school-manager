import type { DateRange } from "../types";
import { dayCount, rangePresets } from "./attendance";
import { addDays, monthBounds, shiftMonth } from "./calendar";

/**
 * The rules of the date filter of the whole app (2026-11-17), laid out like Infinity Medisetu's: a box that says the days ("17 Nov 26 — 17 Nov 26"),
 * an arrow each side that moves to the period before or after, and a window (click the box) with ready-made ranges and a calendar of two months.
 * Days are "2026-11-17", months "2026-11".
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "17 Nov 26": a day the way the box says it. */
export function stampDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1]} ${String(year).slice(2)}`;
}

/** "17 Nov 26 — 17 Nov 26". */
export const rangeText = (r: DateRange): string => `${stampDay(r.from)} — ${stampDay(r.to)}`;

/** "1 day", "6 days". */
export function lengthText(r: DateRange): string {
  const days = dayCount(r.from, r.to);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** One ready-made range in the window. */
export interface PickerPreset {
  id: string;
  label: string;
  from: string;
  to: string;
}

/**
 * The ready-made ranges, as the reference lists them: Today, This Week, Last Week, Last 7 Days, This Month, Last Month, and Last 3 Months.
 * A week is Monday to Saturday, the way the school counts it (the same days as the attendance sheets).
 */
export function pickerPresets(today: string): PickerPreset[] {
  const own = rangePresets(today, true);
  const span = (id: string, label: string): PickerPreset => {
    const found = own.find((p) => p.id === id);
    if (!found) throw new Error(`No preset ${id}`);
    return { id, label, from: found.from, to: found.to };
  };
  return [
    span("today", "Today"),
    span("week", "This Week"),
    span("lastWeek", "Last Week"),
    { id: "last7", label: "Last 7 Days", from: addDays(today, -6), to: today },
    span("month", "This Month"),
    span("lastMonth", "Last Month"),
    span("quarter", "Last 3 Months"),
  ];
}

const weekdayOf = (day: string) => new Date(`${day}T00:00:00.000Z`).getUTCDay(); // 0 is Sunday

/**
 * The range an arrow moves to: a whole month goes to the month before or after; a Monday-to-Saturday week goes a whole week (so the next one
 * is Monday to Saturday again); any other range goes by its own number of days.
 */
export function stepRange(range: DateRange, dir: -1 | 1): DateRange {
  const month = range.from.slice(0, 7);
  const bounds = monthBounds(month);
  if (range.from === bounds.from && range.to === bounds.to) return monthBounds(shiftMonth(month, dir));
  let n = dayCount(range.from, range.to);
  if (n === 6 && weekdayOf(range.from) === 1) n = 7;
  return { from: addDays(range.from, n * dir), to: addDays(range.to, n * dir) };
}

/** Is there anything after this range? Not once it reaches today (attendance of days to come is not a thing to look at). */
export const hasLater = (range: DateRange, today: string): boolean => range.to < today;

/**
 * A pick in the calendar: the days so far, and whether the last day is still to be clicked. The first click is a day of its own (so the
 * window can already be applied); the second click, on the same day or a later one, ends the range.
 */
export interface Pick extends DateRange {
  open: boolean;
}

export function pickDay(pick: Pick, day: string): Pick {
  if (!pick.open || day < pick.from) return { from: day, to: day, open: true };
  return { from: pick.from, to: day, open: false };
}

/** The month on the left when the window opens: the month of a range inside one month, else the one before its last month (so the last day shows). */
export function startMonth(range: DateRange): string {
  const first = range.from.slice(0, 7);
  const last = range.to.slice(0, 7);
  return first === last ? first : shiftMonth(last, -1);
}

/** The years in the year box: five back from this one and one ahead, and the year being looked at. */
export function yearChoices(today: string, visibleMonth: string): string[] {
  const thisYear = Number(today.slice(0, 4));
  const years = new Set<number>(Array.from({ length: 7 }, (_, i) => thisYear - 5 + i));
  years.add(Number(visibleMonth.slice(0, 4)));
  return [...years].sort((a, b) => a - b).map(String);
}
