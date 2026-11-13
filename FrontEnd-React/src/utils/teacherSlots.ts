import type { GridView } from "../types";
import { shortDate } from "./weekDates";

/** One period of the class's week as a teacher is given a subject: where it can go, and if it cannot, why. */
export type SlotState = "free" | "here" | "taken" | "busy" | "off";

export interface SlotCell {
  day: number;
  period: number;
  state: SlotState;
  /** What stands in the way (the subject the class has there, the other class, the day off), or "". */
  note: string;
  /** The subject that is in this period when it is not free: the class's own (taken), or the one the teacher teaches in another class (busy). "" otherwise. */
  subject: string;
  /** The clock time of the period on this day ("13:45", "14:25"): a class has its own timing, so period 1 is not the same hour everywhere. */
  start: string;
  end: string;
}

export interface SlotRow {
  day: number;
  name: string;
  /** By period (index 0 = period 1); null where this day has no such period. */
  cells: (SlotCell | null)[];
}

export interface SlotTable {
  /** The most periods any day has. */
  periods: number;
  rows: SlotRow[];
  /** By period (index 0 = period 1): its hours as "09:30 – 10:10" when every day that has it runs it then, else null (each cell says its own). */
  times: (string | null)[];
}

/** "2:5" = Tuesday, period 5. */
export const slotKey = (day: number, period: number) => `${day}:${period}`;

/**
 * The class's week for giving a teacher a subject (`GET /timetable/grid` read once): a row for each day the class has, a cell for each of its
 * periods. A period that has the subject already is `here`; one the class uses for another subject is `taken` (the class's claim comes first);
 * one where the teacher is teaching another class is `busy`; every period of a day the teacher does not come is `off`; the rest are `free`.
 * It only reads: the server checks the same rules again before it keeps anything.
 */
export function slotTable(grid: GridView, subjectId: string, teacher: { id: string; offDays: number[] }): SlotTable {
  const nameOf = (id: string) => grid.allotments.find((a) => a.subjectId === id)?.subjectName ?? "Another subject";
  const rows: SlotRow[] = grid.days.map((d) => {
    const cells: (SlotCell | null)[] = [];
    for (const slot of d.slots) {
      if (slot.kind !== "period" || slot.period === null) continue;
      const period = slot.period;
      const here = grid.cells.find((c) => c.day === d.day && c.period === period);
      const busy = grid.busy.find((b) => b.day === d.day && b.period === period && b.teacherId === teacher.id);
      let state: SlotState = "free";
      let note = "";
      let subject = "";
      if (here?.lessons.some((l) => l.subjectId === subjectId)) state = "here";
      else if (here && here.lessons.length > 0) {
        state = "taken";
        note = here.lessons.map((l) => nameOf(l.subjectId)).join(" and ");
        subject = note;
      } else if (teacher.offDays.includes(d.day)) {
        state = "off";
        note = `Does not come on ${d.name}`;
      } else if (busy) {
        state = "busy";
        note = `${busy.where} (${busy.subjectName})`;
        subject = busy.subjectName;
      }
      cells[period - 1] = { day: d.day, period, state, note, subject, start: slot.start, end: slot.end };
    }
    return { day: d.day, name: d.name, cells: Array.from({ length: cells.length }, (_, i) => cells[i] ?? null) };
  });
  const periods = Math.max(0, ...rows.map((r) => r.cells.length));
  const padded = rows.map((r) => ({ ...r, cells: Array.from({ length: periods }, (_, i) => r.cells[i] ?? null) }));
  const times = Array.from({ length: periods }, (_, i) => {
    const hours = new Set(padded.flatMap((r) => (r.cells[i] ? [`${r.cells[i]!.start} – ${r.cells[i]!.end}`] : [])));
    return hours.size === 1 ? [...hours][0] : null;
  });
  return { periods, rows: padded, times };
}

/**
 * The chosen periods as lines a person reads: "Period 3 · 09:50 – 10:30 · Mon 9 Nov, Tue 10 Nov (every week)": the period's number, its hours
 * (left out when those days run it at different times), the days with their dates (`dates`, the first date each weekday comes in the seven
 * days being offered; the weekday alone without them) and that it then repeats every week.
 */
export function describeChosen(keys: readonly string[], table: SlotTable, dates?: Map<number, Date>): string[] {
  const byPeriod = new Map<number, number[]>();
  for (const key of keys) {
    const [day, period] = key.split(":").map(Number);
    byPeriod.set(period, [...(byPeriod.get(period) ?? []), day]);
  }
  return [...byPeriod]
    .sort(([a], [b]) => a - b)
    .map(([period, days]) => {
      const sorted = days.sort((a, b) => (dates?.get(a)?.getTime() ?? a) - (dates?.get(b)?.getTime() ?? b));
      const cells = sorted.flatMap((day) => {
        const cell = table.rows.find((r) => r.day === day)?.cells[period - 1];
        return cell ? [cell] : [];
      });
      const hours = new Set(cells.map((c) => `${c.start} – ${c.end}`));
      const names = sorted
        .map((day) => {
          const name = (table.rows.find((r) => r.day === day)?.name ?? "").slice(0, 3);
          const date = dates?.get(day);
          return date ? `${name} ${shortDate(date)}` : name;
        })
        .join(", ");
      return `Period ${period}${hours.size === 1 ? ` · ${[...hours][0]}` : ""} · ${names}${dates ? ", then every week" : " (every week)"}`;
    });
}

/** The chosen periods in words, by period with their days: "period 3: Mon, Tue, Wed; period 5: Fri". */
export function describeSlots(keys: readonly string[], table: SlotTable): string {
  const byPeriod = new Map<number, number[]>();
  for (const key of keys) {
    const [day, period] = key.split(":").map(Number);
    byPeriod.set(period, [...(byPeriod.get(period) ?? []), day]);
  }
  const short = (day: number) => (table.rows.find((r) => r.day === day)?.name ?? "").slice(0, 3);
  return [...byPeriod]
    .sort(([a], [b]) => a - b)
    .map(([period, days]) => `period ${period}: ${days.sort((a, b) => a - b).map(short).join(", ")}`)
    .join("; ");
}
