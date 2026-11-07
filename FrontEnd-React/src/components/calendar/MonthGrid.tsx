import { useMemo } from "react";
import type { CalendarEvent } from "../../types";
import { eventsOnDay, fullDay, monthGrid, monthTitle, shortDay, visibleLanes, weekLanes, type LaneSlot } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import { KIND_LOOK } from "./look";

const WEEKDAYS =["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** How many bars a day shows; the rest are counted ("+2 more"), the day opens them all. */
const MAX_ROWS = 3;

/** One bar on one day: it carries the colour and the name, and joins the bars of the days beside it into one strip. */
function Bar({ slot }: { slot: LaneSlot }) {
  const look = KIND_LOOK[slot.event.kind];
  return (
    <span
      aria-hidden
      className={cn(
        "block h-1.5 truncate text-[11px] font-semibold sm:h-6 sm:px-2 sm:text-xs sm:leading-6",
        look.bar,
        slot.startsHere ? cn("rounded-l-md", look.stripe) : "-ml-[7px] rounded-l-none",
        slot.endsHere ? "rounded-r-md" : "-mr-[7px] rounded-r-none"
      )}
    >
      {slot.label && <span className="hidden sm:inline">{slot.event.title}</span>}
    </span>
  );
}

/**
 * A month as a grid of days, Sunday first. Holidays and events are bars (a few days make one straight bar); every day is one button
 * (`onPick`): the school opens it to add or change, everyone else to read. The days of the months beside it are dimmed.
 */
export function MonthGrid({ month, events, today, onPick }: { month: string; events: CalendarEvent[]; today: string; onPick: (day: string) => void }) {
  const weeks = useMemo(() => monthGrid(month), [month]);
  return (
    <div role="group" aria-label={monthTitle(month)}>
      <div className="grid grid-cols-7 border-y border-border bg-surface-muted/60">
        {WEEKDAYS.map((name, i) => (
          <div key={name} className={cn("py-2 text-center text-xs font-bold uppercase tracking-wide", i === 0 ? "text-danger" : "text-foreground-muted")}>
            {name}
          </div>
        ))}
      </div>
      <div className="grid gap-px bg-border">
        {weeks.map((week) => {
          const { shown, more } = visibleLanes(weekLanes(events, week).lanes, MAX_ROWS);
          return (
            <div key={week[0]} className="grid grid-cols-7 gap-px">
              {week.map((day, col) => {
                const here = eventsOnDay(events, day);
                const holiday = here.some((e) => e.kind === "holiday");
                const isToday = day === today;
                const outside = day.slice(0, 7) !== month;
                const first = day.endsWith("-01");
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={`${fullDay(day)}${here.length ? `: ${here.map((e) => e.title).join(", ")}` : ""}`}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => onPick(day)}
                    className={cn(
                      "flex min-h-16 min-w-0 cursor-pointer flex-col gap-1 bg-surface px-1.5 pb-1.5 pt-1.5 text-left transition-colors hover:bg-primary-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 sm:min-h-[8.25rem]",
                      holiday && KIND_LOOK.holiday.cell,
                      outside && "bg-background"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 min-w-7 items-center justify-center self-start rounded-full px-1.5 text-sm font-semibold",
                        isToday ? "bg-primary text-primary-foreground shadow-sm" : col === 0 || holiday ? "text-danger" : "text-foreground",
                        outside && !isToday && "opacity-45"
                      )}
                    >
                      {first ? shortDay(day) : Number(day.slice(8))}
                    </span>
                    {shown.map((lane, row) => (lane[col] ? <Bar key={row} slot={lane[col]} /> : <span key={row} aria-hidden className="block h-1.5 sm:h-6" />))}
                    {more[col] > 0 && <span className="px-1 text-[11px] font-bold text-foreground-muted sm:text-xs">+{more[col]}<span className="hidden sm:inline"> more</span></span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
