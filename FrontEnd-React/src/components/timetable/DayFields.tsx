import { useState } from "react";
import { MAX_BREAK_MINUTES, MAX_PERIOD_MINUTES, MAX_PERIODS, MIN_PERIOD_MINUTES } from "../../constants/timetable";
import { TriangleAlert } from "lucide-react";
import { breakClash, clashMessage, classesStart, clockToMinutes, describeDay, formatMinutes, generateDay, minutesToClock, setupProblems, shiftBreaks, shiftClock, visibleClash, withArrival, type DaySetup } from "../../utils/timings";
import { endMessage, hoursClash, type Hours } from "../../utils/departmentDay";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { TimeBox } from "../ui/TimeBox";
import { Stepper, ToggleRow } from "./TimingParts";

/** "= 1 hr 30 min" under a number of minutes from an hour up, so 60 reads as 1 hr; nothing under an hour (the unit is in the box). */
function InWords({ minutes }: { minutes: number }) {
  if (minutes < 60) return null;
  return <p className="mt-1 text-xs font-semibold text-foreground">= {formatMinutes(minutes)}</p>;
}

/** The two times of a break and how long it is: "10:30  to  11:00  30 min". `id` is the first box's (a warning puts the cursor there). */
function BreakTimes({ id, name, what, from, to, onFrom, onTo }: { id?: string; name: string; what: string; from: string; to: string; onFrom: (clock: string) => void; onTo: (clock: string) => void }) {
  const start = clockToMinutes(from);
  const end = clockToMinutes(to);
  return (
    <>
      <TimeBox id={id} label={`${name}: ${what} from`} className="w-36 min-w-32" value={from} onChange={onFrom} />
      <span className="text-sm text-foreground-muted">to</span>
      <TimeBox label={`${name}: ${what} to`} className="w-36 min-w-32" value={to} onChange={onTo} />
      {start !== null && end !== null && end > start && <span className="rounded-full bg-orange-soft px-2.5 py-1 text-xs font-bold text-orange-hover ring-1 ring-inset ring-orange/30">{formatMinutes(end - start)}</span>}
    </>
  );
}

/** "After Period 3": where the lunch falls in the day, from the periods before it. */
function afterPeriod(value: DaySetup, kind: "lunch" | "break"): string | undefined {
  const { slots } = generateDay(value);
  const at = slots.findIndex((s) => s.kind === kind);
  if (at < 0) return undefined;
  const before = slots.slice(0, at).filter((s) => s.kind === "period").length;
  return before > 0 ? `After Period ${before}` : "Before the first period";
}

/**
 * The short break's times when it is first turned on: ten minutes at the end of a period, from the second one on, the first such place where it
 * neither cuts a later period short nor meets the lunch (2026-11-22: no period is cut); after the second period when there is none.
 */
function firstBreak(value: DaySetup): Pick<DaySetup, "breakStart" | "breakEnd"> {
  const at = (minutes: number) => ({ breakStart: minutesToClock(Math.min(minutes, 1429)), breakEnd: minutesToClock(Math.min(minutes, 1429) + 10) });
  const periodEnds = generateDay({ ...value, breakStart: null, breakEnd: null })
    .slots.filter((s) => s.kind === "period")
    .map((s) => clockToMinutes(s.end) ?? 0)
    .slice(1, -1);
  for (const end of periodEnds) {
    const tried = { ...value, ...at(end) };
    if (setupProblems(tried).length === 0 && !breakClash(tried)) return at(end);
  }
  return at((clockToMinutes(value.start) ?? 510) + (value.arrivalMinutes ?? 0) + value.assemblyMinutes + 2 * value.periodMinutes);
}

/**
 * The few numbers a head knows about a school day, in the look of the reference pictures (2026-11-22): when school starts and when classes start
 * (apart, so everyone is in before the first period: the time between is an "Arrival" row, then the assembly), how long a period is and how many
 * periods (each a number with − and + on its sides), then a row a switch turns on for the assembly (before the first period, in minutes), the
 * lunch and a short break (each from when to when, with how long it is; the lunch says after which period it falls). `idPrefix`
 * keeps the boxes of two days apart; `name` ("Usual day", "Saturday") is said to a screen reader with each box. `showEnd` adds when school ends,
 * worked out from the numbers (a window). `adaptive` lays the boxes out by the width of the card they are in, not by the width of the screen.
 */
