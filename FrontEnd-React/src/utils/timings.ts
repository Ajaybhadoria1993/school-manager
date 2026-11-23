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

/** A time of day moved by some minutes ("08:30" + 60 = "09:30"); null when it is not a time, or would leave the day (before 00:00, after 23:59). */
export function shiftClock(clock: string, delta: number): string | null {
  const minutes = clockToMinutes(clock);
  if (minutes === null) return null;
  const moved = minutes + delta;
  return moved < 0 || moved > 1439 ? null : minutesToClock(moved);
}

/** What the head tells: the day's numbers. */
export interface DaySetup {
  /** When school starts (the gates open): the first row of the day. */
  start: string;
  periodMinutes: number;
  periods: number;
  /** An assembly or prayer before the first period; 0 for none. */
  assemblyMinutes: number;
  /**
   * Time to come in after school starts, before the assembly and the first period (2026-11-22, user: school at 8:00, classes from 8:20, so
   * everyone is in first). A row of its own, "Arrival"; missing or 0 for none, so classes start when school does (after the assembly).
   */
  arrivalMinutes?: number;
  /** The lunch, the same for every class: from when to when; null for a day without one. */
  lunchStart: string | null;
  lunchEnd: string | null;
  /** One short break, at its own time like the lunch (from when to when); null for a day without one. */
  breakStart: string | null;
  breakEnd: string | null;
}

/** What the row of time to come in, before the assembly and the first period, is called. */
export const ARRIVAL_LABEL = "Arrival";

/**
 * The "Arrival" row: kept in the rows (it holds when school starts) but not drawn as a box or a band (2026-11-22, user: "arrival wala section hatao,
 * zaruri nahi"): the School time and Class time figures say it.
 */
export const isArrival = (slot: { kind: string; label?: string | null }): boolean => slot.kind === "break" && slot.label === ARRIVAL_LABEL;
export const withoutArrival = <T extends { kind: string; label?: string | null }>(slots: readonly T[]): T[] => slots.filter((s) => !isArrival(s));

/** When the first period starts: school's start, then the time to come in and the assembly. Null when the start is not a time or classes would leave the day. */
export function classesStart(setup: DaySetup): string | null {
  const opens = clockToMinutes(setup.start);
  if (opens === null) return null;
  const at = opens + (setup.arrivalMinutes ?? 0) + setup.assemblyMinutes;
  return at < 0 || at > 1439 ? null : minutesToClock(at);
}

