import type { FeeStatus } from "../../types";

/** Active / Inactive / All as chips (the same radio group as Transport's lists). */
export function StatusChips({ value, onChange, name }: { value: FeeStatus; onChange: (value: FeeStatus) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label="Show" className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
      {(["active", "inactive", "all"] as const).map((v) => (
        <label key={v} className="relative">
          <input type="radio" name={name} className="peer sr-only" checked={value === v} onChange={() => onChange(v)} />
          <span className="inline-flex h-9 cursor-pointer items-center rounded-lg px-3.5 text-sm font-semibold text-foreground-muted transition-colors peer-checked:bg-primary-soft peer-checked:text-primary-deep peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20">
            {v === "active" ? "Active" : v === "inactive" ? "Inactive" : "All"}
          </span>
        </label>
      ))}
    </div>
  );
}