export function DayFields({ idPrefix, name, value, adaptive = false, showEnd = false, onChange }: { idPrefix: string; name: string; value: DaySetup; adaptive?: boolean; showEnd?: boolean; onChange: (next: DaySetup) => void }) {
  const change = (patch: Partial<DaySetup>) => onChange({ ...value, ...patch });
  const ends = describeDay(generateDay(value).slots).end;
  const arrival = value.arrivalMinutes ?? 0;
  const classes = classesStart(value);
  // Classes start at another time: the time to come in is what is left after school starts and the assembly; the lunch and the short break move
  // with the periods, so each stays after the same period (2026-11-22). A time before school starts is kept and said (`setupProblems`).
  const setClasses = (clock: string) => {
    const at = clockToMinutes(clock);
    const opens = clockToMinutes(value.start);
    if (at === null || opens === null) return;
    const moved = withArrival(value, at - opens - value.assemblyMinutes);
    const was = classes === null ? null : clockToMinutes(classes);
    onChange(was === null ? moved : shiftBreaks(moved, at - was));
  };
  // When classes were set to start after a time to come in, a longer or shorter assembly comes out of that time, so classes keep their start
  // while it fits; with no time to come in, the assembly moves the periods as before.
  const setAssembly = (assemblyMinutes: number) => {
    if (arrival <= 0) return change({ assemblyMinutes });
    onChange(withArrival({ ...value, assemblyMinutes }, Math.max(0, arrival + value.assemblyMinutes - assemblyMinutes)));
  };
  const assemblyFrom = classes !== null && value.assemblyMinutes > 0 ? minutesToClock((clockToMinutes(classes) ?? 0) - value.assemblyMinutes) : null;
  // The assembly row stays open while its box is cleared to type a new number (0 minutes is no assembly when saved).
  const [assemblyOpen, setAssemblyOpen] = useState(value.assemblyMinutes > 0);
  const assemblyOn = assemblyOpen || value.assemblyMinutes > 0;
  // A lunch or short break that starts inside a period (it would cut it short): said here, with the way out (2026-11-22, every period the same length).
  const clash = visibleClash(value);
  const breakName = clash?.kind === "lunch" ? "lunch" : "the short break";
  const breakFrom = `${idPrefix}-${clash?.kind === "lunch" ? "lunch" : "break"}-from`;
  const moveBreak = (to: { start: string; end: string }) => {
    if (!clash) return;
    change(clash.kind === "lunch" ? { lunchStart: to.start, lunchEnd: to.end } : { breakStart: to.start, breakEnd: to.end });
  };

  return (
    <div className={cn("space-y-3", adaptive && "@container")}>
      <div className={cn("grid grid-cols-1 gap-3", showEnd ? (adaptive ? "@xs:grid-cols-2" : "sm:grid-cols-2") : adaptive ? "@xs:grid-cols-2 @3xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4")}>
        <Field quiet id={`${idPrefix}-start`} label="School starts">
          <TimeBox id={`${idPrefix}-start`} label={`${name}: school starts`} value={value.start} onChange={(start) => change({ start })} />
        </Field>
        <Field quiet id={`${idPrefix}-classes`} label="Classes start">
          <TimeBox id={`${idPrefix}-classes`} label={`${name}: classes start`} value={classes ?? ""} onChange={setClasses} />
        </Field>
        {showEnd && (
          <div>
            <p className="mb-1.5 flex items-center gap-2 text-body-label">
              School ends <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary-deep">auto</span>
            </p>
            <p aria-label={`${name}: school ends`} className="flex h-10 items-center rounded-lg border border-border bg-surface-muted/60 px-3.5 text-sm font-semibold tabular-nums text-foreground-muted">
              {ends ?? "–"}
            </p>
          </div>
        )}
        <Field quiet id={`${idPrefix}-length`} label="Each period">
          <Stepper id={`${idPrefix}-length`} label={`${name}: minutes in a period`} min={MIN_PERIOD_MINUTES} max={MAX_PERIOD_MINUTES} unit="min" step={5} value={value.periodMinutes} onChange={(periodMinutes) => change({ periodMinutes })} />
          <InWords minutes={value.periodMinutes} />
        </Field>
        <Field quiet id={`${idPrefix}-periods`} label="Periods in the day">
          <Stepper id={`${idPrefix}-periods`} label={`${name}: number of periods`} min={1} max={MAX_PERIODS} value={value.periods} onChange={(periods) => change({ periods })} />
        </Field>
      </div>

      <div className="space-y-2.5">
        <ToggleRow
          title="Assembly"
          sub={assemblyFrom && classes ? `${assemblyFrom}–${classes}` : "Before first period"}
          switchLabel={`${name}: assembly`}
          on={assemblyOn}
          onToggle={(on) => {
            setAssemblyOpen(on);
            setAssembly(on ? 15 : 0);
          }}
          offText="No assembly"
        >
          <div className="w-40">
            <Stepper id={`${idPrefix}-assembly`} label={`${name}: assembly minutes`} min={0} max={MAX_BREAK_MINUTES} unit="min" step={5} value={value.assemblyMinutes} onChange={setAssembly} />
          </div>
          <InWords minutes={value.assemblyMinutes} />
        </ToggleRow>
        <ToggleRow
          title="Lunch"
          sub={value.lunchStart !== null ? afterPeriod(value, "lunch") : undefined}
          switchLabel={`${name}: lunch break`}
          on={value.lunchStart !== null}
          onToggle={(on) => change(on ? { lunchStart: "10:30", lunchEnd: "11:00" } : { lunchStart: null, lunchEnd: null })}
          offText="No lunch"
        >
          <BreakTimes id={`${idPrefix}-lunch-from`} name={name} what="lunch" from={value.lunchStart ?? ""} to={value.lunchEnd ?? ""} onFrom={(lunchStart) => change({ lunchStart })} onTo={(lunchEnd) => change({ lunchEnd })} />
        </ToggleRow>
        <ToggleRow
          title="Short break"
          sub={value.breakStart !== null ? afterPeriod(value, "break") : "Optional, e.g. 10 min"}
          switchLabel={`${name}: short break`}
          on={value.breakStart !== null}
          onToggle={(on) => change(on ? firstBreak(value) : { breakStart: null, breakEnd: null })}
          offText="Not in this day"
        >
          <BreakTimes id={`${idPrefix}-break-from`} name={name} what="short break" from={value.breakStart ?? ""} to={value.breakEnd ?? ""} onFrom={(breakStart) => change({ breakStart })} onTo={(breakEnd) => change({ breakEnd })} />
        </ToggleRow>
      </div>

      {clash && (
        <LineUpWarning
          message={clashMessage(clash)}
          moves={[...(clash.earlier ? [{ label: `Move ${breakName} to ${clash.earlier.start}`, run: () => moveBreak(clash.earlier!) }] : []), { label: `Move ${breakName} to ${clash.moveTo.start}`, run: () => moveBreak(clash.moveTo) }]}
          typeLabel={`Change ${clash.kind === "lunch" ? "lunch" : "short break"} time`}
          onType={() => focusBox(breakFrom)}
        />
      )}
    </div>
  );
}

