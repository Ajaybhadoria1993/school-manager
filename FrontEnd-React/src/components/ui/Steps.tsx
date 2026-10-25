import { Check } from "lucide-react";
import { cn } from "../../utils/helpers";

/**
 * The steps of a form in a row, like the school's onboarding: a numbered circle and a name for each, a tick on the ones that are done,
 * a line between them. A step can be opened again once the person has been there (`furthest`); the next one is reached with the form's
 * own Next button. Below a laptop width it shrinks to "Step 2 of 4: Personal info" with a bar of one piece per step.
 */
export function Steps({
  steps,
  active,
  completed,
  furthest,
  onSelect,
}: {
  steps: readonly { label: string }[];
  /** The step on screen (0 is the first). */
  active: number;
  /** The steps that were filled in and passed. */
  completed: readonly number[];
  /** The last step the person has been to: every step up to it can be opened. */
  furthest: number;
  onSelect?: (index: number) => void;
}) {
  const total = steps.length;
  const isDone = (i: number) => completed.includes(i);

  return (
    <>
      <div className="lg:hidden">
        <p className="text-sm font-semibold text-foreground">
          Step {active + 1} of {total}: <span className="text-primary">{steps[active]?.label}</span>
        </p>
        <div className="mt-2.5 flex gap-1.5" aria-hidden>
          {steps.map((step, i) => (
            <span key={step.label} className={cn("h-1.5 flex-1 rounded-full transition-colors", isDone(i) || i === active ? "bg-primary" : "bg-surface-muted")} />
          ))}
        </div>
      </div>

      <ol className="hidden items-center lg:flex" aria-label="Steps">
        {steps.map((step, i) => {
          const done = isDone(i);
          const current = i === active;
          const clickable = !!onSelect && i <= furthest && !current;
          const last = i === total - 1;

          return (
            <li key={step.label} className={cn("flex items-center", !last && "flex-1")}>
              <button
                type="button"
                onClick={() => clickable && onSelect?.(i)}
                disabled={!clickable}
                aria-current={current ? "step" : undefined}
                className={cn("group flex shrink-0 items-center gap-2.5 rounded-full py-1 pr-1 text-left", clickable ? "cursor-pointer" : "cursor-default")}
              >
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
                  {done && !current ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-sm transition-colors",
                    current ? "font-semibold text-primary" : done ? "font-medium text-foreground group-hover:text-primary" : "text-foreground-muted"
                  )}
                >
                  {step.label}
                </span>
                {done && <span className="sr-only">done</span>}
              </button>
              {!last && <span aria-hidden className={cn("mx-3 h-0.5 min-w-4 flex-1 rounded-full transition-colors", i < active || done ? "bg-primary" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
    </>
  );
}
