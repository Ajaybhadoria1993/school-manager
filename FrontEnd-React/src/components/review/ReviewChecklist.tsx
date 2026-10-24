import { AlertTriangle, CheckCircle2, ListChecks, MinusCircle } from "lucide-react";
import { Chip } from "@heroui/react";
import type { Signal, SignalState } from "../../utils/review";
import { cn } from "../../utils/helpers";

const ICON: Record<SignalState, { icon: typeof CheckCircle2; tone: string; label: string }> = {
  ok: { icon: CheckCircle2, tone: "text-success", label: "In order" },
  warn: { icon: AlertTriangle, tone: "text-warning", label: "Look at this" },
  info: { icon: MinusCircle, tone: "text-foreground-muted/60", label: "Optional" },
};

/**
 * What the school did and did not tell us, so the reviewer sees at a glance what needs a look. Before the
 * school has sent anything in, it is only "filled in so far": gaps then are not something to worry about yet.
 */
export function ReviewChecklist({ signals, submitted, index }: { signals: Signal[]; submitted: boolean; index: number }) {
  const ok = signals.filter((s) => s.state === "ok").length;
  const warnings = signals.filter((s) => s.state === "warn").length;

  return (
    <section className="stagger-item rounded-2xl border border-border bg-surface shadow-card" style={{ "--i": index } as React.CSSProperties}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info">
            <ListChecks className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">{submitted ? "Before you decide" : "Filled in so far"}</h2>
            <p className="text-xs text-foreground-muted">
              {!submitted
                ? "The school has not submitted yet"
                : warnings === 0
                  ? "Nothing needs a second look"
                  : `${warnings} point${warnings === 1 ? "" : "s"} to look at`}
            </p>
          </div>
        </div>
        <Chip color={!submitted ? "default" : warnings === 0 ? "success" : "warning"} variant="soft" size="sm">
          <Chip.Label>
            {ok}/{signals.length}
          </Chip.Label>
        </Chip>
      </header>
      <ul className="divide-y divide-border px-5">
        {signals.map((signal, i) => {
          const { icon: Icon, tone, label } = ICON[signal.state];
          return (
            <li key={signal.id} className="flex items-start gap-3 py-3">
              <Icon
                className={cn("pop-in mt-0.5 size-5 shrink-0", tone)}
                style={{ animationDelay: `${350 + i * 70}ms` }}
                aria-label={label}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{signal.label}</p>
                <p className={cn("text-xs [overflow-wrap:anywhere]", signal.state === "warn" ? "text-warning" : "text-foreground-muted")}>{signal.hint}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
