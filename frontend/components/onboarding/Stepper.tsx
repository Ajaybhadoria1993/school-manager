import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPPER_LABELS } from "@/lib/schoolOptions";

/**
 * The five stages in a row: four steps to fill in, then verification by the platform team.
 * A step can be opened once it is done, or when it is the next one to do; verification is never a button.
 * Below a laptop width it shrinks to "Step 2 of 5" with a progress bar.
 */
export function Stepper({
  active,
  completed,
  maxOpen,
  onSelect,
}: {
  /** 1-4 for the form steps, 5 while the application is being verified. */
  active: number;
  completed: number[];
  /** The furthest step the user may open (the first one not done yet). */
  maxOpen: number;
  onSelect?: (step: number) => void;
}) {
  const total = STEPPER_LABELS.length;
  const isDone = (step: number) => (step === total ? false : completed.includes(step)) || step < active;

  return (
    <>
      <div className="lg:hidden" aria-label="Progress">
        <p className="text-sm font-semibold text-foreground">
          Step {active} of {total}: <span className="text-primary">{STEPPER_LABELS[active - 1]}</span>
        </p>
        <div className="mt-2.5 flex gap-1.5" aria-hidden>
          {STEPPER_LABELS.map((_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", isDone(i + 1) || i + 1 === active ? "bg-primary" : "bg-surface-muted")} />
          ))}
        </div>
      </div>

      <ol className="hidden items-center lg:flex" aria-label="Steps">
        {STEPPER_LABELS.map((label, i) => {
          const step = i + 1;
          const done = isDone(step);
          const current = step === active;
          const clickable = !!onSelect && step < total && step <= maxOpen && !current;
          const last = step === total;

          const circle = (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all",
                current
                  ? "bg-primary text-primary-foreground shadow-[0_0_0_5px_rgb(37_99_235/0.15)]"
                  : done
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface text-foreground-muted"
              )}
            >
              {done && !current ? <Check className="size-4" strokeWidth={3} aria-hidden /> : step}
            </span>
          );

          return (
            <li key={label} className={cn("flex items-center", !last && "flex-1")}>
              <button
                type="button"
                onClick={() => clickable && onSelect?.(step)}
                disabled={!clickable}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "group flex shrink-0 items-center gap-2.5 rounded-full py-1 pr-1 text-left",
                  clickable ? "cursor-pointer" : "cursor-default"
                )}
              >
                {circle}
                <span
                  className={cn(
                    "whitespace-nowrap text-sm transition-colors",
                    current ? "font-semibold text-primary" : done ? "font-medium text-foreground group-hover:text-primary" : "text-foreground-muted"
                  )}
                >
                  {label}
                </span>
              </button>
              {!last && <span aria-hidden className={cn("mx-3 h-0.5 min-w-4 flex-1 rounded-full transition-colors", step < active || done ? "bg-primary" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
    </>
  );
}
