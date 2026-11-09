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
export function RangeFilter({ range, onChange, idPrefix }: { range: DateRange; onChange: (range: DateRange) => void; idPrefix: string }) {
  const today = todayInIndia();
  const presets = rangePresets(today);
  const set = (patch: Partial<DateRange>) => {
    const next = { ...range, ...patch };
    if (next.from && next.to && next.from <= next.to) onChange(next);
  };

  return (
    <div role="group" aria-label="Dates" className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <Field id={`${idPrefix}-from`} label="From" quiet className="w-56">
        <DateBox id={`${idPrefix}-from`} label="From" value={range.from} onChange={(from) => set({ from })} max={today} />
      </Field>
      <Field id={`${idPrefix}-to`} label="To" quiet className="w-56">
        <DateBox id={`${idPrefix}-to`} label="To" value={range.to} onChange={(to) => set({ to })} />
      </Field>
      <div className="flex flex-wrap gap-1.5 pb-0.5">
        {presets.map((p) => {
          const on = range.from === p.from && range.to === p.to;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ from: p.from, to: p.to })}
              className={cn(
                "h-10 rounded-xl border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
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
