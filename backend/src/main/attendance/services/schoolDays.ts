import { Types } from "mongoose";
import { CalendarService } from "../../classroom/services/calendar.service";
import { BellSchedule } from "../../timetable/models/BellSchedule";
import { timingHistory, timingsOn } from "../../timetable/services/scheduleHistory";

/**
 * What each day is for the school (2026-11-06): does it run, from when to when, and is it a holiday. Teachers' attendance is worked out
 * from this: a day the school does not run, or a holiday, is not an absence; school ending is when a teacher who has not marked is absent.
 */
export interface SchoolDay {
  date: string;
  /** 1 = Monday ... 7 = Sunday. */
  weekday: number;
  /** The school runs this weekday (a timing of the school has it). With no timing set at all, every day but Sunday. */
  working: boolean;
  /** Minutes after midnight: the earliest start and the latest end of the timings that run this weekday; null when none is set. */
  start: number | null;
  end: number | null;
  /** The school's own holiday or a standard one it has not taken off. */
  holiday: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-11-02" .. "2026-11-04" as every day between, both included. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

export const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;

export async function schoolDays(tenantId: string, from: string, to: string): Promise<SchoolDay[]> {
  const days = eachDay(from, to);
  if (days.length === 0) return [];
  const school = new Types.ObjectId(tenantId);
  const [current, history, holidays] = await Promise.all([
    BellSchedule.find({ tenantId: school }).select("days slots").lean(),
    timingHistory(tenantId, from),
    CalendarService.holidaysBetween(school, from, to),
  ]);
  return days.map((date) => {
    const weekday = weekdayOf(date);
    // A day is read with the timing that was in force on it (a Saturday taken off later is still a school day, and an absence, before the change).
    const schedules = timingsOn(date, history, current);
    const running = schedules.filter((s) => s.days.includes(weekday) && s.slots.length > 0);
    const holiday = holidays.find((h) => h.startDate <= date && h.endDate >= date);
    return {
      date,
      weekday,
      working: schedules.length === 0 ? weekday !== 7 : running.length > 0,
      start: running.length > 0 ? Math.min(...running.map((s) => Math.min(...s.slots.map((x) => x.start)))) : null,
      end: running.length > 0 ? Math.max(...running.map((s) => Math.max(...s.slots.map((x) => x.end)))) : null,
      holiday: holiday?.title ?? null,
    };
  });
}
