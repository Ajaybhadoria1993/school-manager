import { useState } from "react";
import { CalendarClock, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { OTHER_SPECIAL_DAY, SPECIAL_DAY_TITLES } from "../../constants/timetable";
import { useRemoveSpecialDayMutation, useSaveSpecialDayMutation } from "../../redux/api/timetableApi";
import { dayProblem } from "../../utils/schoolWeek";
import { generateDay, setupFromSlots, type DaySetup } from "../../utils/timings";
import { addDays } from "../../utils/calendar";
import { todayInIndia } from "../../utils/students";
import type { ClassItem, SpecialDay } from "../../types";
import { ConfirmModal } from "../classes/ConfirmModal";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ChipPicker } from "../ui/ChipPicker";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { MultiSelect, Select } from "../ui/Select";
import { useToast } from "../ui/toast-context";
import { DayFields } from "./DayFields";
import { DayFigures, ToggleRow } from "./TimingParts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sat, 28 Nov". */
export function dayWords(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Sat, 28 Nov" for one day, "Thu, 3 Dec to Sun, 6 Dec" for days in a row. */
export const daysWords = (from: string, to: string) => (to && to !== from ? `${dayWords(from)} to ${dayWords(to)}` : dayWords(from));

const isPreset = (title: string) => (SPECIAL_DAY_TITLES as readonly string[]).includes(title);

/** "09:00 to 12:00", or "No classes" for a day without rows. */
const hoursOf = (day: Pick<SpecialDay, "slots">) => (day.slots.length === 0 ? "No classes" : `${day.slots[0].start} to ${day.slots[day.slots.length - 1].end}`);
const classesOf = (day: Pick<SpecialDay, "classIds" | "classNames">) => (day.classIds.length === 0 ? "Whole school" : day.classNames.join(", "));

/**
 * One day with a timing of its own (2026-11-22, user: "alag button do, jisse kisi date ka time change kar du aur bata saku, jaise PTM hai to kis kis class
 * ka hai"): the first day and, for days in a row, the last one (2026-11-23: "3 se 6 tak"), what the day is (a list of the usual ones, and Other to
 * type another name), for the whole school or some classes, and that day's timing (the same boxes as the school's day, starting from the usual day)
 * or no classes at all. Save sends it; the classes' parents and teachers are told. An existing one can be changed or taken off.
 */
export function SpecialDayDialog({ day, usual, classes, onClose }: { day: SpecialDay | null; usual: DaySetup; classes: ClassItem[]; onClose: () => void }) {
  const { push } = useToast();
  const [save] = useSaveSpecialDayMutation();
  const { busy, error, run, clearError } = useSave(onClose);
  const today = todayInIndia();
  const [date, setDate] = useState(day?.date ?? "");
  // The last day of days in a row; "" (or the first day) for one day.
  const [endDate, setEndDate] = useState(day && day.endDate !== day.date ? day.endDate : "");
  // What the day is: one of the list, or Other with a name typed.
  const [kind, setKind] = useState(day ? (isPreset(day.title) ? day.title : OTHER_SPECIAL_DAY) : "");
  const [otherName, setOtherName] = useState(day && !isPreset(day.title) ? day.title : "");
  const title = kind === OTHER_SPECIAL_DAY ? otherName.trim() : kind;
  const last = endDate && endDate !== date ? endDate : date;
  const [scope, setScope] = useState<"all" | "some">(day && day.classIds.length > 0 ? "some" : "all");
  const [classIds, setClassIds] = useState<string[]>(day?.classIds ?? []);
  const [hasClasses, setHasClasses] = useState(day ? day.slots.length > 0 : true);
  const [setup, setSetup] = useState<DaySetup>(day && day.slots.length > 0 ? setupFromSlots(day.slots) : { ...usual });
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    clearError();
    set(v);
  };

  const rows = hasClasses ? generateDay(setup).slots : [];
  // Days in a row that have begun keep their first day when changed.
  const started = day !== null && date === day.date && date < today;
  const problem = !date
    ? "Choose the date"
    : date < today && !started
      ? "Choose today or a day to come"
      : last < date
        ? "The last day cannot be before the first"
        : !kind
          ? "Choose what the day is"
          : !title
            ? "Enter the name of the day"
        : scope === "some" && classIds.length === 0
          ? "Choose the classes"
          : hasClasses
            ? dayProblem(setup)
            : undefined;

  const send = () =>
    run(async () => {
      await save({ ...(day ? { id: day.id } : {}), date, endDate: last, title, classIds: scope === "all" ? [] : classIds, slots: rows }).unwrap();
      push("success", `${title} saved: ${daysWords(date, last)}`);
    });

  return (
    <AppModal
      title={day ? `Change ${day.title}` : "Special day"}
      icon={CalendarClock}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton variant="primary" isPending={busy} isDisabled={problem !== undefined} onPress={() => void send()}>
            Save
          </HeroButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="special-date" label="First day">
            <DateBox
              id="special-date"
              label="First day"
              value={date}
              min={today}
              clearable={false}
              onChange={edit(setDate)}
              shortcuts={[
                { label: "Today", value: today },
                { label: "Tomorrow", value: addDays(today, 1) },
              ]}
            />
          </Field>
          {/* Days in a row (2026-11-23): left empty, it is one day. */}
          <Field id="special-end" label="Last day" optional>
            <DateBox id="special-end" label="Last day" value={endDate} min={date || today} onChange={edit(setEndDate)} />
          </Field>
          <Field id="special-kind" label="What is the day">
            <Select
              id="special-kind"
              placeholder="Choose the day"
              value={kind}
              onChange={edit(setKind)}
              options={[...SPECIAL_DAY_TITLES.map((t) => ({ value: t, label: t })), { value: OTHER_SPECIAL_DAY, label: "Other (type a name)" }]}
            />
          </Field>
          {kind === OTHER_SPECIAL_DAY && (
            <Field id="special-title" label="Name of the day">
              <Input id="special-title" placeholder="Science fair" maxLength={40} value={otherName} onChange={(e) => edit(setOtherName)(e.target.value)} />
            </Field>
          )}
        </div>
        <Field id="special-scope" label="For">
          <ChipPicker
            label="For"
            value={scope}
            onChange={(v) => edit(setScope)(v as "all" | "some")}
            options={[
              { value: "all", label: "Whole school" },
              { value: "some", label: "Some classes" },
            ]}
          />
        </Field>
        {scope === "some" && (
          <Field id="special-classes" label="Classes">
            <MultiSelect id="special-classes" placeholder="Choose the classes" value={classIds} onChange={edit(setClassIds)} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
        )}
        <ToggleRow title="Classes this day" switchLabel="Classes this day" on={hasClasses} onToggle={edit(setHasClasses)} offText="No classes this day">
          <span className="text-sm text-foreground-muted">Set the timing below</span>
        </ToggleRow>
        {hasClasses && (
          <>
            <DayFigures slots={rows} />
            <DayFields adaptive showEnd idPrefix="special" name="Special day" value={setup} onChange={edit(setSetup)} />
          </>
        )}
        {problem && date && title && (
          <p role="alert" className="text-sm font-medium text-danger">
            {problem}
          </p>
        )}
        <ModalError message={error ? error.message : null} />
      </div>
    </AppModal>
  );
}

