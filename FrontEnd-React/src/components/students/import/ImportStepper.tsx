import { Check } from "lucide-react";
import { cn } from "../../../utils/helpers";

export const IMPORT_STEPS = ["Upload file", "Preview & fix", "Done"] as const;

/**
 * Where the person is in the bulk upload: three numbered steps, the ones behind ticked. On a phone the names give way to one line under
 * the numbers. `compact`: one thin line (small numbers and names, no card around it) that the page puts on the row it shares with other
 * things, instead of a wide bar of its own, so the table below has the room. The lines between the steps stretch to the width it is given.
 */
export function ImportStepper({ current, compact = false }: { current: number; compact?: boolean }) {
  return (
    <div>
      <ol aria-label="Steps of the bulk upload" className={cn("flex items-center", compact ? "gap-2" : "gap-2 sm:gap-3")}>
        {IMPORT_STEPS.map((label, index) => {
          const done = index < current;
          const here = index === current;
          return (
            <li
              key={label}
              className={cn("flex min-w-0 items-center", compact ? "gap-2" : "gap-2 sm:gap-3", index < IMPORT_STEPS.length - 1 && "flex-1")}
              aria-current={here ? "step" : undefined}
            >
              <span
                aria-hidden
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full font-bold transition-colors",
                  compact ? "size-6 text-xs" : "size-8 text-sm",
                  done && "bg-success text-white",
                  here && (compact ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.5)]"),
                  !done && !here && "border border-border bg-surface text-foreground-muted"
                )}
              >
                {done ? <Check className={compact ? "size-3.5" : "size-4"} /> : index + 1}
              </span>
              <span className={cn("sr-only truncate font-semibold sm:not-sr-only", compact ? "text-[13px]" : "text-sm", here ? "text-foreground" : "text-foreground-muted")}>
                {label}
                <span className="sr-only">{done ? " (done)" : here ? " (now)" : ""}</span>
              </span>
              {index < IMPORT_STEPS.length - 1 && <span aria-hidden className={cn("h-px min-w-4 flex-1", done ? "bg-success" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
      <p aria-hidden className={cn("font-semibold text-foreground sm:hidden", compact ? "mt-1.5 text-[13px]" : "mt-2.5 text-sm")}>
        Step {current + 1} of {IMPORT_STEPS.length}: {IMPORT_STEPS[current]}
      </p>
    </div>
  );
}
