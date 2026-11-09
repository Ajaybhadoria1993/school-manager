import type { TeacherDayStatus } from "../types";
import { monthBounds, shiftMonth } from "./calendar";

/** The rules of the attendance pages (2026-11-06): the ranges the school picks, the words for a teacher's time, how a day's mark looks. */

export interface RangePreset {
  id: "today" | "month" | "lastMonth" | "quarter";
  label: string;
  from: string;
  to: string;
}

/** The ranges the school picks in one click; This month is the one the pages open on. `today` is "2026-11-06". */
export function rangePresets(today: string): RangePreset[] {
  const month = today.slice(0, 7);
  return [
    { id: "today", label: "Today", from: today, to: today },
    { id: "month", label: "This month", ...monthBounds(month) },
    { id: "lastMonth", label: "Last month", ...monthBounds(shiftMonth(month, -1)) },
    { id: "quarter", label: "Last 3 months", from: monthBounds(shiftMonth(month, -2)).from, to: monthBounds(month).to },
  ];
}

/**
 * The days an attendance page opens on: this month, or, while a year that is over is open, the last month of that year (this month is
 * after it, so it would show nothing). A year that has not reached its end date yet opens on the month of today.
 */
export function startRange(today: string, over: { endDate: string } | null): { from: string; to: string } {
  if (!over) return monthBounds(today.slice(0, 7));
  return monthBounds((over.endDate < today ? over.endDate : today).slice(0, 7));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many days a range holds, both ends counted (0 when it is the wrong way round). */
export function dayCount(from: string, to: string): number {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  return Number.isNaN(days) || days < 1 ? 0 : days;
}

/** Up to a month every day has a column of its own; a longer range is shown by its counts (and one child's days in a window). */
export const showsEveryDay = (days: number) => days >= 1 && days <= 31;

/** The letter over a day's column: 1 is Monday, 7 is Sunday. */
export const weekdayLetter = (weekday: number): string => "MTWTFSS"[weekday - 1] ?? "";

/** "On time", "Late by 12 min", "Late by 1 h 5 min"; nothing when it is not known. */
export function lateText(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes <= 0) return "On time";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Late by ${[h > 0 ? `${h} h` : "", m > 0 ? `${m} min` : ""].filter(Boolean).join(" ")}`;
}

export const percentText = (percent: number | null): string => (percent === null ? "–" : `${percent}%`);

/** The least attendance a school expects (75%): below it the percentage is marked. */
export const LOW_ATTENDANCE_PERCENT = 75;
export const isLowPercent = (percent: number | null): boolean => percent !== null && percent < LOW_ATTENDANCE_PERCENT;

export interface Look {
  label: string;
  /** The one character in a day's cell of the grid. */
  letter: string;
  /** The tint of a cell or pill of this status. */
  tone: string;
}

const LOOKS: Record<TeacherDayStatus, Look> = {
  present: { label: "Present", letter: "P", tone: "bg-success-soft text-success" },
  late: { label: "Late", letter: "L", tone: "bg-warning-soft text-warning" },
  absent: { label: "Absent", letter: "A", tone: "bg-danger-soft text-danger" },
  leave: { label: "Leave", letter: "Lv", tone: "bg-info-soft text-info" },
  off: { label: "Off", letter: "–", tone: "bg-surface-muted text-foreground-muted" },
  holiday: { label: "Holiday", letter: "H", tone: "bg-info-soft text-info" },
  no_login: { label: "No login", letter: "?", tone: "bg-surface-muted text-foreground-muted" },
  pending: { label: "Not yet", letter: "·", tone: "bg-surface-muted text-foreground-muted" },
  upcoming: { label: "Coming", letter: "·", tone: "bg-surface-muted text-foreground-muted" },
  before: { label: "Not joined", letter: "", tone: "bg-surface-muted text-foreground-muted" },
};

export const teacherLook = (status: TeacherDayStatus): Look => LOOKS[status];
