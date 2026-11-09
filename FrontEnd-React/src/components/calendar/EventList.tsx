import { CalendarRange } from "lucide-react";
import type { CalendarEvent } from "../../types";
import { monthTitle } from "../../utils/calendar";
import { Card } from "../ui/Card";
import { EventRow } from "./EventRow";

interface Row {
  event: CalendarEvent;
  taken: boolean;
}

/**
 * Beside the calendar: every holiday and event of what is shown (the month, or the year grouped by month), each with its days and note;
 * for the school also its pencil and bin, so the whole year can be looked after from one list. `events` are the ones in that stretch,
 * and `from` its first day: a break that began before it is listed under the first month. `takenOff` (only for the school) are the
 * standard festivals it took off in that stretch: each stays in the list where its day is, faded, with an arrow to bring it back.
 */
export function EventList({
  events,
  from,
  grouped,
  emptyText,
  canEdit,
  takenOff,
  onEdit,
  onRemove,
  onBring,
}: {
  events: CalendarEvent[];
  from: string;
  grouped: boolean;
  emptyText: string;
  canEdit: boolean;
  takenOff: CalendarEvent[];
  onEdit: (e: CalendarEvent) => void;
  onRemove: (e: CalendarEvent) => void;
  onBring: (e: CalendarEvent) => void;
}) {
  const rows: Row[] = [...events.map((event) => ({ event, taken: false })), ...(canEdit ? takenOff.map((event) => ({ event, taken: true })) : [])].sort(
    (a, b) => a.event.startDate.localeCompare(b.event.startDate) || a.event.title.localeCompare(b.event.title)
  );
  const monthOf = (e: CalendarEvent) => (e.startDate < from ? from : e.startDate).slice(0, 7);
  const groups = grouped
    ? [...rows.reduce((map, r) => map.set(monthOf(r.event), [...(map.get(monthOf(r.event)) ?? []), r]), new Map<string, Row[]>())]
    : [["", rows] as [string, Row[]]];
  return (
    // Beside the calendar it is as tall as the calendar and scrolls inside; under it (a narrow screen) it has a height of its own.
    <Card role="region" aria-label="Holidays and events" className="flex max-h-[34rem] flex-col overflow-hidden xl:absolute xl:inset-0 xl:max-h-none">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
          <CalendarRange className="size-4.5 text-primary" aria-hidden />
          Holidays &amp; events
        </h3>
        {events.length > 0 && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary-deep">{events.length}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-foreground-muted">{emptyText}</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
          {groups.map(([month, items]) => (
            <div key={month || "all"}>
              {month && <h4 className="px-2.5 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-foreground-muted">{monthTitle(month)}</h4>}
              <ul className="space-y-0.5">
                {items.map(({ event, taken }) => (
                  <EventRow key={`${event.id}${taken ? ":off" : ""}`} event={event} canEdit={canEdit} taken={taken} onEdit={onEdit} onRemove={onRemove} onBring={onBring} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
