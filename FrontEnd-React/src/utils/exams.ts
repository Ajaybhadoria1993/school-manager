import type { Chip } from "../components/ui/ChipPicker";
import type { ChildPaper, Exam, ExamClassRef, ExamPaper, ExamType } from "../types";
import { addDays, shortDay } from "./calendar";

/** The kinds of exam and test the school can schedule. `full` ones take over the school day (they can have school hours). */
export const EXAM_TYPE_OPTIONS: { value: ExamType; label: string; full: boolean }[] = [
  { value: "half_yearly", label: "Half-yearly exam", full: true },
  { value: "annual", label: "Annual exam", full: true },
  { value: "quarterly", label: "Quarterly exam", full: true },
  { value: "pre_board", label: "Pre-board exam", full: true },
  { value: "unit_test", label: "Unit test", full: false },
  { value: "monthly_test", label: "Monthly test", full: false },
  { value: "class_test", label: "Class test", full: false },
  { value: "other", label: "Other test", full: false },
];

export const EXAM_TYPE_CHIPS: Chip[] = EXAM_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
export const isFullExam = (type: ExamType) => EXAM_TYPE_OPTIONS.find((o) => o.value === type)?.full ?? false;

const NAMES: Record<ExamType, string> = {
  half_yearly: "Half-Yearly Exam",
  annual: "Annual Exam",
  quarterly: "Quarterly Exam",
  pre_board: "Pre-Board Exam",
  unit_test: "Unit Test",
  monthly_test: "Monthly Test",
  class_test: "Class Test",
  other: "",
};
/** The name offered for a kind ("Half-Yearly Exam"); the school may change it. */
export const defaultExamName = (type: ExamType) => NAMES[type];
/** True while the name is still one of the offered ones (or empty), so choosing another kind may replace it. */
export const isOfferedName = (name: string) => name.trim() === "" || Object.values(NAMES).includes(name.trim());

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const asDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** "09:00" -> 540 (minutes after midnight); NaN for anything else. */
export function minutesOf(clock: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

const clockOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "15:45" -> "3:45 PM", "00:05" -> "12:05 AM", "24:00" -> "12:00 AM": the way a school writes a time. */
export function clock12(clock: string): string {
  const total = minutesOf(clock);
  if (Number.isNaN(total)) return clock;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** When a paper that starts at `start` and lasts `minutes` ends, "12:00" ("" while the start or the time is not a number). */
export function endClock(start: string, minutes: number): string {
  const from = minutesOf(start);
  return Number.isNaN(from) || !Number.isFinite(minutes) ? "" : clockOf(from + minutes);
}

/** 40 -> "40 min", 180 -> "3 h", 90 -> "1 h 30 min". */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h > 0 ? `${h} h` : "", m > 0 ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** "Tue, 15 Sep", or with the year: "Tue, 15 Sep 2026". */
export function weekdayDay(day: string, withYear = false): string {
  return `${WEEKDAYS[asDate(day).getUTCDay()]}, ${shortDay(day)}${withYear ? ` ${day.slice(0, 4)}` : ""}`;
}

/** The days an exam runs: "15 Sep to 26 Sep 2026", "30 Oct 2026" for one day, "28 Dec 2026 to 5 Jan 2027" across a year. */
export function examDays(start: string, end: string): string {
  if (start === end) return `${shortDay(start)} ${start.slice(0, 4)}`;
  return start.slice(0, 4) === end.slice(0, 4) ? `${shortDay(start)} to ${shortDay(end)} ${end.slice(0, 4)}` : `${shortDay(start)} ${start.slice(0, 4)} to ${shortDay(end)} ${end.slice(0, 4)}`;
}

const byTime = (a: ExamPaper, b: ExamPaper) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.subject.name.localeCompare(b.subject.name);

/** What a class does and when, leaving out the topic and marks: two classes with the same slots have "the same dates and times". */
const slotOf = (p: ExamPaper) => `${p.subject.id}|${p.date}|${p.startTime}|${p.durationMinutes}`;

export interface ClassGroup {
  classes: ExamClassRef[];
  papers: ExamPaper[];
}

/**
 * The classes that write the same papers on the same days at the same times, together (so "Class 1, 2 and 3 have one timetable" is one
 * card), in the school's class order. A group lists every paper of its classes: one that only some of them write is in each group it
 * belongs to, and two papers of one slot with different topics are both kept.
 */
export function groupByTimetable(papers: ExamPaper[]): ClassGroup[] {
  const classes = new Map<string, ExamClassRef>();
  const slots = new Map<string, Set<string>>();
  const ofClass = new Map<string, ExamPaper[]>();
  for (const p of papers) {
    for (const c of p.classes) {
      classes.set(c.id, c);
      slots.set(c.id, (slots.get(c.id) ?? new Set()).add(slotOf(p)));
      ofClass.set(c.id, [...(ofClass.get(c.id) ?? []), p]);
    }
  }
  const groups = new Map<string, ClassGroup>();
  for (const c of [...classes.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
    const signature = [...(slots.get(c.id) ?? [])].sort().join(";");
    const group = groups.get(signature) ?? { classes: [], papers: [] };
    group.classes.push(c);
    for (const p of ofClass.get(c.id) ?? []) if (!group.papers.some((q) => q.id === p.id)) group.papers.push(p);
    groups.set(signature, group);
  }
  return [...groups.values()].map((g) => ({ ...g, papers: [...g.papers].sort(byTime) }));
}

/** The days that have papers, in date order, each with its papers in time order. */
export function groupByDate(papers: ExamPaper[]): { date: string; papers: ExamPaper[] }[] {
  const days = new Map<string, ExamPaper[]>();
  for (const p of [...papers].sort(byTime)) days.set(p.date, [...(days.get(p.date) ?? []), p]);
  return [...days.entries()].map(([date, list]) => ({ date, papers: list }));
}

/** The day after, leaving Sunday out. */
const nextSchoolDay = (day: string) => {
  const next = addDays(day, 1);
  return asDate(next).getUTCDay() === 0 ? addDays(next, 1) : next;
};

/**
 * What a new row of a timetable starts with, so a whole timetable is filled quickly: the first one on the exam's first day at the
 * hour the school starts (3 hours for an exam, 40 minutes for a test); each next one the next day at the same time and length, not on a
 * Sunday, and never after the exam's last day.
 */
export function nextRowDefaults(
  previous: { date: string; startTime: string; durationMinutes: number } | null,
  exam: Pick<Exam, "startDate" | "endDate" | "full" | "schoolHours">
): { date: string; startTime: string; durationMinutes: number } {
  if (!previous) return { date: exam.startDate, startTime: exam.schoolHours?.start ?? "09:00", durationMinutes: exam.full ? 180 : 40 };
  const next = nextSchoolDay(previous.date);
  return { date: next > exam.endDate ? exam.endDate : next, startTime: previous.startTime, durationMinutes: previous.durationMinutes };
}

/** Marks go in whole or half marks ("42", "42.5"; not "33.3"): the server keeps the same rule. */
export const isHalfMark = (marks: number) => Number.isFinite(marks) && Number.isInteger(marks * 2);

/**
 * What a child scored in one paper, in words: "45 / 50 · 90%", "Absent", or, for a paper that was held (its day has come) with no marks
 * yet, "Marks not in yet". A paper still to come says nothing (null).
 */
export function resultText(paper: Pick<ChildPaper, "date" | "maxMarks" | "result">, today: string): string | null {
  const { result } = paper;
  if (result) {
    if (result.absent) return "Absent";
    const of = paper.maxMarks === null ? "" : ` / ${paper.maxMarks}`;
    return `${result.marks}${of}${result.percent === null ? "" : ` · ${result.percent}%`}`;
  }
  return paper.date <= today ? "Marks not in yet" : null;
}
