import { Check } from "lucide-react";
import { cn } from "../../../utils/helpers";

export const IMPORT_STEPS = ["Upload file", "Preview & fix", "Done"] as const;

/** Where the person is in the bulk upload: three numbered steps, the ones behind ticked. On a phone the names give way to one line under the numbers. */
export function ImportStepper({ current }: { current: number }) {
  return (
    <div>
      <ol aria-label="Steps of the bulk upload" className="flex items-center gap-2 sm:gap-3">
        {IMPORT_STEPS.map((label, index) => {
          const done = index < current;
          const here = index === current;
          return (
            <li key={label} className={cn("flex min-w-0 items-center gap-2 sm:gap-3", index < IMPORT_STEPS.length - 1 && "flex-1")} aria-current={here ? "step" : undefined}>
              <span
                aria-hidden
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  done && "bg-success text-white",
                  here && "bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.5)]",
                  !done && !here && "border border-border bg-surface text-foreground-muted"
                )}
              >
                {done ? <Check className="size-4" /> : index + 1}
              </span>
              <span className={cn("sr-only truncate text-sm font-semibold sm:not-sr-only", here ? "text-foreground" : "text-foreground-muted")}>
                {label}
                <span className="sr-only">{done ? " (done)" : here ? " (now)" : ""}</span>
              </span>
              {index < IMPORT_STEPS.length - 1 && <span aria-hidden className={cn("h-px min-w-4 flex-1", done ? "bg-success" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
      <p aria-hidden className="mt-2.5 text-sm font-semibold text-foreground sm:hidden">
        Step {current + 1} of {IMPORT_STEPS.length}: {IMPORT_STEPS[current]}
      </p>
    </div>
  );
}
