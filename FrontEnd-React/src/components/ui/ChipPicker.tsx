import { useId } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";

export interface Chip {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** The colour of the chip while it is picked (and of its icon); the page's blue when not given. */
  tone?: Tone;
  /** A tiny word after the label, for example "In school". */
  note?: string;
  disabled?: boolean;
}

/**
 * "Pick one" as a row of chips instead of a dropdown: every choice is on the screen, so choosing is one click, and the picked
 * chip takes its own colour. It is a group of radio buttons underneath, so the arrow keys, Tab and a screen reader work as they
 * do for any radio group, and `label` names the group for a screen reader (the visible label is the Field around it).
 */
export function ChipPicker({
  label,
  value,
  options,
  onChange,
  compact = false,
  className,
}: {
  label: string;
  /** The value of the picked chip; "" when none is. */
  value: string;
  options: readonly Chip[];
  onChange: (value: string) => void;
  /** Smaller, square-ish chips, for short labels such as the numbers 1 to 10. */
  compact?: boolean;
  className?: string;
}) {
  const name = useId();

  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const picked = option.value === value;
        const tone = TONES[option.tone ?? "primary"];
        const Icon = option.icon;
        return (
          <label key={option.value} className="relative block">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={picked}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "inline-flex cursor-pointer select-none items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-all duration-150",
                compact ? "h-9 min-w-10 px-2.5" : "h-10 px-3",
                "peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
                picked
                  ? cn(tone.chip, "border-transparent shadow-card ring-2 ring-inset")
                  : "border-border bg-surface text-foreground hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-card"
              )}
            >
              {picked && !compact ? (
                <Check className="size-4 shrink-0" aria-hidden />
              ) : (
                Icon && <Icon className={cn("size-4 shrink-0", !picked && tone.text)} aria-hidden />
              )}
              <span>{option.label}</span>
              {option.note && <span className="text-[10px] font-bold uppercase tracking-wide opacity-60">{option.note}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
