import { cn } from "../../utils/helpers";
import { rangePresets } from "../../utils/attendance";
import { todayInIndia } from "../../utils/students";
import type { DateRange } from "../../types";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";

/**
 * The days a sheet is read for (2026-11-06): a From and a To box for any days (May to November), and the usual ones in one click: Today,
 * This month (the page opens on it), Last month, Last 3 months. A box left half-typed does not ask the server anything: the range
 * changes only when both days are whole and in order.
 */
export function RangeFilter({
  range,
  onChange,
  idPrefix,
  weeks = false,
  compact = false,
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
  idPrefix: string;
  /** Adds This week and Last week (the students' page). */
  weeks?: boolean;
  /** Smaller boxes and buttons, so the days and the usual ranges sit on one line inside a card of filters. */
  compact?: boolean;
}) {
  const today = todayInIndia();
  const presets = rangePresets(today, weeks);
  const set = (patch: Partial<DateRange>) => {
    const next = { ...range, ...patch };
    if (next.from && next.to && next.from <= next.to) onChange(next);
  };

  return (
    // Compact (inside a card of filters, on a desktop): the boxes and the buttons never wrap, the line is one line.
    <div role="group" aria-label="Dates" className={cn("flex flex-wrap items-end gap-y-3", compact ? "gap-x-3 min-[1420px]:flex-nowrap" : "gap-x-4")}>
      <Field id={`${idPrefix}-from`} label="From" quiet className={compact ? "w-48 shrink-0" : "w-56"}>
        <DateBox id={`${idPrefix}-from`} label="From" value={range.from} onChange={(from) => set({ from })} max={today} compact={compact} />
      </Field>
      <Field id={`${idPrefix}-to`} label="To" quiet className={compact ? "w-48 shrink-0" : "w-56"}>
        <DateBox id={`${idPrefix}-to`} label="To" value={range.to} onChange={(to) => set({ to })} compact={compact} />
      </Field>
      <div className={cn("flex flex-wrap gap-1.5 pb-0.5", compact && "min-[1420px]:flex-nowrap")}>
        {presets.map((p) => {
          const on = range.from === p.from && range.to === p.to;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ from: p.from, to: p.to })}
              className={cn(
                "border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                compact ? "h-8 shrink-0 whitespace-nowrap rounded-lg px-2 text-[12.5px]" : "h-10 rounded-xl px-3.5 text-sm",
                on ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/40" : "border-border bg-surface text-foreground hover:border-primary/50"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
