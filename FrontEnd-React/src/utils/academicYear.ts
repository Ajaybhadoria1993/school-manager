const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-04-01" -> "1 Apr 2026". The day is a calendar day, so it is read as written, never shifted by the time zone. */
export function formatDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return `${Number(match[3])} ${MONTHS_SHORT[Number(match[2]) - 1]} ${match[1]}`;
}

/** "1 Apr 2026 to 31 Mar 2027"; "" when either day is missing. */
export function formatDayRange(start: string, end: string): string {
  return start && end ? `${formatDay(start)} to ${formatDay(end)}` : "";
}

/** A Date's calendar day in UTC, "2026-04-01". */
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/**
 * A session that starts on the 1st of `startMonth` (1-12) of `year` and ends the day before the same date a year later:
 * April gives 1 Apr 2026 to 31 Mar 2027, January gives 1 Jan 2026 to 31 Dec 2026.
 */
export function sessionFrom(startMonth: number, year: number): { startDate: string; endDate: string } {
  return {
    startDate: dayOf(new Date(Date.UTC(year, startMonth - 1, 1))),
    endDate: dayOf(new Date(Date.UTC(year + 1, startMonth - 1, 0))),
  };
}

/** The name a school would usually give these days: "2026-2027", or "2026" for a year inside one calendar year; "" if unsure. */
export function suggestYearName(start: string, end: string): string {
  const from = /^(\d{4})-/.exec(start)?.[1];
  const to = /^(\d{4})-/.exec(end)?.[1];
  if (!from || !to || to < from) return "";
  return from === to ? from : `${from}-${to}`;
}

/** The checks the server makes too, for a message before anything is sent. Returns { field: message }. */
export function checkAcademicYear(name: string, start: string, end: string): Record<"name" | "startDate" | "endDate", string | undefined> {
  const startDay = start ? new Date(`${start}T00:00:00.000Z`) : null;
  const endDay = end ? new Date(`${end}T00:00:00.000Z`) : null;
  const trimmed = name.trim();
  return {
    name: trimmed.length < 4 ? "Enter the academic year name, for example 2026-2027." : !/^[A-Za-z0-9 /._-]+$/.test(trimmed) ? "Use only letters, digits, spaces and - / . _ in the name." : undefined,
    startDate: !startDay || Number.isNaN(startDay.getTime()) ? "Choose the start date." : undefined,
    endDate:
      !endDay || Number.isNaN(endDay.getTime())
        ? "Choose the end date."
        : startDay && !Number.isNaN(startDay.getTime()) && endDay.getTime() <= startDay.getTime()
          ? "The end date must be after the start date."
          : undefined,
  };
}
