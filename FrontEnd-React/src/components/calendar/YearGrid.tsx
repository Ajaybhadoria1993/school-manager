import { useMemo } from "react";
import type { CalendarEvent } from "../../types";
import { dayKinds, eventsTouching, fullDay, monthBounds, monthGrid, monthTitle, monthsOfYear } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import { KIND_LOOK } from "./look";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** One small month: its name (opens it as a month), and its days; a holiday is red, an event blue, today a filled blue. */
function MiniMonth({ month, events, kinds, today, onPick, onOpenMonth }: { month: string; events: CalendarEvent[]; kinds: ReturnType<typeof dayKinds>; today: string; onPick: (day: string) => void; onOpenMonth: (month: string) => void }) {
  const weeks = useMemo(() => monthGrid(month), [month]);
  const { from, to } = monthBounds(month);
  const inMonth = eventsTouching(events, from, to);
  const holidays = inMonth.filter((e) => e.kind === "holiday").length;
  const functions = inMonth.length - holidays;
  const isCurrent = today.slice(0, 7) === month;
  return (
    <section className={cn("rounded-2xl border bg-surface p-3 transition-shadow hover:shadow-raised", isCurrent ? "border-primary/40 ring-2 ring-primary/10" : "border-border")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={monthTitle(month)}
          onClick={() => onOpenMonth(month)}
          className={cn("cursor-pointer rounded-md px-1.5 py-0.5 text-sm font-extrabold tracking-tight transition-colors hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", isCurrent ? "text-primary-deep" : "text-foreground")}
        >
          {MONTH_NAMES[Number(month.slice(5, 7)) - 1]}
        </button>
        <span aria-hidden className="flex items-center gap-2 text-[11px] font-bold">
          {holidays > 0 && (
            <span className="flex items-center gap-1 text-danger">
              <span className={cn("size-2 rounded-full", KIND_LOOK.holiday.dot)} />
              {holidays}
            </span>
          )}
          {functions > 0 && (
            <span className="flex items-center gap-1 text-primary-deep">
              <span className={cn("size-2 rounded-full", KIND_LOOK.event.dot)} />
              {functions}
            </span>
          )}
        </span>
      </div>
      <div aria-hidden className="grid grid-cols-7 text-center text-[10px] font-bold text-foreground-muted">
        {INITIALS.map((initial, i) => (
          <span key={i} className={cn("py-1", i === 0 && "text-danger")}>
            {initial}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {weeks.flat().map((day, i) => {
          if (day.slice(0, 7) !== month) return <span key={day} />;
          const kind = kinds.get(day);
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              aria-label={`${fullDay(day)}${kind ? `: ${kind.titles.join(", ")}` : ""}`}
              aria-current={isToday ? "date" : undefined}
              title={kind ? kind.titles.join(", ") : undefined}
              onClick={() => onPick(day)}
              className={cn(
                "mx-auto flex size-7 cursor-pointer items-center justify-center rounded-full text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                isToday
                  ? "bg-primary font-bold text-primary-foreground shadow-sm"
                  : kind?.holiday
                    ? cn("font-bold hover:bg-danger-soft/70", KIND_LOOK.holiday.tile, kind.event && "ring-2 ring-inset ring-primary/50")
                    : kind?.event
                      ? cn("font-bold hover:bg-primary-soft/70", KIND_LOOK.event.tile)
                      : cn("font-medium hover:bg-surface-muted", i % 7 === 0 ? "text-danger" : "text-foreground")
              )}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The twelve months of a year, small, so a whole year of holidays and events is seen at once. Every day opens like it does in the month. */
export function YearGrid({ year, events, today, onPick, onOpenMonth }: { year: number; events: CalendarEvent[]; today: string; onPick: (day: string) => void; onOpenMonth: (month: string) => void }) {
  const kinds = useMemo(() => dayKinds(events, `${year}-01-01`, `${year}-12-31`), [events, year]);
  return (
    <div role="group" aria-label={String(year)} className="@container border-t border-border p-4">
      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4">
        {monthsOfYear(year).map((month) => (
          <MiniMonth key={month} month={month} events={events} kinds={kinds} today={today} onPick={onPick} onOpenMonth={onOpenMonth} />
        ))}
      </div>
    </div>
  );
}
