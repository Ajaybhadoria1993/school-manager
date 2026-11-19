import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@heroui/react";
import type { DateRange } from "../../types";
import { fullDay, monthGrid, shiftMonth } from "../../utils/calendar";
import { lengthText, pickDay, pickerPresets, rangeText, startMonth, yearChoices, type Pick, type PickerPreset } from "../../utils/dateRange";
import { cn } from "../../utils/helpers";
import { AppModal } from "./AppModal";
import { Select } from "./Select";

const WEEK_HEAD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({ value: String(i + 1).padStart(2, "0"), label }));

const arrow =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-surface-muted text-primary-deep transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25";

/** One month of the calendar: its own days are buttons; the days of the months beside it that fill the first and last week are only shown, faint. */
function MonthGrid({ month, pick, today, max, onDay }: { month: string; pick: Pick; today: string; max?: string; onDay: (day: string) => void }) {
  const [year, m] = month.split("-").map(Number);
  const title = `${MONTH_NAMES[m - 1]} ${year}`;
  const single = pick.from === pick.to;
  return (
    <div>
      <p className="pb-2 text-sm font-semibold text-foreground">
        {MONTH_NAMES[m - 1].slice(0, 3)} {year}
      </p>
      <table aria-label={title} className="w-full border-separate border-spacing-y-0.5 text-center">
        <thead>
          <tr>
            {WEEK_HEAD.map((d) => (
              <th key={d} scope="col" className="pb-1 text-xs font-medium text-foreground-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month).map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const date = Number(day.slice(8));
                if (day.slice(0, 7) !== month) {
                  return (
                    <td key={day} aria-hidden className="text-xs text-foreground-muted/40">
                      {date}
                    </td>
                  );
                }
                const start = day === pick.from;
                const end = day === pick.to;
                const ends = start || end;
                const inside = day > pick.from && day < pick.to;
                const off = max !== undefined && day > max;
                return (
                  <td key={day} className={cn("p-0", (inside || (ends && !single)) && "bg-primary-soft", start && !single && "rounded-l-full", end && !single && "rounded-r-full")}>
                    <button
                      type="button"
                      disabled={off}
                      aria-pressed={ends}
                      aria-label={fullDay(day)}
                      onClick={() => onDay(day)}
                      className={cn(
                        "mx-auto grid size-9 cursor-pointer place-items-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                        ends ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-primary-soft",
                        day === today && !ends && "font-semibold underline decoration-primary decoration-2 underline-offset-4",
                        off && "cursor-not-allowed opacity-35 hover:bg-transparent"
                      )}
                    >
                      {date}
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

/**
 * The window "Select date range" (2026-11-17), the reference's: the days picked so far and how many ("17 Nov 26 — 17 Nov 26 · 1 day"), the
 * ready-made ranges on the left, and on the right a calendar of two months with arrows and a month and a year box. Click a first day, then a
 * last one. Nothing changes until Apply; Cancel (or the cross) leaves it as it was. `max` is the last day that can be picked (none for a
 * screen that may look ahead).
 */
export function DateRangeModal({
  range,
  today,
  max,
  presets,
  onApply,
  onClose,
}: {
  range: DateRange;
  today: string;
  max?: string;
  presets?: PickerPreset[];
  onApply: (range: DateRange) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<Pick>({ ...range, open: false });
  const [month, setMonth] = useState(startMonth(range));
  const [year, monthNo] = month.split("-");
  const ready = presets ?? pickerPresets(today);

  return (
    <AppModal
      title="Select date range"
      icon={CalendarDays}
      size="lg"
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onPress={() => onApply({ from: pick.from, to: pick.to })}>
            Apply
          </Button>
        </>
      }
    >
      <p aria-live="polite" className="text-sm font-medium text-foreground-muted">
        {rangeText(pick)} · {lengthText(pick)}
      </p>
      <div className="grid gap-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
        <div role="group" aria-label="Ready-made ranges" className="flex flex-wrap gap-1.5 sm:flex-col sm:gap-0.5">
          {ready.map((p) => {
            const on = !pick.open && p.from === pick.from && p.to === pick.to;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPick({ from: p.from, to: p.to, open: false });
                  setMonth(startMonth(p));
                }}
                className={cn(
                  "cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                  on ? "bg-primary-soft font-semibold text-primary-deep" : "text-foreground hover:bg-surface-muted"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2 pb-3">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className={arrow}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-36">
                <Select aria-label="Month" value={monthNo} options={MONTH_OPTIONS} onChange={(v) => v && setMonth(`${year}-${v}`)} />
              </div>
              <div className="w-24">
                <Select aria-label="Year" value={year} options={yearChoices(today, month)} onChange={(v) => v && setMonth(`${v}-${monthNo}`)} />
              </div>
            </div>
            <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className={arrow}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <MonthGrid month={month} pick={pick} today={today} max={max} onDay={(day) => setPick((p) => pickDay(p, day))} />
            <div className="hidden sm:block">
              <MonthGrid month={shiftMonth(month, 1)} pick={pick} today={today} max={max} onDay={(day) => setPick((p) => pickDay(p, day))} />
            </div>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