/**
 * The special days to come, on the School timings page: each with its date, what it is, for whom and its hours, and **Change** / **Take off** (asks
 * first). A day that is over is not listed (it stays as it was).
 */
export function SpecialDaysCard({ days, onChange, onAdd }: { days: SpecialDay[]; onChange: (day: SpecialDay) => void; onAdd: () => void }) {
  const { push } = useToast();
  const [remove] = useRemoveSpecialDayMutation();
  const [asking, setAsking] = useState<SpecialDay | null>(null);
  const today = todayInIndia();
  // Days in a row that have begun are still listed until their last day.
  const coming = days.filter((d) => (d.endDate || d.date) >= today);
  return (
    <Card role="region" aria-label="Special days" className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
            <Star className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-heading">Special days</h2>
            <p className="text-sm text-foreground-muted">A PTM, a half day or an event: one day or days in a row</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-4" aria-hidden />
          Add special day
        </Button>
      </div>
      {coming.length === 0 ? (
        <p className="text-sm text-foreground-muted">No special day coming</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {coming.map((d) => (
            <li key={d.id} aria-label={`${d.title} · ${daysWords(d.date, d.endDate)}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">
                  {d.title} <span className="font-semibold text-foreground-muted">· {daysWords(d.date, d.endDate)}</span>
                </p>
                <p className="text-xs text-foreground-muted">
                  {classesOf(d)} · {hoursOf(d)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`Change ${d.title}`} onClick={() => onChange(d)} className="cursor-pointer rounded-lg p-2 text-foreground-muted hover:bg-background hover:text-primary">
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button type="button" aria-label={`Take off ${d.title}`} onClick={() => setAsking(d)} className="cursor-pointer rounded-lg p-2 text-foreground-muted hover:bg-danger-soft hover:text-danger">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <ConfirmModal
          title={`Take off ${asking.title} (${daysWords(asking.date, asking.endDate)})?`}
          confirmLabel="Take off"
          onClose={() => setAsking(null)}
          onConfirm={async () => {
            await remove(asking.id).unwrap();
            push("success", `${asking.title} taken off`);
          }}
        >
          <p className="text-sm">{classesOf(asking)} will follow the usual timing that day.</p>
        </ConfirmModal>
      )}
    </Card>
  );
}
