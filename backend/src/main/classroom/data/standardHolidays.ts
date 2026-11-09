/**
 * The holidays every school's calendar starts with, as on a calendar at home: the gazetted holidays of the Government of India
 * (DoPT "List of Holidays", Annexure-I: the order of 3 July 2025 for 2026, of 16 July 2026 for 2027).
 *
 * - **national**: Republic Day, Independence Day, Gandhi Jayanti. They stay on every school's calendar (the school cannot take them off).
 * - **festival**: the rest. They show on every calendar to begin with; a school that does not close for one takes it off (and may bring
 *   it back). The Islamic ones in particular move by a day with the moon, and the Government itself moved Bakrid 2026 from 27 to 28 May.
 *
 * Holi, Diwali, Eid... move with the moon, so each year's days are copied from the order when the Government publishes it (July of the
 * year before): add the next year to MOVING below. A year not written down still has the days that never move (26 Jan, 15 Aug, 2 Oct, 25 Dec).
 */

export type StandardSource = "national" | "festival";

export interface StandardHoliday {
  /** "2026-11-08-diwali": the day and the name, the same for every school. */
  key: string;
  title: string;
  /** "2026-11-08". */
  day: string;
  source: StandardSource;
}

type Row = [monthDay: string, title: string];

const NEVER_MOVE: [monthDay: string, title: string, source: StandardSource][] = [
  ["01-26", "Republic Day", "national"],
  ["08-15", "Independence Day", "national"],
  ["10-02", "Gandhi Jayanti", "national"],
  ["12-25", "Christmas", "festival"],
];

/** The festivals of each year that the Government has published, as month-day. */
const MOVING: Record<number, Row[]> = {
  2026: [
    ["03-04", "Holi"],
    ["03-21", "Id-ul-Fitr"],
    ["03-26", "Ram Navami"],
    ["03-31", "Mahavir Jayanti"],
    ["04-03", "Good Friday"],
    ["05-01", "Buddha Purnima"],
    ["05-28", "Id-ul-Zuha (Bakrid)"], // the order said 27 May; the Government moved it to the 28th (DoPT, 22 May 2026)
    ["06-26", "Muharram"],
    ["08-26", "Milad-un-Nabi"],
    ["09-04", "Janmashtami"],
    ["10-20", "Dussehra"],
    ["11-08", "Diwali"],
    ["11-24", "Guru Nanak Jayanti"],
  ],
  2027: [
    ["03-10", "Id-ul-Fitr"],
    ["03-23", "Holi"],
    ["03-26", "Good Friday"],
    ["04-15", "Ram Navami"],
    ["04-19", "Mahavir Jayanti"],
    ["05-17", "Id-ul-Zuha (Bakrid)"],
    ["05-20", "Buddha Purnima"],
    ["06-16", "Muharram"],
    ["08-15", "Milad-un-Nabi"],
    ["08-25", "Janmashtami"],
    ["10-09", "Dussehra"],
    ["10-29", "Diwali"],
    ["11-14", "Guru Nanak Jayanti"],
  ],
};

/** A reading never goes further than this many years from the first day asked for. */
const MOST_YEARS = 10;

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const holiday = (year: number, monthDay: string, title: string, source: StandardSource): StandardHoliday => {
  const day = `${year}-${monthDay}`;
  return { key: `${day}-${slug(title)}`, title, day, source };
};

const years = new Map<number, StandardHoliday[]>();

/** One year's holidays in date order (and by name when two fall on one day). */
function ofYear(year: number): StandardHoliday[] {
  let list = years.get(year);
  if (!list) {
    list = [
      ...NEVER_MOVE.map(([monthDay, title, source]) => holiday(year, monthDay, title, source)),
      ...(MOVING[year] ?? []).map(([monthDay, title]) => holiday(year, monthDay, title, "festival")),
    ].sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
    years.set(year, list);
  }
  return list;
}

/** The holidays from one day to another, both included ("2026-11-01" to "2026-11-30"), in date order. */
export function standardHolidaysBetween(from: string, to: string): StandardHoliday[] {
  const first = Number(from.slice(0, 4));
  const last = Math.min(Number(to.slice(0, 4)), first + MOST_YEARS);
  const found: StandardHoliday[] = [];
  for (let year = first; year <= last; year++) found.push(...ofYear(year).filter((h) => h.day >= from && h.day <= to));
  return found;
}

/** One holiday by its key, or null when the list has no such holiday. */
export function standardHolidayByKey(key: string): StandardHoliday | null {
  const match = /^(\d{4})-\d{2}-\d{2}-/.exec(key);
  return match ? (ofYear(Number(match[1])).find((h) => h.key === key) ?? null) : null;
}
