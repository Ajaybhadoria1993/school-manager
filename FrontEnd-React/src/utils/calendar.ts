/** Days as "YYYY-MM-DD" (the calendar, attendance, the diary). */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const asDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

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
