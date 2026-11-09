const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-15" -> "15 Sep". */
export const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/** "2026-04-01" -> "1 Apr 2026". */
export const dayWithYear = (day: string) => `${shortDay(day)} ${day.slice(0, 4)}`;

/** 540 -> "9:00 AM", 750 -> "12:30 PM", 0 -> "12:00 AM": the way a school writes a time. */
export function clock12(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