/** Puts the cursor in a box (by its id), brought into view: a warning's "Change ... time". */
function focusBox(id: string) {
  const box = document.getElementById(id);
  box?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  box?.focus();
}

/**
 * A day whose periods and breaks do not line up (2026-11-22: every period is the same length): what is wrong, in minutes either way, a button for
 * each way to fix it, and a link that puts the cursor in the box to type another time.
 */
function LineUpWarning({ message, moves, typeLabel, onType }: { message: string; moves: { label: string; run: () => void }[]; typeLabel: string; onType: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
      <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 basis-60 text-sm font-medium text-warning">{message}</p>
      <div className="flex flex-wrap items-center gap-3">
        {moves.map((m) => (
          <Button key={m.label} size="sm" variant="outline" onClick={m.run}>
            {m.label}
          </Button>
        ))}
        <button type="button" onClick={onType} className="cursor-pointer text-sm font-semibold text-primary-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          {typeLabel}
        </button>
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
 * A day as hours (Pre-Primary): when school starts, when it ends, how long a period is (the school's to start with, `schoolPeriod`; its own when
 * changed, 2026-11-22) and a lunch if there is one. The same look as `DayFields`; the periods are made from these by the page. Every period is that
 * length: a lunch that starts inside a period, or an end inside one, is said with the minutes either way and a button for each.
 */
export function HoursFields({ idPrefix, name, value, schoolPeriod, onChange }: { idPrefix: string; name: string; value: Hours; schoolPeriod: number; onChange: (next: Hours) => void }) {
  const change = (patch: Partial<Hours>) => onChange({ ...value, ...patch });
  const length = value.periodMinutes ?? schoolPeriod;
  // School time and class time apart, as on the school's day (2026-11-22): the time between is the time to come in; the lunch moves with the periods.
  const opens = clockToMinutes(value.start);
  const classesAt = opens === null ? null : opens + (value.arrivalMinutes ?? 0);
  const classes = classesAt === null || classesAt < 0 || classesAt > 1439 ? null : minutesToClock(classesAt);
  const setClasses = (clock: string) => {
    const at = clockToMinutes(clock);
    if (at === null || opens === null) return;
    const next: Hours = { ...value, arrivalMinutes: at - opens };
    if (at === opens) delete next.arrivalMinutes;
    const delta = classesAt === null ? 0 : at - classesAt;
    const lunchFrom = value.lunchStart ? shiftClock(value.lunchStart, delta) : null;
    const lunchTo = value.lunchEnd ? shiftClock(value.lunchEnd, delta) : null;
    onChange(delta !== 0 && lunchFrom && lunchTo ? { ...next, lunchStart: lunchFrom, lunchEnd: lunchTo } : next);
  };
  const clash = hoursClash(value, schoolPeriod);
  const lunch = clash.lunch;
  const end = clash.end;
  return (
    <div className="@container space-y-3">
      <div className="grid grid-cols-1 gap-3 @xs:grid-cols-2 @3xl:grid-cols-4">
        <Field quiet id={`${idPrefix}-start`} label="School starts">
          <TimeBox id={`${idPrefix}-start`} label={`${name}: school starts`} value={value.start} onChange={(start) => change({ start })} />
        </Field>
        <Field quiet id={`${idPrefix}-classes`} label="Classes start">
          <TimeBox id={`${idPrefix}-classes`} label={`${name}: classes start`} value={classes ?? ""} onChange={setClasses} />
        </Field>
        <Field quiet id={`${idPrefix}-end`} label="School ends">
          <TimeBox id={`${idPrefix}-end`} label={`${name}: school ends`} value={value.end} onChange={(end) => change({ end })} />
        </Field>
        <Field quiet id={`${idPrefix}-length`} label="Each period">
          <Stepper id={`${idPrefix}-length`} label={`${name}: minutes in a period`} min={MIN_PERIOD_MINUTES} max={MAX_PERIOD_MINUTES} unit="min" step={5} value={length} onChange={(periodMinutes) => change({ periodMinutes })} />
          <InWords minutes={length} />
        </Field>
      </div>
      <ToggleRow
        title="Lunch"
        switchLabel={`${name}: lunch break`}
        on={value.lunchStart !== null}
        onToggle={(on) => change(on ? firstLunch(value) : { lunchStart: null, lunchEnd: null })}
        offText="No lunch"
      >
        <BreakTimes id={`${idPrefix}-lunch-from`} name={name} what="lunch" from={value.lunchStart ?? ""} to={value.lunchEnd ?? ""} onFrom={(lunchStart) => change({ lunchStart })} onTo={(lunchEnd) => change({ lunchEnd })} />
      </ToggleRow>
      {lunch && (
        <LineUpWarning
          message={clashMessage(lunch)}
          moves={[
            ...(lunch.earlier ? [{ label: `Move lunch to ${lunch.earlier.start}`, run: () => change({ lunchStart: lunch.earlier!.start, lunchEnd: lunch.earlier!.end }) }] : []),
            { label: `Move lunch to ${lunch.moveTo.start}`, run: () => change({ lunchStart: lunch.moveTo.start, lunchEnd: lunch.moveTo.end }) },
          ]}
          typeLabel="Change lunch time"
          onType={() => focusBox(`${idPrefix}-lunch-from`)}
        />
      )}
      {end && (
        <LineUpWarning
          message={endMessage(end)}
          moves={[...(end.earlier ? [{ label: `End at ${end.earlier}`, run: () => change({ end: end.earlier! }) }] : []), { label: `End at ${end.later}`, run: () => change({ end: end.later }) }]}
          typeLabel="Change end time"
          onType={() => focusBox(`${idPrefix}-end`)}
        />
      )}
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
