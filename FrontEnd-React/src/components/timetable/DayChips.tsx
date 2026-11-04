import { DAY_NAMES, DAY_SHORT } from "../../constants/timetable";
import { cn } from "../../utils/helpers";

/**
 * The weekdays as toggles: every day is on the screen, and a click turns it on or off. `label` names the group for a screen reader.
 * `tone="off"`: a day that is on is a day away (a teacher's days off), so it is shown in red, not in the blue of a day that is chosen.
 */
export function DayChips({
  label,
  value,
  onChange,
  days = [1, 2, 3, 4, 5, 6, 7],
  tone = "primary",
}: {
  label: string;
  value: number[];
  onChange: (days: number[]) => void;
  days?: number[];
  tone?: "primary" | "off";
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {days.map((day) => {
        const on = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            aria-label={DAY_NAMES[day]}
            title={DAY_NAMES[day]}
            onClick={() => onChange(on ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b))}
            className={cn(
              "h-9 min-w-12 cursor-pointer rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
              on
                ? tone === "off"
                  ? "border-transparent bg-danger-soft text-danger line-through ring-2 ring-inset ring-danger/25"
                  : "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/25"
                : "border-border bg-surface text-foreground-muted hover:border-primary/50"
            )}
          >
            {DAY_SHORT[day]}
          </button>
        );
      })}
    </div>
  );
}
