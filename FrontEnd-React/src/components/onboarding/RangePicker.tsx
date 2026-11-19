import { useState } from "react";
import { Check, ChevronDown, Layers } from "lucide-react";
import { CLASS_LEVELS } from "../../constants/schoolOptions";
import { useDismiss } from "../../hooks/useDismiss";
import { rangeText } from "../../utils/mediumPlans";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";

/** What a screen reader says for a chip: the pre-school names as they are, a number as "Class 5" (the chip itself shows the number). */
const readAs = (level: string) => (Number.isNaN(Number(level)) ? level : `Class ${level}`);

function Levels({
  label,
  value,
  isDisabled,
  onPick,
}: {
  label: string;
  value: string;
  /** A level that would make the range run backwards. */
  isDisabled: (level: string) => boolean;
  onPick: (level: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-foreground-secondary">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {CLASS_LEVELS.map((level) => {
          const on = level === value;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={readAs(level)}
              disabled={isDisabled(level)}
              onClick={() => onPick(level)}
              className={cn(
                "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-35",
                on ? "border-transparent bg-primary text-primary-foreground shadow-sm" : "border-border bg-white text-foreground hover:border-primary/50 hover:bg-primary-soft"
              )}
            >
              {level}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The class range as one box that says it ("Nursery to 10th"). Pressed, it opens a small window with the first class and the last class as
 * chips, one press each (a first class after the last, or a last before the first, is greyed out). The window stays open so both can be
 * set; Done, a press outside it or Escape closes it. Every class between the two gets a card.
 */
export function RangePicker({
  lowest,
  highest,
  invalid,
  onChange,
}: {
  lowest: string;
  highest: string;
  invalid?: boolean;
  onChange: (lowest: string, highest: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const text = rangeText(lowest, highest) || (lowest || highest ? `${lowest || "?"} to ${highest || "?"}` : "");
  const from = CLASS_LEVELS.indexOf(lowest as (typeof CLASS_LEVELS)[number]);
  const to = CLASS_LEVELS.indexOf(highest as (typeof CLASS_LEVELS)[number]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Class range"
        aria-invalid={invalid ? true : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-12 w-64 max-w-full cursor-pointer items-center gap-2.5 rounded-xl border bg-white px-3 text-left text-[15px] font-semibold shadow-card transition-all hover:border-primary/40! focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
          invalid ? "border-danger!" : "border-border",
          open && "border-primary! ring-4 ring-primary/15"
        )}
      >
        <Layers className="size-[19px] shrink-0 text-primary" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", !text && "font-normal text-foreground-muted/70")}>{text || "Choose the range"}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-foreground-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div role="dialog" aria-label="Class range" className="fade-in absolute left-0 top-14 z-20 w-[22rem] max-w-[calc(100vw-2rem)] space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-float">
          <Levels label="Classes from" value={lowest} isDisabled={(level) => to >= 0 && CLASS_LEVELS.indexOf(level as (typeof CLASS_LEVELS)[number]) > to} onPick={(level) => onChange(level, highest)} />
          <Levels label="Classes up to" value={highest} isDisabled={(level) => from >= 0 && CLASS_LEVELS.indexOf(level as (typeof CLASS_LEVELS)[number]) < from} onPick={(level) => onChange(lowest, level)} />
          <Button type="button" className="w-full" onClick={() => setOpen(false)}>
            <Check className="size-4" aria-hidden />
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
