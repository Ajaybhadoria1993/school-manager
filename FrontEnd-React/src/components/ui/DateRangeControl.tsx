import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { DateRange } from "../../types";
import { hasLater, rangeText, stepRange, type PickerPreset } from "../../utils/dateRange";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import { DateRangeModal } from "./DateRangeModal";

const square =
  "grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-border bg-surface text-foreground shadow-card transition-colors hover:border-primary/50 hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground";

/**
 * The date filter of the whole app (2026-11-17), the look of Infinity Medisetu's: an arrow, a box that says the days ("17 Nov 26 — 17 Nov 26"),
 * an arrow. The arrows move to the period before or after (a day, a week or a month, whichever the range is); the box opens the window
 * "Select date range" (`DateRangeModal`) with the ready-made ranges and a calendar. `noFuture`: attendance of days to come is not a thing to look
 * at, so the later arrow stops at today and the calendar greys the days after it. `today` is the day in India (tests give their own).
 */
export function DateRangeControl({
  range,
  onChange,
  noFuture = false,
  today = todayInIndia(),
  presets,
  className,
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
  noFuture?: boolean;
  today?: string;
  /** Other ready-made ranges than the usual (the school's home page counts a week Monday to Sunday). */
  presets?: PickerPreset[];
  className?: string;
}) {
  const [choosing, setChoosing] = useState(false);
  const canLater = !noFuture || hasLater(range, today);

  return (
    <>
      <div role="group" aria-label="Dates" className={cn("flex items-center gap-2", className)}>
        <button type="button" aria-label="Previous period" title="Previous period" onClick={() => onChange(stepRange(range, -1))} className={square}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setChoosing(true)}
          className="inline-flex h-10 min-w-0 cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-foreground shadow-card transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
        >
          {rangeText(range)}
          <CalendarDays className="size-4 shrink-0 text-foreground-muted" aria-hidden />
        </button>
        <button type="button" aria-label="Next period" title="Next period" disabled={!canLater} onClick={() => onChange(stepRange(range, 1))} className={square}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      {choosing && (
        <DateRangeModal
          range={range}
          today={today}
          max={noFuture ? today : undefined}
          presets={presets}
          onApply={(next) => {
            setChoosing(false);
            onChange(next);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
    </>
  );
}
