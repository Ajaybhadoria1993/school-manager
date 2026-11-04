/**
 * Times of day are kept as minutes after midnight (08:30 = 510): they add, compare and overlap without any date or time zone. The
 * API speaks "HH:MM" (24 hours), the way a bell schedule is written.
 */

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "08:30" -> 510; null for anything that is not a time of day. */
export function clockToMinutes(clock: string): number | null {
  const match = CLOCK.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 510 -> "08:30". */
export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface Span {
  start: number;
  end: number;
}

/** Two stretches of the day share some time (one ending as the other starts do not). */
export const overlaps = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;
