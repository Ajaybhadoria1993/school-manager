import type { ReactNode } from "react";
import { CalendarDays, Hourglass, Minus, Plus, UsersRound, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { clockToMinutes, formatMinutes, isArrival, withoutArrival } from "../../utils/timings";
import { cn } from "../../utils/helpers";
import { TONES, type Tone } from "../../constants/tones";
import type { Slot } from "../../types";

/**
 * The small pieces of the timings pages, in the look of the reference pictures (2026-11-22): a number with − and + on its sides (the number is
 * still a box to type in, with the same name, so typing works as before), a switch (a real checkbox underneath), a row that a switch turns on,
 * the day as one bar of periods and breaks whose widths follow their minutes ("Your day at a glance"), and a thin bar of the same for a card.
 */

/**
 * − [ 40 min ] +: the middle is a number box (its `label` is its name); − and + step by `step` (minutes go by 5, 2026-11-22), to the next whole step
 * (42 and + is 45), inside `min`..`max`. An empty box is 0, shown empty.
 */
export function Stepper({ id, label, value, min, max, unit, step: by = 1, onChange }: { id: string; label: string; value: number; min: number; max: number; unit?: string; step?: number; onChange: (next: number) => void }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const up = (v: number) => clamp(Math.floor((v || 0) / by) * by + by);
  const down = (v: number) => clamp(Math.ceil((v || min) / by) * by - by);
  const step =
    "flex w-10 shrink-0 cursor-pointer items-center justify-center text-foreground-muted transition-colors hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
      <button type="button" aria-label={`${label}: less`} disabled={value <= min} onClick={() => onChange(down(value))} className={cn(step, "border-r border-border")}>
        <Minus className="size-4" aria-hidden />
      </button>
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-text items-center justify-center gap-1 px-1">
        <input
          id={id}
          aria-label={label}
          type="number"
          min={min}
          max={max}
          value={value || ""}
          onChange={(e) => onChange(e.target.value.trim() === "" || Number.isNaN(Number(e.target.value)) ? 0 : Math.max(0, Math.round(Number(e.target.value))))}
          style={{ width: `${Math.max(2, String(value || "").length) + 0.5}ch` }}
          className="min-w-0 bg-transparent text-center text-sm font-semibold text-foreground tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit && <span className="text-sm font-semibold text-foreground">{unit}</span>}
      </label>
      <button type="button" aria-label={`${label}: more`} disabled={value >= max} onClick={() => onChange(up(value))} className={cn(step, "border-l border-border")}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** A switch: a checkbox (its `label` is its name) drawn as a track and a knob; orange when on. */
export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input type="checkbox" className="peer sr-only" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="h-6 w-11 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange peer-checked:after:translate-x-5 peer-focus-visible:ring-4 peer-focus-visible:ring-orange/25"
      />
    </label>
  );
}

/** A row a switch turns on: the switch, the name with a word under it, and what the row holds when on (`offText` when off). Tinted orange when on. */
export function ToggleRow({
  title,
  sub,
  on,
  onToggle,
  switchLabel,
  offText,
  across = false,
  children,
}: {
  title: string;
  sub?: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  switchLabel: string;
  offText: string;
  /**
   * In a wide container (the row's ancestor is a container query, 2026-11-23: Assembly, Lunch and Short break in one line) the switch and the name are on
   * top and what the row holds under them, so a few rows sit side by side. Narrow, it is the row it always was.
   */
  across?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border px-4 py-3 transition-colors",
        // `relative`: a badge of the row (the length of the lunch) may sit at its top right corner.
        across && "relative @4xl:flex-col @4xl:flex-nowrap @4xl:items-start @4xl:gap-y-3",
        on ? "border-orange/40 bg-orange-soft/60" : "border-border bg-surface"
      )}
    >
      <div className="flex items-center gap-4">
        <Switch label={switchLabel} checked={on} onChange={onToggle} />
        <div className="min-w-[7.5rem]">
          <p className="text-sm font-bold text-foreground">{title}</p>
          {sub && <p className="text-xs text-foreground-muted">{sub}</p>}
        </div>
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", across && "@4xl:w-full @4xl:flex-none")}>{on ? children : <span className="text-sm text-foreground-muted">{offText}</span>}</div>
    </div>
  );
}

const minutesOf = (s: Slot) => Math.max(1, (clockToMinutes(s.end) ?? 0) - (clockToMinutes(s.start) ?? 0));

/** How a slot of a bar looks: periods blue in two shades (one after the other), the lunch orange, a short break grey. */
function slotTone(kind: Slot["kind"], index: number) {
  if (kind === "lunch") return "bg-orange-soft text-orange-hover ring-1 ring-inset ring-orange/40";
  if (kind === "break") return "bg-surface-muted text-foreground-muted ring-1 ring-inset ring-border";
  return index % 2 === 0 ? "bg-primary-soft text-primary-deep ring-1 ring-inset ring-primary/15" : "bg-primary/15 text-primary-deep ring-1 ring-inset ring-primary/20";
}

/**
 * The day at a glance: every slot of the day (the arrival, the assembly, each period "P1", the lunch, a break) as a box of the same size, its name
 * and its times inside ("08:30–09:10"), in the order of the day (2026-11-22, user: "ek jaise box, same height width, andar hi time"; the boxes used
 * to be as wide as their minutes, with the times under the bar, and a short one lost its name). The boxes wrap onto a second line when the card is
 * too narrow for all of them. `aria-label` "<name>, period by period".
 */
