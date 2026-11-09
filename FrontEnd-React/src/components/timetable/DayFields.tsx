import { MAX_BREAK_MINUTES, MAX_PERIOD_MINUTES, MAX_PERIODS, MIN_PERIOD_MINUTES } from "../../constants/timetable";
import { clockToMinutes, formatMinutes, generateDay, minutesToClock, type DaySetup } from "../../utils/timings";
import { cn } from "../../utils/helpers";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";

/**
 * A number box's text as a number. An empty box is 0 and is shown empty (`value || ""`), so a number can be cleared and typed again
 * (falling back to the old number would turn "4" into "14"); until it is filled the day says what is missing.
 */
const numberOf = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? 0 : Math.max(0, Math.round(Number(text))));

/**
 * A number of minutes: the unit is in the box ("40 min"), and from an hour up it is also said in words ("= 1 hr 30 min"), so 60 reads as
 * 1 hr. The browser's little arrows are hidden: they would sit on top of the words.
 */
function MinutesBox({ id, label, value, min, max, placeholder, onChange }: { id: string; label: string; value: number; min: number; max: number; placeholder?: string; onChange: (minutes: number) => void }) {
  return (
    <div className="relative">
      <Input
        id={id}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(numberOf(e.target.value))}
        className="pr-28 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center gap-1.5 text-sm text-foreground-muted">
        <span>min</span>
        {value >= 60 && <span className="font-semibold text-foreground">= {formatMinutes(value)}</span>}
      </span>
    </div>
  );
}

/** A break at its own time, on or off: "Lunch  10:30 to 11:00  30 min". Off, it is not in the day. */
function BreakRow({
  name,
  title,
  on,
  from,
  to,
  onToggle,
  onFrom,
  onTo,
}: {
  /** What the day is called, said to a screen reader with each box ("Usual day", "Saturday"). */
  name: string;
  /** "Lunch", "Short break". */
  title: string;
  on: boolean;
  from: string;
  to: string;
  onToggle: (on: boolean) => void;
  onFrom: (clock: string) => void;
  onTo: (clock: string) => void;
}) {
  const what = title.toLowerCase();
  const start = clockToMinutes(from);
  const end = clockToMinutes(to);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex h-10 basis-full cursor-pointer items-center gap-2 text-sm font-semibold text-foreground sm:w-36 sm:basis-auto">
        <input type="checkbox" className="size-4 accent-primary" aria-label={`${name}: ${what === "lunch" ? "lunch break" : what}`} checked={on} onChange={(e) => onToggle(e.target.checked)} />
        {title}
      </label>
      {on ? (
        <>
          <Input aria-label={`${name}: ${what} from`} type="time" className="min-w-0 flex-1 sm:w-36 sm:flex-none" value={from} onChange={(e) => onFrom(e.target.value)} />
          <span className="text-sm text-foreground-muted">to</span>
          <Input aria-label={`${name}: ${what} to`} type="time" className="min-w-0 flex-1 sm:w-36 sm:flex-none" value={to} onChange={(e) => onTo(e.target.value)} />
          {start !== null && end !== null && end > start && <span className="text-sm font-medium text-foreground-muted">{formatMinutes(end - start)}</span>}
        </>
      ) : (
        <span className="text-sm text-foreground-muted">Not in this day</span>
      )}
    </div>
  );
}

/** The short break's times when it is first turned on: ten minutes after the second period. */
function firstBreak(value: DaySetup): Pick<DaySetup, "breakStart" | "breakEnd"> {
  const start = Math.min((clockToMinutes(value.start) ?? 510) + value.assemblyMinutes + 2 * value.periodMinutes, 1429);
  return { breakStart: minutesToClock(start), breakEnd: minutesToClock(start + 10) };
}

/**
 * The few numbers a head knows about a school day: when school starts, how long a period is (in minutes), how many periods, an assembly
 * (minutes, if the school has one), and the lunch and a short break, each from when to when. `idPrefix` keeps the boxes of two days apart;
 * `name` ("Usual day", "Saturday") is said to a screen reader with each box.
 */