/** The day with this much time to come in (none kept as no key, so a day without it reads as it always did). */
export function withArrival(setup: DaySetup, minutes: number): DaySetup {
  const next: DaySetup = { ...setup, arrivalMinutes: minutes };
  if (minutes === 0) delete next.arrivalMinutes;
  return next;
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
 * A period that a break (the lunch, the short break) would cut short: it starts inside the period. Every period is the same length (user,
 * 2026-11-22: "sab period ek hi time par rahega"), so the timings pages refuse such a day and offer to move the break to where that period ends
 * (`moveTo`, the break keeping its length).
 */
export interface BreakClash {
  kind: "lunch" | "break";
  /** "lunch", "the short break". */
  what: string;
  /** The number of the period it would cut (1 is the first). */
  period: number;
  /** That period at its full length. */
  periodStart: string;
  periodEnd: string;
  periodMinutes: number;
  /** When the break starts now. */
  breakStart: string;
  /** Where it goes, later, so the period keeps its length: at that period's end. */
  moveTo: { start: string; end: string };
  /** Or earlier: where that period would start (none for the first period: a break does not come before it). */
  earlier: { start: string; end: string } | null;
}

/**
 * The rows of a day from the head's numbers: periods of the same length one after another, an assembly first, and the lunch and the short
 * break each at their own time (the periods fit round them, in the order of their times). A period that would run into a break is cut to
 * end where it starts (and said in `clashes`: the timings pages do not save such a day, 2026-11-22); a gap too small for a period before it is
 * a short break. Every such decision is said in `notes`; the rows can be changed after, one by one.
 */
export function generateDay(setup: DaySetup): { slots: Slot[]; notes: string[]; clashes: BreakClash[] } {
  const slots: Slot[] = [];
  const notes: string[] = [];
  const clashes: BreakClash[] = [];
  const start = clockToMinutes(setup.start) ?? 510;
  const pending = [...fixedBreak("lunch", "Lunch", "lunch", setup.lunchStart, setup.lunchEnd), ...fixedBreak("break", "Short break", "the short break", setup.breakStart, setup.breakEnd)].sort((a, b) => a.start - b.start);
  let cursor = start;
  let periodNo = 0;

  // Time to come in, then the assembly, then the first period (a negative time is a mistake `setupProblems` says; nothing is made of it here).
  const arrival = Math.max(0, setup.arrivalMinutes ?? 0);
  if (arrival > 0) {
    slots.push(row("break", ARRIVAL_LABEL, cursor, cursor + arrival));
    cursor += arrival;
  }
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
        const length = next.end - next.start;
        clashes.push({
          kind: next.kind,
          what: next.what,
          period: periodNo,
          periodStart: minutesToClock(cursor),
          periodEnd: minutesToClock(Math.min(end, 1439)),
          periodMinutes: setup.periodMinutes,
          breakStart: minutesToClock(next.start),
          moveTo: { start: minutesToClock(Math.min(end, 1439)), end: minutesToClock(Math.min(end + length, 1439)) },
          earlier: periodNo > 1 ? { start: minutesToClock(cursor), end: minutesToClock(Math.min(cursor + length, 1439)) } : null,
        });
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
  return { slots, notes, clashes };
}

/** The first break of a day that starts inside a period (it would cut that period short), or null. */
export const breakClash = (setup: DaySetup): BreakClash | null => generateDay(setup).clashes[0] ?? null;

/** The clash the screen says (with its way out): only once the break times themselves are right (an overlap or a missing time is said first). */
export const visibleClash = (setup: DaySetup): BreakClash | null => (setupProblems(setup).length === 0 ? breakClash(setup) : null);

/** Minutes between two times of day ("10:05", "10:30" is 25). */
const minutesBetween = (from: string, to: string) => Math.abs((clockToMinutes(to) ?? 0) - (clockToMinutes(from) ?? 0));

/**
 * "Lunch starts at 10:30, in the middle of Period 3 (10:05 to 10:45). Move it 25 min earlier (to 10:05) or 15 min later (to 10:45) so that every
 * period is 40 min." (2026-11-22: how many minutes each way, so the periods and the lunch line up.)
 */
export function clashMessage(clash: BreakClash): string {
  const name = clash.what === "lunch" ? "Lunch" : `${clash.what[0].toUpperCase()}${clash.what.slice(1)}`;
  const later = `${minutesBetween(clash.breakStart, clash.moveTo.start)} min later (to ${clash.moveTo.start})`;
  const ways = clash.earlier ? `${minutesBetween(clash.earlier.start, clash.breakStart)} min earlier (to ${clash.earlier.start}) or ${later}` : later;
  return `${name} starts at ${clash.breakStart}, in the middle of Period ${clash.period} (${clash.periodStart} to ${clash.periodEnd}). Move it ${ways} so that every period is ${formatMinutes(clash.periodMinutes)}.`;
}

/** One pair of times (a lunch, a short break) moved together; both stay as they are when either would leave the day. */
function shiftPair(from: string | null, to: string | null, delta: number): [string | null, string | null] {
  if (from === null || to === null) return [from, to];
  const a = shiftClock(from, delta);
  const b = shiftClock(to, delta);
  return a !== null && b !== null ? [a, b] : [from, to];
}

/** A day's lunch and short break moved by some minutes, the start left as it is (the start is what the head just changed). */
export function shiftBreaks(setup: DaySetup, delta: number): DaySetup {
  const [lunchStart, lunchEnd] = shiftPair(setup.lunchStart, setup.lunchEnd, delta);
  const [breakStart, breakEnd] = shiftPair(setup.breakStart, setup.breakEnd, delta);
  return { ...setup, lunchStart, lunchEnd, breakStart, breakEnd };
}

/** A whole day moved by some minutes: the start, the lunch and the short break; the length of a period and how many stay. Null when any of it would leave the day. */
export function shiftSetup(setup: DaySetup, delta: number): DaySetup | null {
  const start = shiftClock(setup.start, delta);
  if (start === null) return null;
  const moved = shiftBreaks({ ...setup, start }, delta);
  const same = (a: string | null, b: string | null) => a === b;
  // A break that did not move (it would have left the day) means the day cannot move as a whole.
  const stuck = (setup.lunchStart !== null && same(setup.lunchStart, moved.lunchStart)) || (setup.breakStart !== null && same(setup.breakStart, moved.breakStart));
  return delta !== 0 && stuck ? null : moved;
}

/** The rows of a day moved by some minutes, kinds and names kept; null when any would leave the day. */
export function shiftSlots(slots: readonly Slot[], delta: number): Slot[] | null {
  const moved: Slot[] = [];
  for (const slot of slots) {
    const start = shiftClock(slot.start, delta);
    const end = shiftClock(slot.end, delta);
    if (start === null || end === null) return null;
    moved.push({ ...slot, start, end });
  }
  return moved;
}

/**
 * The head's numbers behind a day's rows, to change them: the start, the usual length of a period (the most common one), the lunch, the time to
 * come in ("Arrival", the first row) and an assembly before the first period, and the short breaks. A new timing starts from the usual day.
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
    } else if (i === 0 && seen === 0 && s.label === ARRIVAL_LABEL) setup.arrivalMinutes = s.to - s.from;
    // The assembly: the first row, or the one straight after the time to come in.
    else if (seen === 0 && (i === 0 || (i === 1 && setup.arrivalMinutes))) setup.assemblyMinutes = s.to - s.from;
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
  // Classes typed before school starts (and its assembly): the earliest they can start, in words.
  const opens = clockToMinutes(setup.start);
  if ((setup.arrivalMinutes ?? 0) < 0 && opens !== null) {
    const earliest = minutesToClock(Math.min(opens + setup.assemblyMinutes, 1439));
    found.push(setup.assemblyMinutes > 0 ? `Classes can start at ${earliest} at the earliest: school starts at ${setup.start}, then the ${formatMinutes(setup.assemblyMinutes)} assembly` : `Classes can start at ${setup.start} at the earliest, when school starts`);
  }
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
