import { CalendarService } from "../../classroom/services/calendar.service";

/**
 * Which of these days are holidays now (the school's own, or a standard one it has not taken off), by day, with the holiday's name. A paper
 * is checked against the holidays when it is put on a day; a holiday declared afterwards (a sudden one: heavy rain) does not undo the
 * paper, so the pages show it and the school moves the paper.
 */
export async function holidayNamesOn(tenantId: string, days: string[]): Promise<Map<string, string>> {
  if (days.length === 0) return new Map();
  const sorted = [...days].sort();
  const holidays = await CalendarService.holidaysBetween(tenantId, sorted[0], sorted[sorted.length - 1]);
  const names = new Map<string, string>();
  for (const day of sorted) {
    const found = holidays.find((h) => h.startDate <= day && h.endDate >= day);
    if (found) names.set(day, found.title);
  }
  return names;
}
