import { MAX_BREAK_MINUTES, MAX_PERIOD_MINUTES, MAX_PERIODS, MIN_PERIOD_MINUTES } from "../../constants/timetable";
import { clockToMinutes, formatMinutes, generateDay, minutesToClock, type DaySetup } from "../../utils/timings";
import type { Hours } from "../../utils/departmentDay";
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
function MinutesBox({ id, label, value, min, max, placeholder, adaptive, onChange }: { id: string; label: string; value: number; min: number; max: number; placeholder?: string; adaptive?: boolean; onChange: (minutes: number) => void }) {
  // In a narrow card the box says only "min": the hours in words (= 1 hr 30 min) need room, so they wait for a box that has it.
  const words = value >= 60;
  return (
    <div className={cn("relative", adaptive && "@container")}>
      <Input
        id={id}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(numberOf(e.target.value))}
        className={cn(
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          adaptive ? (words ? "pr-12 @[11rem]:pr-28" : "pr-12") : "pr-28"
        )}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center gap-1.5 text-sm text-foreground-muted">
        <span>min</span>
        {words && <span className={cn("font-semibold text-foreground", adaptive && "hidden @[11rem]:inline")}>= {formatMinutes(value)}</span>}
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
  adaptive,
}: {
  adaptive?: boolean;
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
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", adaptive && "@container")}>
      <label className={cn("flex h-10 basis-full cursor-pointer items-center gap-2 text-sm font-semibold text-foreground", adaptive ? "@md:w-36 @md:basis-auto" : "sm:w-36 sm:basis-auto")}>
        <input type="checkbox" className="size-4 accent-primary" aria-label={`${name}: ${what === "lunch" ? "lunch break" : what}`} checked={on} onChange={(e) => onToggle(e.target.checked)} />
        {title}
      </label>
      {on ? (
        <>
          <Input aria-label={`${name}: ${what} from`} type="time" className={cn("min-w-28 flex-1", adaptive ? "@md:w-36 @md:flex-none" : "sm:w-36 sm:flex-none")} value={from} onChange={(e) => onFrom(e.target.value)} />
          <span className="text-sm text-foreground-muted">to</span>
          <Input aria-label={`${name}: ${what} to`} type="time" className={cn("min-w-28 flex-1", adaptive ? "@md:w-36 @md:flex-none" : "sm:w-36 sm:flex-none")} value={to} onChange={(e) => onTo(e.target.value)} />
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
 * `name` ("Usual day", "Saturday") is said to a screen reader with each box. `adaptive` (the School timings page, where the same boxes
 * stand in a wide card and in a narrow one beside it) lays the boxes out by the width of the card they are in (1, 2 or 4 to a line),
 * not by the width of the screen.
 */
export function DayFields({ idPrefix, name, value, adaptive = false, onChange }: { idPrefix: string; name: string; value: DaySetup; adaptive?: boolean; onChange: (next: DaySetup) => void }) {
  const change = (patch: Partial<DaySetup>) => onChange({ ...value, ...patch });

  return (
    <div className={cn("space-y-4", adaptive && "@container")}>
      <div className={cn("grid grid-cols-1 gap-3", adaptive ? "@2xs:grid-cols-2 @2xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4")}>
        <Field quiet id={`${idPrefix}-start`} label="School starts">
          <Input id={`${idPrefix}-start`} aria-label={`${name}: school starts`} type="time" value={value.start} onChange={(e) => change({ start: e.target.value })} />
        </Field>
        <Field quiet id={`${idPrefix}-length`} label="Each period">
          <MinutesBox id={`${idPrefix}-length`} label={`${name}: minutes in a period`} min={MIN_PERIOD_MINUTES} max={MAX_PERIOD_MINUTES} value={value.periodMinutes} adaptive={adaptive} onChange={(periodMinutes) => change({ periodMinutes })} />
        </Field>
        <Field quiet id={`${idPrefix}-periods`} label="Periods in the day">
          <Input id={`${idPrefix}-periods`} aria-label={`${name}: number of periods`} type="number" min={1} max={MAX_PERIODS} value={value.periods || ""} onChange={(e) => change({ periods: numberOf(e.target.value) })} />
        </Field>
        <Field quiet id={`${idPrefix}-assembly`} label="Assembly (optional)">
          <MinutesBox id={`${idPrefix}-assembly`} label={`${name}: assembly minutes`} min={0} max={MAX_BREAK_MINUTES} value={value.assemblyMinutes} placeholder="None" adaptive={adaptive} onChange={(assemblyMinutes) => change({ assemblyMinutes })} />
        </Field>
      </div>

      <div className="space-y-2.5">
        <BreakRow
          adaptive={adaptive}
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
          adaptive={adaptive}
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

/** The lunch's times when it is first turned on in a day of hours: 10:30 to 11:00 when that is inside the day, else half an hour in the middle of it. */
function firstLunch(hours: Hours): Pick<Hours, "lunchStart" | "lunchEnd"> {
  const from = clockToMinutes(hours.start);
  const to = clockToMinutes(hours.end);
  if (from === null || to === null || to <= from || (from <= 630 && to >= 660)) return { lunchStart: "10:30", lunchEnd: "11:00" };
  const middle = Math.round((from + to) / 2 / 5) * 5;
  return { lunchStart: minutesToClock(Math.max(from, middle - 15)), lunchEnd: minutesToClock(Math.min(to, middle + 15)) };
}

/**
 * A day as hours (Pre-Primary, where periods do not matter): when school starts, when it ends, and a lunch if there is one. The same
 * look as `DayFields` (adaptive: by the width of the card it stands in); the periods are made from these hours by the page.
 */
export function HoursFields({ idPrefix, name, value, onChange }: { idPrefix: string; name: string; value: Hours; onChange: (next: Hours) => void }) {
  const change = (patch: Partial<Hours>) => onChange({ ...value, ...patch });
  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-1 gap-3 @2xs:grid-cols-2">
        <Field quiet id={`${idPrefix}-start`} label="School starts">
          <Input id={`${idPrefix}-start`} aria-label={`${name}: school starts`} type="time" value={value.start} onChange={(e) => change({ start: e.target.value })} />
        </Field>
        <Field quiet id={`${idPrefix}-end`} label="School ends">
          <Input id={`${idPrefix}-end`} aria-label={`${name}: school ends`} type="time" value={value.end} onChange={(e) => change({ end: e.target.value })} />
        </Field>
      </div>
      <BreakRow
        adaptive
        name={name}
        title="Lunch"
        on={value.lunchStart !== null}
        from={value.lunchStart ?? ""}
        to={value.lunchEnd ?? ""}
        onToggle={(on) => change(on ? firstLunch(value) : { lunchStart: null, lunchEnd: null })}
        onFrom={(lunchStart) => change({ lunchStart })}
        onTo={(lunchEnd) => change({ lunchEnd })}
      />
    </div>
  );
}

/** The colours the periods of a timeline take in turn; a lunch and a break have their own. */
const PERIOD_TONES = [
  "border-primary/20 bg-primary-soft text-primary-deep",
  "border-success-line bg-success-soft text-success",
  "border-info-line bg-info-soft text-info",
];

/**
 * The day the numbers make, as small blocks: each period with its times, the lunch and breaks between them, and what had to be adjusted
 * to fit (a period cut short so lunch starts on time). `chips` (the default) wrap in a line of plain blocks; `line` is the timeline of
 * the School timings page: the blocks in one row on a thin line, each period in its own soft colour, the row scrolls when it is longer
 * than the card.
 */
export function DayPreview({ name, value, variant = "chips" }: { name: string; value: DaySetup; variant?: "chips" | "line" }) {
  const { slots, notes } = generateDay(value);
  let period = 0;
  const line = variant === "line";
  return (
    <div className="space-y-2">
      <div className={cn(line && "overflow-x-auto pb-1")}>
        <ol
          aria-label={`${name}, period by period`}
          className={cn(line ? "relative flex min-w-max items-stretch gap-2.5 px-0.5 py-1 before:absolute before:inset-x-2 before:top-1/2 before:h-px before:bg-border" : "flex flex-wrap gap-1.5")}
        >
          {slots.map((slot, i) => {
            if (slot.kind === "period") period += 1;
            const title = slot.kind === "period" ? `Period ${period}` : slot.label || (slot.kind === "lunch" ? "Lunch" : "Break");
            const rest = "border-border bg-surface-muted text-foreground-muted";
            const lunch = "border-warning-line bg-warning-soft text-warning";
            const tone =
              slot.kind === "period" ? (line ? PERIOD_TONES[(period - 1) % PERIOD_TONES.length] : "border-border bg-surface text-foreground") : slot.kind === "lunch" ? lunch : rest;
            return (
              <li key={i} className={cn("rounded-lg border px-2.5 py-1.5 text-xs", line && "relative z-10 rounded-xl px-3 py-2", tone)}>
                <span className="block font-bold">{title}</span>
                <span className="block tabular-nums">
                  {slot.start}–{slot.end}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {notes.map((note) => (
        <p key={note} className="text-xs font-medium text-warning">
          {note}
        </p>
      ))}
    </div>
  );
}
