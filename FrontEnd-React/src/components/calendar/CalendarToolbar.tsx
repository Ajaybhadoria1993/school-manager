import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { KIND_LOOK, countText } from "./look";

export type CalendarView = "month" | "year";
const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

/**
 * The bar above the calendar: the arrows (a month or a year before and after, by what is shown), what is shown ("November 2026" or
 * "2026"), Today, how many holidays and events are in it, and the Month / Year switch.
 */
export function CalendarToolbar({
  view,
  title,
  holidays,
  events,
  onView,
  onStep,
  onToday,
}: {
  view: CalendarView;
  title: string;
  holidays: number;
  events: number;
  onView: (view: CalendarView) => void;
  onStep: (direction: -1 | 1) => void;
  onToday: () => void;
}) {
  const unit = view === "month" ? "month" : "year";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="w-9 px-0" aria-label={`Previous ${unit}`} onClick={() => onStep(-1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button variant="outline" size="sm" className="w-9 px-0" aria-label={`Next ${unit}`} onClick={() => onStep(1)}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        {/* A month's name has a width of its own, so the buttons beside it do not move from month to month. */}
        <h2 className={cn("mx-1 text-xl font-bold text-foreground", view === "month" && "sm:min-w-44")}>{title}</h2>
        <Button variant="secondary" size="sm" onClick={onToday}>
          Today
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span aria-hidden className={cn("size-2.5 rounded-full", KIND_LOOK.holiday.dot)} />
          {countText("holiday", holidays)}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span aria-hidden className={cn("size-2.5 rounded-full", KIND_LOOK.event.dot)} />
          {countText("event", events)}
        </span>
        <div role="radiogroup" aria-label="View" className="inline-flex rounded-lg bg-surface-muted p-1">
          {VIEWS.map((v) => (
            <label
              key={v.value}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center rounded-md px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20",
                view === v.value ? "bg-surface text-primary-deep shadow-sm" : "text-foreground-muted hover:text-foreground"
              )}
            >
              <input type="radio" name="calendar-view" className="sr-only" checked={view === v.value} onChange={() => onView(v.value)} />
              {v.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
