import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { comparisonLabel, dashboardPresets, rangeLabel, stepDays, todayLabel, type Days, type RangeTab } from "../../../utils/dashboardRange";
import { cn } from "../../../utils/helpers";
import { DateRangeModal } from "../../ui/DateRangeModal";

export { comparisonLabel };

const TABS: { key: Exclude<RangeTab, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

const arrow =
  "hidden size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface-muted text-primary-deep shadow-sm transition-all hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 active:scale-95 md:flex";

/**
 * The days the home page looks at, in the look of Infinity Medisetu's date tabs (2026-11-10): Today (with arrows to step a day), This Week,
 * This Month and Custom (any days). The tab that is on is filled blue; Today says its date ("Today, 10 Nov", "Yesterday, 9 Nov") and Custom
 * says its days once they are chosen. Custom opens the window "Select date range" (2026-11-17: ready-made ranges and a calendar, not two date
 * boxes); nothing changes until Apply, and Cancel leaves it as it was.
 */
export function DateFilter({
  tab,
  days,
  today,
  onTab,
  onDays,
}: {
  tab: RangeTab;
  days: Days;
  /** The day in India, for the words Today / Yesterday. */
  today: string;
  onTab: (tab: Exclude<RangeTab, "custom">) => void;
  /** Any days (Custom, or an arrow stepping Today): they replace the tab's own. */
  onDays: (days: Days, tab: RangeTab) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const step = (dir: -1 | 1) => onDays(stepDays(days, dir), "today");

  const pill = (on: boolean) =>
    cn(
      "inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 sm:flex-initial sm:px-3.5 sm:text-sm",
      on ? "bg-primary font-semibold text-primary-foreground shadow-sm shadow-primary/25" : "font-normal text-foreground-muted hover:text-foreground"
    );

  return (
    <>
      <div role="group" aria-label="Days" className="flex w-full max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-surface p-1 shadow-card sm:w-auto sm:gap-1">
        {TABS.map((t) => {
          const on = tab === t.key;
          const button = (
            <button key={t.key} type="button" aria-pressed={on} onClick={() => onTab(t.key)} className={cn(pill(on), t.key === "today" && on && "sm:min-w-[8.5rem]")}>
              {t.key === "today" && on ? todayLabel(days.from, today) : t.label}
            </button>
          );
          // Stepping is for Today only: a day is the one length that steps naturally.
          if (t.key !== "today" || !on) return button;
          return (
            <div key={t.key} className="flex flex-1 items-center gap-1 sm:flex-initial">
              <button type="button" aria-label="Previous day" title="Previous day" onClick={() => step(-1)} className={arrow}>
                <ChevronLeft className="size-4" strokeWidth={2.5} aria-hidden />
              </button>
              {button}
              <button type="button" aria-label="Next day" title="Next day" onClick={() => step(1)} className={arrow}>
                <ChevronRight className="size-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          );
        })}
        <button type="button" aria-pressed={tab === "custom"} onClick={() => setChoosing(true)} className={pill(tab === "custom")}>
          {tab === "custom" ? rangeLabel(days) : "Custom"}
          <CalendarDays className="hidden size-4 shrink-0 md:block" aria-hidden />
        </button>
      </div>

      {/* Custom opens the window "Select date range" (the whole app's date filter): ready-made ranges and a calendar of two months. */}
      {choosing && (
        <DateRangeModal
          range={days}
          today={today}
          presets={dashboardPresets(today)}
          onClose={() => setChoosing(false)}
          onApply={(range) => {
            onDays(range, "custom");
            setChoosing(false);
          }}
        />
      )}
    </>
  );
}
