import { DAY_SHORT, MAX_BREAK_MINUTES, MAX_PERIODS, MAX_PERIOD_MINUTES, MIN_PERIOD_MINUTES, TIME_MESSAGE } from "../constants/timetable";
import type { Slot } from "../types";

/**
 * The school's day: how a head's few numbers (when school starts, how long a period is, how many, the lunch) become the rows of a
 * timing, how the rows are read back into those numbers to change them, and the checks the server makes, said before anything is sent.
 * Times are "HH:MM" on the screen and minutes after midnight in here.
 */

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "08:30" -> 510; null for anything that is not a time of day. */
export function clockToMinutes(clock: string): number | null {
  const match = CLOCK.exec(clock.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 510 -> "08:30". */
export function minutesToClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** What the head tells: the day's numbers. */
export interface DaySetup {
  start: string;
  periodMinutes: number;
  periods: number;
  /** An assembly or prayer before the first period; 0 for none. */
  assemblyMinutes: number;
  /** The lunch, the same for every class: from when to when; null for a day without one. */
  lunchStart: string | null;
  lunchEnd: string | null;
  /** One short break, at its own time like the lunch (from when to when); null for a day without one. */
  breakStart: string | null;
  breakEnd: string | null;
}

export const DEFAULT_SETUP: DaySetup = { start: "08:30", periodMinutes: 40, periods: 8, assemblyMinutes: 0, lunchStart: "10:30", lunchEnd: "11:00", breakStart: null, breakEnd: null };

/** A length of time in words: "40 min", "1 hr", "1 hr 30 min". */
export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

const row = (kind: Slot["kind"], label: string, start: number, end: number): Slot => ({ kind, label, start: minutesToClock(start), end: minutesToClock(end) });

/** A break at its own time (the lunch, the short break): the periods fit round it. */
interface Fixed {
  kind: "lunch" | "break";
  label: string;
  /** How the notes call it: "lunch", "the short break". */
  what: string;
  start: number;
  end: number;
}

/** A break that is on and makes sense (both times, the end after the start); anything else is no break. */
function fixedBreak(kind: Fixed["kind"], label: string, what: string, from: string | null, to: string | null): Fixed[] {
  const start = from ? clockToMinutes(from) : null;
  const end = to ? clockToMinutes(to) : null;
  return start !== null && end !== null && end > start ? [{ kind, label, what, start, end }] : [];
}

/**
 * The rows of a day from the head's numbers: periods of the same length one after another, an assembly first, and the lunch and the short
 * break each at their own time (the periods fit round them, in the order of their times). A period that would run into a break is cut to
 * end where it starts; a gap too small for a period before it is a short break. Every such decision is said in `notes`; the rows can be
 * changed after, one by one.
 */
export function generateDay(setup: DaySetup): { slots: Slot[]; notes: string[] } {
  const slots: Slot[] = [];
  const notes: string[] = [];
  const start = clockToMinutes(setup.start) ?? 510;
  const pending = [...fixedBreak("lunch", "Lunch", "lunch", setup.lunchStart, setup.lunchEnd), ...fixedBreak("break", "Short break", "the short break", setup.breakStart, setup.breakEnd)].sort((a, b) => a.start - b.start);
  let cursor = start;
  let periodNo = 0;

  if (setup.assemblyMinutes > 0) {
    slots.push(row("break", "Assembly", cursor, cursor + setup.assemblyMinutes));
    cursor += setup.assemblyMinutes;
  }

  while (periodNo < setup.periods) {
    const next = pending[0];
    if (next && cursor >= next.start) {
      // The break is next: at its own time (or straight after what ran over it).
      const at = Math.max(cursor, next.start);
      if (cursor > next.start) notes.push(`${next.what[0].toUpperCase()}${next.what.slice(1)} starts at ${minutesToClock(at)}, after the periods before it.`);
      slots.push(row(next.kind, next.label, at, at + (next.end - next.start)));
      cursor = at + (next.end - next.start);
      pending.shift();
      continue;
    }
    const end = cursor + setup.periodMinutes;
    if (next && end > next.start) {
      const gap = next.start - cursor;
      if (gap >= MIN_PERIOD_MINUTES) {
        periodNo += 1;
        slots.push(row("period", "", cursor, next.start));
        notes.push(`Period ${periodNo} is cut to ${gap} minutes so that ${next.what} starts at ${minutesToClock(next.start)}.`);
      } else if (gap > 0) {
        slots.push(row("break", "Short break", cursor, next.start));
        notes.push(`The ${gap} minutes left before ${next.what} are a break.`);
      }
      cursor = next.start;
      continue;
    }
    periodNo += 1;
    slots.push(row("period", "", cursor, end));
    cursor = end;
  }

  for (const left of pending) {
    const noun = left.what.startsWith("the ") ? left.what : `the ${left.what}`;
    notes.push(`${noun[0].toUpperCase()}${noun.slice(1)} (${minutesToClock(left.start)} to ${minutesToClock(left.end)}) comes after the last period, so no ${left.label.toLowerCase()} row was added.`);
  }
  return { slots, notes };
}

/**
 * The head's numbers behind a day's rows, to change them: the start, the usual length of a period (the most common one), the lunch, an
 * assembly first and the short breaks. A new timing starts from the usual day.
 */
export function setupFromSlots(slots: readonly Slot[]): DaySetup {
  if (slots.length === 0) return { ...DEFAULT_SETUP };
  const minutes = slots.map((s) => ({ ...s, from: clockToMinutes(s.start) ?? 0, to: clockToMinutes(s.end) ?? 0 }));
  const periods = minutes.filter((s) => s.kind === "period");
  const lengths = new Map<number, number>();
  for (const p of periods) lengths.set(p.to - p.from, (lengths.get(p.to - p.from) ?? 0) + 1);
  const usual = [...lengths].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? DEFAULT_SETUP.periodMinutes;

  const setup: DaySetup = { start: slots[0].start, periodMinutes: usual, periods: periods.length, assemblyMinutes: 0, lunchStart: null, lunchEnd: null, breakStart: null, breakEnd: null };
  let seen = 0;
  minutes.forEach((s, i) => {
    if (s.kind === "period") seen += 1;
    else if (s.kind === "lunch") {
      setup.lunchStart = s.start;
      setup.lunchEnd = s.end;
    } else if (i === 0 && seen === 0) setup.assemblyMinutes = s.to - s.from;
    // Only one short break is kept: the first.
    else if (seen > 0 && setup.breakStart === null) {
      setup.breakStart = s.start;
      setup.breakEnd = s.end;
    }
  });
  return setup;
}

/**
 * What is wrong with a day's numbers, said before anything is sent: a lunch or a short break that is on needs both its times and the end
 * after the start, and the two cannot share time (one ending as the other starts is fine).
 */
export function setupProblems(setup: DaySetup): string[] {
  const found: string[] = [];
  const spans: { name: string; start: number; end: number }[] = [];
  for (const [name, from, to] of [
    ["lunch", setup.lunchStart, setup.lunchEnd],
    ["short break", setup.breakStart, setup.breakEnd],
  ] as const) {
    if (from === null && to === null) continue;
    const start = from ? clockToMinutes(from) : null;
    const end = to ? clockToMinutes(to) : null;
    if (start === null || end === null) found.push(`Enter the ${name} times`);
    else if (end <= start) found.push(`The ${name} must end after it starts`);
    else spans.push({ name, start, end });
  }
  if (spans.length === 2 && spans[0].start < spans[1].end && spans[1].start < spans[0].end) found.push("The short break and the lunch overlap");
  return found;
}

/** How a day reads on a card: the first and last time, how many periods, the lunch. */
export function describeDay(slots: readonly Slot[]): { start: string | null; end: string | null; periods: number; lunch: { start: string; end: string } | null } {
  const lunch = slots.find((s) => s.kind === "lunch");
  return {
    start: slots[0]?.start ?? null,
    end: slots[slots.length - 1]?.end ?? null,
    periods: slots.filter((s) => s.kind === "period").length,
    lunch: lunch ? { start: lunch.start, end: lunch.end } : null,
  };
}

export interface SlotProblem {
  /** "slots" for the day as a whole, "slots.3.end" for a box of the fourth row. */
  path: string;
  message: string;
}

/** The server's checks of a day's rows (backend scheduleRules.ts slotProblems), in its words. */
export function slotProblems(slots: readonly Slot[]): SlotProblem[] {
  const found: SlotProblem[] = [];
  const periods = slots.filter((s) => s.kind === "period").length;
  if (periods === 0) found.push({ path: "slots", message: "Add at least one period" });
  if (periods > MAX_PERIODS) found.push({ path: "slots", message: `Up to ${MAX_PERIODS} periods in a day` });

  let lunches = 0;
  let above: number | null = null;
  slots.forEach((slot, i) => {
    const start = clockToMinutes(slot.start);
    const end = clockToMinutes(slot.end);
    if (start === null) found.push({ path: `slots.${i}.start`, message: TIME_MESSAGE });
    if (end === null) found.push({ path: `slots.${i}.end`, message: TIME_MESSAGE });
    if (slot.kind === "lunch") {
      lunches += 1;
      if (lunches > 1) found.push({ path: `slots.${i}.kind`, message: "A day has one lunch break" });
    }
    if (start === null || end === null) {
      above = end ?? above;
      return;
    }
    const length = end - start;
    if (length <= 0) found.push({ path: `slots.${i}.end`, message: "The end must be after the start" });
    else if (slot.kind === "period" && (length < MIN_PERIOD_MINUTES || length > MAX_PERIOD_MINUTES)) {
      found.push({ path: `slots.${i}.end`, message: `A period lasts ${MIN_PERIOD_MINUTES} to ${MAX_PERIOD_MINUTES} minutes` });
    } else if (slot.kind !== "period" && length > MAX_BREAK_MINUTES) {
      found.push({ path: `slots.${i}.end`, message: `A break lasts up to ${MAX_BREAK_MINUTES} minutes` });
    }
    if (length > 0 && above !== null && start < above) found.push({ path: `slots.${i}.start`, message: `Starts before the row above ends (${minutesToClock(above)})` });
    above = end;
  });
  return found;
}

/** "Mon to Fri", "Mon, Wed, Sat": the days of a timing in a few words. */
export function daysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return "No days";
  if (sorted.length === 7) return "Every day";
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) return `${DAY_SHORT[sorted[0]]} to ${DAY_SHORT[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_SHORT[d]).join(", ");
}
