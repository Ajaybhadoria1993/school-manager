import { Check } from "lucide-react";
import { DAY_NAMES, DAY_SHORT } from "../../constants/timetable";
import { isPast, type WindowColumn } from "../../utils/assignWindow";
import { cn } from "../../utils/helpers";
import { shortDate } from "../../utils/weekDates";
import { slotKey, type SlotCell, type SlotTable } from "../../utils/teacherSlots";

/**
 * How a period looks and reads: a free one says "Free" and can be chosen; one that has a subject says which (its first letters on the cell, all of
 * it on hover and to a screen reader): grey for another subject of this class, amber for the one the teacher teaches in another class; one of
 * today that is already over says "Over".
 */
function look(cell: SlotCell, on: boolean, teacherName: string, blockedByLimit: boolean, over: boolean) {
  if (over) return { name: "already over today", word: "Over", tone: "bg-surface-muted text-foreground-muted/60 border-border/60", icon: false };
  if (cell.state === "here") return { name: "already in the timetable", word: null, tone: "bg-success-soft text-success border-success/30", icon: true };
  if (cell.state === "taken") return { name: cell.note, word: cell.subject.slice(0, 3), tone: "bg-surface-muted text-foreground-muted border-border", icon: false };
  if (cell.state === "busy") return { name: `${teacherName} is in ${cell.note}`, word: cell.subject.slice(0, 3), tone: "bg-warning-soft text-warning border-warning/30", icon: false };
  if (cell.state === "off") return { name: cell.note, word: "Off", tone: "bg-surface-muted text-foreground-muted/70 border-border", icon: false };
  if (on) return { name: "", word: null, tone: "bg-primary text-primary-foreground border-primary", icon: true };
  return { name: "", word: "Free", tone: cn("bg-surface border-border font-medium text-foreground-muted", blockedByLimit ? "opacity-50" : "hover:border-primary/60 hover:bg-primary-soft/60 hover:text-primary-deep"), icon: false };
}

/**
 * The class's week for giving a teacher a subject (Assign class), laid out like the class's own timetable: a **row for each period** ("Period 3"
 * with its hours, "09:50 – 10:30") and a **column for each of the next seven days** (`columns`, in the order of the calendar, each with its
 * date, today marked: they start today while the class has a period to come today and tomorrow once its school day is over, because a period that
 * is gone cannot be given). A day the class has no school is a greyed "No school" column; a period of today that is already over says "Over".
 * A free period is chosen with a click; **the period's name at the left of a row** chooses it on every free day at once ("period 3 every day"),
 * and again takes them off. A period the class uses for another subject, one where the teacher is in another class, and a day the teacher does
 * not come cannot be chosen and say why; a period that has the subject already is shown ticked and stays. At most `capacity` periods are chosen
 * (the periods a week the subject still has to place). It only collects the choice (`chosen`, "weekday:period" keys): Assign sends it.
 *
 * A class has its own timing: period 1 of one class is at 13:45 and of another at 09:30, so a teacher in two classes at "the same period" is not
 * necessarily in two places at once (the server compares the clock). A timetable repeats every week: the date is when a weekday comes first.
 */
export function TeacherPeriodGrid({
  table,
  columns,
  label,
  teacherName,
  chosen,
  capacity,
  onChange,
  now,
}: {
  table: SlotTable;
  columns: WindowColumn[];
  label: string;
  teacherName: string;
  chosen: string[];
  capacity: number;
  onChange: (next: string[]) => void;
  now?: Date;
}) {
  const moment = now ?? new Date();
  const picked = new Set(chosen);
  const full = chosen.length >= capacity;
  const rowOf = (column: WindowColumn) => table.rows.find((r) => r.day === column.day);
  /** A period that can be chosen: free, and not already over today. */
  const choosable = (cell: SlotCell | null | undefined, column: WindowColumn) => !!cell && cell.state === "free" && !isPast(cell.end, column, moment);

  function toggle(cell: SlotCell) {
    const key = slotKey(cell.day, cell.period);
    if (picked.has(key)) return onChange(chosen.filter((k) => k !== key));
    if (!full) onChange([...chosen, key]);
  }

  function toggleRow(period: number) {
    const free = columns.flatMap((c) => {
      const cell = rowOf(c)?.cells[period - 1];
      return choosable(cell, c) ? [slotKey(cell!.day, period)] : [];
    });
    if (free.length > 0 && free.every((k) => picked.has(k))) return onChange(chosen.filter((k) => !free.includes(k)));
    const next = [...chosen];
    for (const k of free) if (!picked.has(k) && next.length < capacity) next.push(k);
    onChange(next);
  }

  const periods = Array.from({ length: table.periods }, (_, i) => i + 1);
  const anyFree = (period: number) => columns.some((c) => choosable(rowOf(c)?.cells[period - 1], c));

  return (
    <div className="overflow-x-auto">
      <table aria-label={`Days and periods of ${label}`} className="w-full min-w-[26rem] border-separate border-spacing-1 text-center">
        <thead>
          <tr>
            <th scope="col" className="w-28 text-left text-xs font-semibold text-foreground-muted">
              Period
            </th>
            {columns.map((c) => (
              <th key={c.date.getTime()} scope="col" aria-current={c.today ? "date" : undefined} className={cn("leading-tight", c.today ? "text-primary-deep" : rowOf(c) ? "text-foreground" : "text-foreground-muted/60")}>
                <span className="block text-xs font-semibold">{DAY_SHORT[c.day]}</span>{" "}
                <span className="block text-[10px] font-medium text-foreground-muted">{shortDate(c.date)}</span>
                {!rowOf(c) && (
                  <>
                    {" "}
                    <span className="block text-[9px] font-medium text-foreground-muted/70">No school</span>
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}>
              <th scope="row" className="p-0 text-left">
                <button
                  type="button"
                  aria-label={`Period ${p} on every day`}
                  title={`Choose period ${p} on every day`}
                  disabled={!anyFree(p)}
                  onClick={() => toggleRow(p)}
                  className="block w-full cursor-pointer rounded-md px-1.5 py-1 text-left leading-tight transition-colors hover:bg-primary-soft disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="block text-xs font-bold text-primary-deep">Period {p}</span>
                  {table.times[p - 1] && <span className="block text-[10px] font-medium text-foreground-muted">{table.times[p - 1]}</span>}
                </button>
              </th>
              {columns.map((c) => {
                const cell = rowOf(c)?.cells[p - 1];
                // A day the class has no school, or a period it does not have that day: nothing to choose.
                if (!cell) return <td key={c.date.getTime()} />;
                const key = slotKey(cell.day, cell.period);
                const on = picked.has(key);
                const over = isPast(cell.end, c, moment);
                const blockedByLimit = !on && cell.state === "free" && !over && full;
                const shown = look(cell, on, teacherName, blockedByLimit, over);
                const name = `${DAY_NAMES[c.day]} period ${p}${shown.name ? `: ${shown.name}` : ""}`;
                return (
                  <td key={c.date.getTime()} className="p-0">
                    <button
                      type="button"
                      aria-label={name}
                      aria-pressed={cell.state === "free" && !over ? on : cell.state === "here"}
                      title={`${name} (${cell.start}–${cell.end})`}
                      disabled={cell.state !== "free" || blockedByLimit || over}
                      onClick={() => toggle(cell)}
                      className={cn(
                        "flex h-9 w-full min-w-9 items-center justify-center rounded-md border text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        shown.tone,
                        cell.state === "free" && !blockedByLimit && !over ? "cursor-pointer" : "cursor-default"
                      )}
                    >
                      {shown.icon ? <Check className="size-4" aria-hidden /> : shown.word}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
