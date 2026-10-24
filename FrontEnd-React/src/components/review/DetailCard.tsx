import type { LucideIcon } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import { CopyButton } from "./RowActions";

/** A titled card of facts. Each card eases in after the one before it (give it its place with `index`). */
export function DetailCard({
  icon: Icon,
  title,
  subtitle,
  tone = "primary",
  index = 0,
  aside,
  plain,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tone?: Tone;
  index?: number;
  aside?: React.ReactNode;
  /** For content that is not a list of DetailRows (the boards, say): no description list around it. */
  plain?: boolean;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <section
      className="stagger-item rounded-2xl border border-border bg-surface shadow-card transition-shadow duration-300 hover:shadow-raised"
      style={{ "--i": index } as React.CSSProperties}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t.tile)}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h2>
            {subtitle && <p className="truncate text-xs text-foreground-muted">{subtitle}</p>}
          </div>
        </div>
        {aside}
      </header>
      {plain ? <div className="px-5">{children}</div> : <dl className="divide-y divide-border px-5">{children}</dl>}
    </section>
  );
}

/**
 * One fact: a label, the value, and what can be done with it (copy it, call it, open it).
 * An empty value says "Not provided"; `important` makes that stand out in amber.
 */
export function DetailRow({
  label,
  children,
  copyText,
  actions,
  important,
  mono,
}: {
  label: string;
  children?: React.ReactNode;
  /** Shows a copy button for this text. */
  copyText?: string;
  actions?: React.ReactNode;
  important?: boolean;
  mono?: boolean;
}) {
  const empty = children === undefined || children === null || children === "";
  return (
    <div className="group/row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 py-3 sm:grid-cols-[10.5rem_minmax(0,1fr)_auto] sm:gap-x-4">
      {/* On a phone the label sits above, and the value and its actions share the line below. */}
      <dt className="col-span-2 text-sm text-foreground-muted sm:col-span-1">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
        {empty ? (
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
              important ? "bg-warning-soft text-warning" : "bg-surface-muted text-foreground-muted"
            )}
          >
            Not provided
          </span>
        ) : (
          <span className={cn(mono && "font-mono tracking-wide")}>{children}</span>
        )}
      </dd>
      <dd className="flex items-center justify-end gap-0.5">
        {/* Copy stays out of the way until the row is hovered or reached by keyboard (always there on a touch screen). */}
        {!empty && copyText && (
          <span className="opacity-0 transition-opacity duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100">
            <CopyButton text={copyText} label={label.toLowerCase()} />
          </span>
        )}
        {!empty && actions}
      </dd>
    </div>
  );
}
