import type { CalendarEvent } from "../types";

/** Days as "YYYY-MM-DD" (the calendar, attendance, the diary). Months as "YYYY-MM". Weeks start on Sunday. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const asDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const pad = (n: number) => String(n).padStart(2, "0");

/** The day `n` days after (or before, for a negative `n`). */
export function addDays(day: string, n: number): string {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "8 Nov". */
export function shortDay(day: string): string {
  const d = asDate(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

/** "8 Nov to 10 Nov", or "20 Dec" for one day. */
export function dayRange(start: string, end: string): string {
  return start === end ? shortDay(start) : `${shortDay(start)} to ${shortDay(end)}`;
}

/** "November 2026" for "2026-11". */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "8 November 2026". */
export function fullDay(day: string): string {
  const d = asDate(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Sunday, 8 November 2026". */
export function longDay(day: string): string {
  return `${WEEKDAYS[asDate(day).getUTCDay()]}, ${fullDay(day)}`;
}

/** The month `n` months after (or before) this one, "2026-12" + 1 = "2027-01". */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** The same month `n` years after (or before). */
export function shiftYear(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return `${y + n}-${pad(m)}`;
}

/** "2026-01" to "2026-12". */
export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
}

/**
 * What one year of the calendar reads from the server: a week before its first day to a week after its last, so the grids of January
 * and December, which show a few days of the year next to it, are complete.
 */
export function yearRange(year: number): { from: string; to: string } {
  return { from: addDays(`${year}-01-01`, -7), to: addDays(`${year}-12-31`, 7) };
}

/** The first and last day of a month ("2026-11" is 1 to 30 November). */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: addDays(`${shiftMonth(month, 1)}-01`, -1) };
}

/** The weeks of a month, each Sunday to Saturday, with the days of the months beside it that fill the first and last week. */
export function monthGrid(month: string): string[][] {
  const { from: first, to: last } = monthBounds(month);
  const start = addDays(first, -asDate(first).getUTCDay());
  const end = addDays(last, 6 - asDate(last).getUTCDay());
  const weeks: string[][] = [];
  for (let day = start; day <= end; day = addDays(day, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  return weeks;
}

/** First day first; the same day, the longer one first, then by name. */
const byDay = (a: CalendarEvent, b: CalendarEvent) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate) || a.title.localeCompare(b.title);

/** The holidays and events on a day, in the order they are shown. */
export function eventsOnDay(events: readonly CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((e) => e.startDate <= day && day <= e.endDate).sort(byDay);
}

/** The ones that touch these days (they may begin before or end after), in date order. */
export function eventsTouching(events: readonly CalendarEvent[], from: string, to: string): CalendarEvent[] {
  return events.filter((e) => e.startDate <= to && e.endDate >= from).sort(byDay);
}

export interface DayKinds {
  holiday: boolean;
  event: boolean;
  titles: string[];
}

/** For every day from `from` to `to` that has something on it: is there a holiday, is there an event, and what they are called. */
export function dayKinds(events: readonly CalendarEvent[], from: string, to: string): Map<string, DayKinds> {
  const kinds = new Map<string, DayKinds>();
  for (const e of [...events].sort(byDay)) {
    const last = e.endDate < to ? e.endDate : to;
    for (let day = e.startDate > from ? e.startDate : from; day <= last; day = addDays(day, 1)) {
      const k = kinds.get(day) ?? { holiday: false, event: false, titles: [] };
      if (e.kind === "holiday") k.holiday = true;
      else k.event = true;
      k.titles.push(e.title);
      kinds.set(day, k);
    }
  }
  return kinds;
}

/** One day's place in a bar: where the bar begins and ends, and whether this day carries its name. */
export interface LaneSlot {
  event: CalendarEvent;
  startsHere: boolean;
  endsHere: boolean;
  /** The name is written on the day it starts and on the first day of each week it carries on in. */
  label: boolean;
}

/**
 * The bars of one week (Sunday to Saturday): `lanes[row][column]` is what row `row` shows on that day, or null. An event keeps one row
 * for all its days in the week, the longest and the earliest first, so a holiday of three days is one straight bar.
 */
export function weekLanes(events: readonly CalendarEvent[], week: readonly string[]): { lanes: (LaneSlot | null)[][] } {
  const lanes: (LaneSlot | null)[][] = [];
  for (const e of eventsTouching(events, week[0], week[6])) {
    const first = Math.max(0, week.findIndex((d) => d >= e.startDate));
    let lastDay = week.length - 1;
    while (week[lastDay] > e.endDate) lastDay--;
    let row = lanes.findIndex((lane) => lane.slice(first, lastDay + 1).every((slot) => slot === null));
    if (row === -1) {
      lanes.push(Array(7).fill(null));
      row = lanes.length - 1;
    }
    for (let col = first; col <= lastDay; col++) {
      lanes[row][col] = { event: e, startsHere: week[col] === e.startDate, endsHere: week[col] === e.endDate, label: week[col] === e.startDate || col === 0 };
    }
  }
  return { lanes };
}

/** The first `max` rows of a week, and how many bars each day has beyond them ("+2 more"). */
export function visibleLanes(lanes: (LaneSlot | null)[][], max: number): { shown: (LaneSlot | null)[][]; more: number[] } {
  const more = Array.from({ length: 7 }, (_, col) => lanes.slice(max).filter((lane) => lane[col] !== null).length);
  return { shown: lanes.slice(0, max), more };
}