export function DayBar({ name, slots }: { name: string; slots: readonly Slot[] }) {
  let period = 0;
  return (
    <ol aria-label={`${name}, period by period`} className="grid grid-cols-[repeat(auto-fit,minmax(5.75rem,1fr))] gap-1.5">
      {withoutArrival(slots).map((s, i) => {
        if (s.kind === "period") period += 1;
        const label = s.kind === "period" ? `P${period}` : s.label || (s.kind === "lunch" ? "Lunch" : "Break");
        return (
          <li key={i} title={`${s.kind === "period" ? `Period ${period}` : label} · ${s.start}–${s.end}`} className={cn("flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 text-center", slotTone(s.kind, period - 1))}>
            <span className="max-w-full truncate text-xs font-bold">{label}</span>
            <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums opacity-80">
              {s.start}–{s.end}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A thin bar of a day for a card (a department, a class): its periods and breaks as small blocks, as wide as their minutes. */
export function MiniBar({ slots }: { slots: readonly Slot[] }) {
  let period = 0;
  return (
    <div aria-hidden className="flex h-2.5 gap-0.5">
      {withoutArrival(slots).map((s, i) => {
        if (s.kind === "period") period += 1;
        return (
          <span
            key={i}
            style={{ flexGrow: minutesOf(s), flexBasis: 0 }}
            className={cn("rounded-full", s.kind === "lunch" ? "bg-orange/60" : s.kind === "break" ? "bg-success/40" : period % 2 === 0 ? "bg-primary/35" : "bg-primary/20")}
          />
        );
      })}
    </div>
  );
}

/**
 * The figures of a day, from its rows (2026-11-22): **School time** (first row to last, how long), **Class time** (first period to the end, and what
 * comes before it: "After arrival 5 min + assembly 15 min"), **Periods** ("6 × 40 min", the length most have) and the **Lunch** (from when to when,
 * how long). The same four on the School timings page and in a department's window; two in a row when the box they are in is narrow.
 */
export function DayFigures({ slots }: { slots: readonly Slot[] }) {
  const length = (s: Slot) => (clockToMinutes(s.end) ?? 0) - (clockToMinutes(s.start) ?? 0);
  const first = slots[0];
  const last = slots[slots.length - 1];
  const periods = slots.filter((s) => s.kind === "period");
  const firstPeriod = periods[0];
  const lunch = slots.find((s) => s.kind === "lunch");
  const counts = new Map<number, number>();
  for (const p of periods) counts.set(length(p), (counts.get(length(p)) ?? 0) + 1);
  const usual = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
  const before = firstPeriod ? slots.slice(0, slots.indexOf(firstPeriod)) : [];
  // What comes before the classes, each with its times (2026-11-22, user chose this over "After arrival 5 min + assembly 15 min").
  const between = before.map((s) => `${isArrival(s) ? "Arrival" : s.label || "Break"} ${s.start}–${s.end}`).join(" · ");
  const open = first && last ? length({ ...first, end: last.end }) : 0;
  return (
    <div className="@container">
      {/* Class time is the widest: its line says the arrival and the assembly. */}
      <div className="grid grid-cols-2 gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.85fr)_minmax(0,1fr)]">
        <FigureTile icon={CalendarDays} label="School time" value={first && last ? `${first.start}–${last.end}` : "–"} hint={open > 0 ? formatMinutes(open) : undefined} tone="info" />
        <FigureTile icon={UsersRound} label="Class time" value={firstPeriod && last ? `${firstPeriod.start}–${last.end}` : "–"} hint={firstPeriod ? between || "From when school starts" : undefined} tone="primary" />
        <FigureTile icon={Hourglass} label="Periods" value={periods.length > 0 && usual ? `${periods.length} × ${usual} min` : "–"} tone="success" />
        {/* From when to when the lunch is, and how long (2026-11-22: "lunch kitne baje se kitne baje tak hai"). */}
        <FigureTile icon={UtensilsCrossed} label="Lunch" value={lunch ? `${lunch.start}–${lunch.end}` : "None"} hint={lunch ? formatMinutes(length(lunch)) : undefined} tone="warning" />
      </div>
    </div>
  );
}

/**
 * A figure in a card (2026-11-23, user: "School timings ke card ka size bhi Class timetables jaisa"): the icon in a soft square at the left, the name,
 * the figure, and under it a line in small letters shown whole (it wraps rather than being cut). The same card on the School timings page, in a
 * department's and a special day's window, and at the top of Class timetables; tight padding keeps it close to the height of the Classes page's tiles.
 */
export function FigureTile({ label, value, hint, icon: Icon, tone = "primary" }: { label: string; value: ReactNode; hint?: string; icon: LucideIcon; tone?: Tone }) {
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 shadow-card">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONES[tone].tile)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-label">{label}</p>
        <p className="truncate text-stat-value">{value ?? <span className="text-foreground-muted/60">-</span>}</p>
        <p className="min-h-4 text-xs font-medium text-foreground-muted" title={hint || undefined}>
          {hint}
        </p>
      </div>
    </div>
  );
}
