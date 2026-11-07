import { CalendarDays, CalendarPlus } from "lucide-react";
import { Button } from "@heroui/react";
import type { CalendarEvent } from "../../types";
import { longDay } from "../../utils/calendar";
import { AppModal } from "../ui/AppModal";
import { EventRow } from "./EventRow";

/**
 * What is on one day, opened by clicking it on the calendar: each holiday and event with its days and note. The people who run the
 * school can change or take away each one and add another for this day; everyone else only reads (the cross closes it).
 */
export function DayDialog({
  day,
  events,
  canEdit,
  onClose,
  onAdd,
  onEdit,
  onRemove,
}: {
  day: string;
  events: CalendarEvent[];
  canEdit: boolean;
  onClose: () => void;
  onAdd: (day: string) => void;
  onEdit: (e: CalendarEvent) => void;
  onRemove: (e: CalendarEvent) => void;
}) {
  return (
    <AppModal
      title={longDay(day)}
      icon={CalendarDays}
      onClose={onClose}
      footer={
        canEdit ? (
          <Button variant="primary" onPress={() => onAdd(day)}>
            <CalendarPlus className="size-4" aria-hidden />
            Add holiday or event
          </Button>
        ) : undefined
      }
    >
      {events.length === 0 ? (
        <p className="py-2 text-center text-sm text-foreground-muted">Nothing on this day</p>
      ) : (
        <ul className="-mx-2.5 space-y-1">
          {events.map((e) => (
            <EventRow key={e.id} event={e} canEdit={canEdit} onEdit={onEdit} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </AppModal>
  );
}
