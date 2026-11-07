import { useState } from "react";
import { CalendarPlus, Pencil } from "lucide-react";
import { Button } from "@heroui/react";
import { useCreateEventMutation, useUpdateEventMutation } from "../../redux/api/classroomApi";
import type { CalendarEvent, CalendarKind } from "../../types";
import { addDays } from "../../utils/calendar";
import { todayInIndia } from "../../utils/students";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { cn } from "../../utils/helpers";

const KINDS: { value: CalendarKind; label: string }[] = [
  { value: "holiday", label: "Holiday" },
  { value: "event", label: "Event" },
];

/**
 * Add (or change) a holiday or an event: its name, Holiday or Event, the first day (Today / Tomorrow in one click; a day clicked on the
 * calendar is already there, `initialDay`), the last day for a few days (empty: one day), a note. Save closes it and the page says it is
 * done (`onDone`).
 */
export function EventDialog({ event, initialDay, onClose, onDone }: { event: CalendarEvent | null; initialDay?: string; onClose: () => void; onDone: (title: string, message: string) => void }) {
  const [create] = useCreateEventMutation();
  const [update] = useUpdateEventMutation();
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<CalendarKind>(event?.kind ?? "holiday");
  const [startDate, setStartDate] = useState(event?.startDate ?? initialDay ?? "");
  const [endDate, setEndDate] = useState(event && event.endDate !== event.startDate ? event.endDate : "");
  const [note, setNote] = useState(event?.note ?? "");
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const today = todayInIndia();
  const problems = {
    title: title.trim() === "" ? "Enter the name" : undefined,
    startDate: startDate === "" ? "Choose the first day" : undefined,
    endDate: endDate !== "" && startDate !== "" && endDate < startDate ? "The last day cannot be before the first day" : undefined,
  };
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);

  function save() {
    setTried(true);
    if (problems.title || problems.startDate || problems.endDate) return;
    const input = { title: title.trim(), kind, startDate, endDate: endDate || startDate, note: note.trim() || null };
    void run(async () => {
      if (event) {
        await update({ id: event.id, ...input }).unwrap();
        onDone("Saved", `${input.title} is changed on the calendar.`);
      } else {
        await create(input).unwrap();
        onDone("Added to the calendar", `${input.title} is on the calendar. Teachers and parents see it.`);
      }
    });
  }

  return (
    <AppModal
      title={event ? `Change ${event.title}` : "Add holiday or event"}
      icon={event ? Pencil : CalendarPlus}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isPending={busy} onPress={save}>
            Save
          </Button>
        </>
      }
    >
      <Field id="event-title" label="Name" error={shown("title")}>
        <Input id="event-title" value={title} maxLength={80} placeholder="Diwali, Annual function..." aria-invalid={shown("title") ? true : undefined} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div role="radiogroup" aria-label="What it is" className="flex gap-2">
        {KINDS.map((k) => (
          <label
            key={k.value}
            className={cn(
              "inline-flex h-9 cursor-pointer items-center rounded-lg border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20",
              kind === k.value ? (k.value === "holiday" ? "border-danger/40 bg-danger-soft text-danger" : "border-primary/40 bg-primary-soft text-primary-deep") : "border-border bg-surface text-foreground-muted hover:text-foreground"
            )}
          >
            <input type="radio" name="event-kind" className="sr-only" checked={kind === k.value} onChange={() => setKind(k.value)} />
            {k.label}
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="event-start" label="First day" error={shown("startDate")}>
          <DateBox
            id="event-start"
            label="First day"
            value={startDate}
            onChange={setStartDate}
            invalid={!!shown("startDate")}
            shortcuts={[
              { label: "Today", value: today },
              { label: "Tomorrow", value: addDays(today, 1) },
            ]}
          />
        </Field>
        <Field id="event-end" label="Last day" optional error={shown("endDate")}>
          <DateBox id="event-end" label="Last day" value={endDate} onChange={setEndDate} min={startDate || undefined} invalid={!!shown("endDate")} />
        </Field>
      </div>
      <Field id="event-note" label="Note" optional>
        <Input id="event-note" value={note} maxLength={300} placeholder="School closed, wear the white uniform..." onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}
