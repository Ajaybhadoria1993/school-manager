import type { SchoolDashboard } from "../types";

/**
 * The days the school's home page is about (2026-11-10, laid out like Infinity Medisetu's): Today, This week, This month or any days, each
 * figure compared with the same number of days just before. Days are "2026-11-10"; a week is Monday to Sunday, the way a school counts it.
 */

export type RangeTab = "today" | "week" | "month" | "custom";
export interface Days {
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const at = (day: string) => Date.parse(`${day}T00:00:00Z`);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => dayOf(at(day) + n * DAY_MS);
const lengthOf = (r: Days) => Math.round((at(r.to) - at(r.from)) / DAY_MS) + 1;

/** The days a tab means, with `today` the day in India. "custom" has no days of its own: the person picks them. */
export function rangeFor(tab: Exclude<RangeTab, "custom">, today: string): Days {
  if (tab === "today") return { from: today, to: today };
  if (tab === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
    const from = addDays(today, 1 - weekday);
    return { from, to: addDays(from, 6) };
  }
  const month = today.slice(0, 7);
  const [year, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: dayOf(Date.UTC(year, m, 1) - DAY_MS) };
}

/** The same number of days, just before (-1) or just after (1). */
export function stepDays(range: Days, dir: -1 | 1): Days {
  const n = lengthOf(range) * dir;
  return { from: addDays(range.from, n), to: addDays(range.to, n) };
}

const parts = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, date };
};
const short = (day: string) => `${parts(day).date} ${MONTHS[parts(day).month - 1]}`;

/** "Today, 10 Nov", "Yesterday, 9 Nov", "Tomorrow, 11 Nov", or the weekday: "Fri, 6 Nov". */
export function todayLabel(day: string, today: string): string {
  const offset = Math.round((at(day) - at(today)) / DAY_MS);
  const name = offset === 0 ? "Today" : offset === -1 ? "Yesterday" : offset === 1 ? "Tomorrow" : WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${name}, ${short(day)}`;
}

/** "10 Nov", "1 Nov – 30 Nov"; the year is said only when the run crosses it. */
export function rangeLabel(r: Days): string {
  if (r.from === r.to) return short(r.from);
  const a = parts(r.from);
  const b = parts(r.to);
  return a.year === b.year ? `${short(r.from)} – ${short(r.to)}` : `${short(r.from)} ${a.year} – ${short(r.to)} ${b.year}`;
}

/** What the figures are compared with, in words ("vs yesterday"). */
export const comparisonLabel = (tab: RangeTab): string => (tab === "today" ? "yesterday" : tab === "week" ? "last week" : tab === "month" ? "last month" : "previous period");

/** How much more or less than before, in percent; "new" when there was nothing before; null when neither has anything to say. */
export function percentChange(now: number, before: number): number | "new" | null {
  if (before === 0) return now === 0 ? null : "new";
  return Math.round(((now - before) / before) * 100);
}

/** A share compared with the share before, in points; null when either day has none. */
export const pointsChange = (now: number | null, before: number | null): number | null => (now === null || before === null ? null : now - before);

/** Minutes after midnight, in India. */
export function indiaMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

const minutesOf = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

/** What the line under the figures says of the school's day right now. */
export interface DayState {
  label: "Open now" | "Not open yet" | "Closed now" | "Holiday" | "No school today";
  open: boolean;
  /** "08:30 – 14:20"; none on a day without school. */
  hours: string | null;
  /** "3h 20m left", "Opens 08:30", "Closed at 14:20", or the holiday's name. */
  readout: string | null;
  /** How much of the day has gone, 0 to 100; none on a day without school. */
  percent: number | null;
}

export function dayState(day: SchoolDashboard["day"], now: number): DayState {
  if (day.holiday) return { label: "Holiday", open: false, hours: null, readout: day.holiday, percent: null };
  if (!day.working || !day.start || !day.end) return { label: "No school today", open: false, hours: null, readout: null, percent: null };
  const start = minutesOf(day.start);
  const end = minutesOf(day.end);
  const hours = `${day.start} – ${day.end}`;
  if (now < start) return { label: "Not open yet", open: false, hours, readout: `Opens ${day.start}`, percent: 0 };
  if (now >= end) return { label: "Closed now", open: false, hours, readout: `Closed at ${day.end}`, percent: 100 };
  const left = end - now;
  const h = Math.floor(left / 60);
  return { label: "Open now", open: true, hours, readout: h > 0 ? `${h}h ${left % 60}m left` : `${left}m left`, percent: Math.round(((now - start) / (end - start)) * 100) };
}
