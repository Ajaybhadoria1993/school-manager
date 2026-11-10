import { Link } from "react-router";
import type { ReactNode } from "react";
import { cn } from "../../../utils/helpers";

/** A change from the days before, said as the card shows it: an arrow, a number, and which way is good. */
export interface Trend {
  /** "↑ +6%", "↑ 3 admitted", "New". */
  text: string;
  /** Good (green), bad (red) or neither (grey). */
  tone: "good" | "bad" | "neutral";
}

/**
 * One figure of the top row, in the look of Infinity Medisetu's stat card (2026-11-10): a tinted icon, what it counts, the number, and under it
 * how it went against the days before (an arrow and a percent, then "vs yesterday"). A card with a `hint` says that instead (a count of
 * people has no change). A `href` makes the whole card a link; the card is its own group, named by what it counts.
 */
export function MetricCard({
  icon,
  label,
  value,
  trend,
  versus,
  hint,
  href,
  iconClass,
  className,
}: {
  icon: ReactNode;
  label: string;
  /** What is counted; null while it is not known (a dash is shown, never a 0). */
  value: string | null;
  trend?: Trend | null;
  /** "vs yesterday", "vs 1 yesterday": said after the change. */
  versus?: string;
  hint?: string;
  href?: string | null;
  /** The colours of the icon's box. */
  iconClass: string;
  className?: string;
}) {
  const body = (
    <div role="group" aria-label={label} className="flex min-w-0 flex-1 flex-col items-start gap-2 @[190px]:flex-row @[190px]:gap-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", iconClass)} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-body-label">{label}</span>
        <span className="mt-0.5 block whitespace-nowrap text-stat-value">{value ?? "–"}</span>
        {hint ? (
          <span className="mt-0.5 block truncate text-caption-subtle">{hint}</span>
        ) : trend ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1 text-caption-subtle">
            <span className={cn("font-semibold", trend.tone === "good" ? "text-success" : trend.tone === "bad" ? "text-danger" : "text-foreground-muted")}>{trend.text}</span>
            {versus && <span>{versus}</span>}
          </span>
        ) : (
          <span className="mt-0.5 hidden h-4 sm:block" aria-hidden />
        )}
      </div>
    </div>
  );
  const frame = cn("@container flex min-w-0 rounded-2xl border border-border bg-surface p-3.5 shadow-card", className);
  return href ? (
    <Link to={href} className={cn(frame, "transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20")}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
