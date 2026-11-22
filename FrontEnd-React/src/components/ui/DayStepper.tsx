import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import { DateBox } from "./DateBox";
import { controlHeight, useControlStyle } from "./Input";

/** An arrow: a square the height of the boxes, the icon dark enough to read; off, it greys but keeps its place and its outline. */
const arrow =
  "inline-flex aspect-square shrink-0 cursor-pointer items-center justify-center border border-border bg-surface text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-foreground-muted/50 disabled:shadow-none disabled:hover:border-border disabled:hover:bg-surface-muted disabled:hover:text-foreground-muted/50";

/** The corners and the shadow of the boxes of this look, so the arrows and the boxes beside them are one family (2026-11-22: they looked apart). */
const shapeOf = (style: ReturnType<typeof useControlStyle>) =>
  style === "round" || style === "soft" ? "rounded-xl shadow-card" : style === "boxed" ? "rounded-[10px]" : style === "filled" ? "rounded-lg" : "rounded-lg shadow-sm";

/**
 * One day, moved with a left and a right arrow (2026-11-22, asked for on Attendance > Student: "date filter me arrow, aage piche"): the arrows go
 * a day back and a day on, the box in between types or picks a day (so a month ago is not thirty clicks). The arrows are the height of the
 * boxes next to them, so a row of filters is one line. An arrow that would leave `min`..`max` is off. `jump` is an optional button ("Today")
 * that appears only while another day is open.
 */
export function DayStepper({
  id,
  label,
  value,
  onChange,
  min,
  max,
  jump,
  className,
}: {
  /** The date box's id: the page's Field label points at it. */
  id: string;
  /** What the box is (for the calendar's name): "Date". */
  label: string;
  /** "YYYY-MM-DD". */
  value: string;
  onChange: (day: string) => void;
  min?: string;
  max?: string;
  jump?: { label: string; value: string };
  className?: string;
}) {
  const style = useControlStyle();
  const height = controlHeight(style);
  const shape = shapeOf(style);
  const previous = addDays(value, -1);
  const next = addDays(value, 1);
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button type="button" aria-label="Previous day" title="Previous day" disabled={!!min && previous < min} onClick={() => onChange(previous)} className={cn(arrow, shape, height)}>
        <ChevronLeft className="size-5" strokeWidth={2.25} aria-hidden />
      </button>
      {/* Wide enough for "22 / 11 / 2026" between the calendar icon and the calendar button (at 11rem the year ran under the button). */}
      <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
        <DateBox id={id} label={label} clearable={false} value={value} onChange={(day) => day && onChange(day)} min={min} max={max} />
      </div>
      <button type="button" aria-label="Next day" title="Next day" disabled={!!max && next > max} onClick={() => onChange(next)} className={cn(arrow, shape, height)}>
        <ChevronRight className="size-5" strokeWidth={2.25} aria-hidden />
      </button>
      {jump && jump.value !== value && (
        <button
          type="button"
          onClick={() => onChange(jump.value)}
          className={cn(
            "inline-flex shrink-0 cursor-pointer items-center border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
            shape,
            height
          )}
        >
          {jump.label}
        </button>
      )}
    </div>
  );
}
