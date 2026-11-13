import type { GridView } from "../types";
import { sameDay } from "./weekDates";

/** One of the seven days a teacher can be given periods in: its date, its weekday (1 = Monday ... 7 = Sunday) and whether it is today. */
export interface WindowColumn {
  date: Date;
  day: number;
  today: boolean;
}

/** 1 = Monday ... 7 = Sunday (the numbers a timetable uses). */
export const weekdayOf = (date: Date): number => ((date.getDay() + 6) % 7) + 1;

/** The hour and minute of a moment as "14:20", the way the timetable writes times (they compare as text). */
const clockOf = (date: Date): string => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

/** When the class's last period ends on this weekday ("14:20"), or null when the class has no school that day. */
export function lastPeriodEnd(grid: GridView, weekday: number): string | null {
  const ends = (grid.days.find((d) => d.day === weekday)?.slots ?? []).filter((s) => s.kind === "period").map((s) => s.end);
  return ends.length === 0 ? null : ends.reduce((a, b) => (a > b ? a : b));
}

/**
 * The seven days a teacher can be given periods in, in the order of the calendar: they **start today while the class still has a period to come
 * today, and tomorrow once its school day is over** (or when it has no school today): a period that is gone cannot be given. A timetable repeats
 * every week, so seven consecutive days hold each weekday once; the dates say when each comes first.
 */
export function assignWindow(grid: GridView, now: Date): WindowColumn[] {
  const end = lastPeriodEnd(grid, weekdayOf(now));
  const startsToday = end !== null && clockOf(now) < end;
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (startsToday ? 0 : 1));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    return { date, day: weekdayOf(date), today: sameDay(date, now) };
  });
}

/** A period that ends at `end` on this day of the window is already over (only today can have periods that are). */
export const isPast = (end: string, column: WindowColumn, now: Date): boolean => column.today && end <= clockOf(now);
