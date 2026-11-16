import type { AttendanceStatus, DateRange, RegisterDay, StudentRangeDay, StudentRangeRow, TeacherDayStatus } from "../types";
import { addDays, monthBounds, shiftMonth } from "./calendar";

/** The rules of the attendance pages (2026-11-06): the ranges the school picks, the words for a teacher's time, how a day's mark looks. */

export interface RangePreset {
  id: "today" | "week" | "lastWeek" | "month" | "lastMonth" | "quarter";
  label: string;
  from: string;
  to: string;
}

/**
 * The Monday-to-Saturday week a day belongs to (2026-11-16). Sunday is not a school day, so a Sunday belongs to the week that ended the
 * day before; `back` weeks earlier for last week.
 */
function schoolWeek(day: string, back = 0): { from: string; to: string } {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay(); // 0 is Sunday
  const monday = addDays(day, weekday === 0 ? -6 : 1 - weekday);
  const from = addDays(monday, -7 * back);
  return { from, to: addDays(from, 5) };
}

/**
 * The ranges the school picks in one click. `today` is "2026-11-06". The students' page asks for the weeks too (`weeks`), after Today,
 * and opens on This week; the teachers' page keeps the month.
 */
export function rangePresets(today: string, weeks = false): RangePreset[] {
  const month = today.slice(0, 7);
  return [
    { id: "today", label: "Today", from: today, to: today },
    ...(weeks ? ([{ id: "week", label: "This week", ...schoolWeek(today) }, { id: "lastWeek", label: "Last week", ...schoolWeek(today, 1) }] as RangePreset[]) : []),
    { id: "month", label: "This month", ...monthBounds(month) },
    { id: "lastMonth", label: "Last month", ...monthBounds(shiftMonth(month, -1)) },
    { id: "quarter", label: "Last 3 months", from: monthBounds(shiftMonth(month, -2)).from, to: monthBounds(month).to },
  ];
}

/** The days the Student page opens on: this week, or, while a year that is over is open, that year's last month (see `startRange`). */
export function studentStartRange(today: string, over: { endDate: string } | null): { from: string; to: string } {
  return over ? startRange(today, over) : schoolWeek(today);
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

/** A week is shown roomy, in the style of a register: a week or less (7 days) has bigger marks and a Remarks column. */
export const isWeekRange = (days: number) => days >= 1 && days <= 7;

/**
 * The columns of a week's register. The server stops at today, so on a Monday it sends Monday only; the register shows the whole week
 * asked for, and the days after the last one sent are columns that have not come yet (`coming`: nothing to mark, nothing to open). A range
 * longer than a week, or a week that is over, is left as the server sent it. Never a column before the range starts.
 */
export function weekColumns(days: StudentRangeDay[], range: DateRange, serverTo: string): RegisterDay[] {
  if (!isWeekRange(dayCount(range.from, range.to))) return days;
  const after = addDays(serverTo, 1);
  const coming: RegisterDay[] = [];
  for (let date = after > range.from ? after : range.from; date <= range.to; date = addDays(date, 1)) {
    coming.push({ date, weekday: new Date(`${date}T00:00:00.000Z`).getUTCDay() || 7, holiday: null, taken: false, coming: true });
  }
  return [...days, ...coming];
}

/** The letter over a day's column: 1 is Monday, 7 is Sunday. */
export const weekdayLetter = (weekday: number): string => "MTWTFSS"[weekday - 1] ?? "";

/**
 * Did the child come? The school wants two answers, not four (2026-11-17): present and late are a child who came (late is still there),
 * absent and leave a child who did not. The percentage of the server counts the same way.
 */
export const cameToSchool = (status: AttendanceStatus): boolean => status === "present" || status === "late";

export interface DayMark {
  student: StudentRangeRow;
  status: AttendanceStatus;
  reason: string | null;
}

/**
 * One day of a class in two sides (the click on a day's heading): Present holds the children who were there (late is still there, and
 * says so), Absent the ones who were not (a child on leave is not there either, and says so). Each side keeps the order given (the
 * roll). A child with no mark that day (they had not joined) is on neither.
 */
export function daySplit(students: readonly StudentRangeRow[], date: string): { present: DayMark[]; absent: DayMark[] } {
  const present: DayMark[] = [];
  const absent: DayMark[] = [];
  for (const student of students) {
    const mark = student.records.find((r) => r.date === date);
    if (!mark) continue;
    (cameToSchool(mark.status) ? present : absent).push({ student, status: mark.status, reason: mark.reason });
  }
  return { present, absent };
}

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
