import { cn } from "../../utils/helpers";
import { MONTH_NAMES } from "../../constants/fees";
import { monthsFrom } from "../../utils/fees";

/** A list of classes to tick (a fee for several classes at once, the classes a chart is copied to). */
export function ClassChecks({
  classes,
  picked,
  onChange,
  label,
}: {
  classes: { id: string; name: string }[];
  picked: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const all = classes.length > 0 && classes.every((c) => picked.includes(c.id));
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-xs font-semibold">
        <button type="button" className="cursor-pointer text-primary hover:underline" onClick={() => onChange(all ? [] : classes.map((c) => c.id))}>
          {all ? "Clear all" : "Select all"}
        </button>
        <span className="text-foreground-muted">{picked.length} chosen</span>
      </div>
      <ul aria-label={label} className="grid max-h-52 gap-1.5 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-3">
        {classes.map((c) => (
          <li key={c.id}>
            <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-surface-muted", picked.includes(c.id) && "bg-primary-soft text-primary-deep")}>
              <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              {c.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The twelve months in the order of the session, to tick the ones a fee falls due in. */
export function MonthChips({ startMonth, picked, onChange, label }: { startMonth: number; picked: number[]; onChange: (months: number[]) => void; label: string }) {
  const toggle = (m: number) => onChange(picked.includes(m) ? picked.filter((x) => x !== m) : [...picked, m]);
  return (
    <ul aria-label={label} className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {monthsFrom(startMonth).map((m) => (
        <li key={m}>
          <label className="block">
            <input type="checkbox" className="peer sr-only" checked={picked.includes(m)} onChange={() => toggle(m)} />
            <span className="flex h-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-sm font-semibold text-foreground-muted transition-colors peer-checked:border-primary/40 peer-checked:bg-primary-soft peer-checked:text-primary-deep peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20">
              {MONTH_NAMES[m - 1]}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