export function DayFields({ idPrefix, name, value, onChange }: { idPrefix: string; name: string; value: DaySetup; onChange: (next: DaySetup) => void }) {
  const change = (patch: Partial<DaySetup>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field quiet id={`${idPrefix}-start`} label="School starts">
          <Input id={`${idPrefix}-start`} aria-label={`${name}: school starts`} type="time" value={value.start} onChange={(e) => change({ start: e.target.value })} />
        </Field>
        <Field quiet id={`${idPrefix}-length`} label="Each period">
          <MinutesBox id={`${idPrefix}-length`} label={`${name}: minutes in a period`} min={MIN_PERIOD_MINUTES} max={MAX_PERIOD_MINUTES} value={value.periodMinutes} onChange={(periodMinutes) => change({ periodMinutes })} />
        </Field>
        <Field quiet id={`${idPrefix}-periods`} label="Periods in the day">
          <Input id={`${idPrefix}-periods`} aria-label={`${name}: number of periods`} type="number" min={1} max={MAX_PERIODS} value={value.periods || ""} onChange={(e) => change({ periods: numberOf(e.target.value) })} />
        </Field>
        <Field quiet id={`${idPrefix}-assembly`} label="Assembly (optional)">
          <MinutesBox id={`${idPrefix}-assembly`} label={`${name}: assembly minutes`} min={0} max={MAX_BREAK_MINUTES} value={value.assemblyMinutes} placeholder="None" onChange={(assemblyMinutes) => change({ assemblyMinutes })} />
        </Field>
      </div>

      <div className="space-y-2.5">
        <BreakRow
          name={name}
          title="Lunch"
          on={value.lunchStart !== null}
          from={value.lunchStart ?? ""}
          to={value.lunchEnd ?? ""}
          onToggle={(on) => change(on ? { lunchStart: "10:30", lunchEnd: "11:00" } : { lunchStart: null, lunchEnd: null })}
          onFrom={(lunchStart) => change({ lunchStart })}
          onTo={(lunchEnd) => change({ lunchEnd })}
        />
        <BreakRow
          name={name}
          title="Short break"
          on={value.breakStart !== null}
          from={value.breakStart ?? ""}
          to={value.breakEnd ?? ""}
          onToggle={(on) => change(on ? firstBreak(value) : { breakStart: null, breakEnd: null })}
          onFrom={(breakStart) => change({ breakStart })}
          onTo={(breakEnd) => change({ breakEnd })}
        />
      </div>
    </div>
  );
}

/**
 * The day the numbers make, as one line of small blocks: each period with its times, the lunch and breaks greyed between them, and what
 * had to be adjusted to fit (a period cut short so lunch starts on time).
 */
export function DayPreview({ name, value }: { name: string; value: DaySetup }) {
  const { slots, notes } = generateDay(value);
  let period = 0;
  return (
    <div className="space-y-2">
      <ol aria-label={`${name}, period by period`} className="flex flex-wrap gap-1.5">
        {slots.map((slot, i) => {
          if (slot.kind === "period") period += 1;
          const title = slot.kind === "period" ? `Period ${period}` : slot.label || (slot.kind === "lunch" ? "Lunch" : "Break");
          return (
            <li
              key={i}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs",
                slot.kind === "period" ? "border-border bg-surface text-foreground" : slot.kind === "lunch" ? "border-warning-line bg-warning-soft text-warning" : "border-border bg-surface-muted text-foreground-muted"
              )}
            >
              <span className="block font-bold">{title}</span>
              <span className="block tabular-nums">
                {slot.start}–{slot.end}
              </span>
            </li>
          );
        })}
      </ol>
      {notes.map((note) => (
        <p key={note} className="text-xs font-medium text-warning">
          {note}
        </p>
      ))}
    </div>
  );
}
