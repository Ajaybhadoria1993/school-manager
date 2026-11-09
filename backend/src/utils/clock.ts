/**
 * The school's clock. A school is in India: its "today" and its bell ("school ends at 2:20 PM") are Indian time, whatever time zone the
 * server keeps. Code that needs to know what time it is asks here, so a test can set the time (`vi.spyOn(clock, "now")`) instead of
 * waiting for it.
 */
export const clock = {
  now: (): Date => new Date(),
};

const IST_OFFSET_MINUTES = 5 * 60 + 30;

export interface IndiaNow {
  /** "2026-11-05": the calendar day in India. */
  date: string;
  /** Minutes after midnight in India (09:00 = 540). */
  minutes: number;
  /** The very moment. */
  at: Date;
}

export function indiaNow(): IndiaNow {
  const at = clock.now();
  // India keeps one offset all year (no daylight saving), so the local day and minute are a fixed shift of UTC.
  const local = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000);
  return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), at };
}

/** The moment it is `minutes` after midnight on this Indian day ("2026-11-05", 540 = 9:00 AM there). */
export function instantAt(day: string, minutes: number): Date {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + (minutes - IST_OFFSET_MINUTES) * 60_000);
}
