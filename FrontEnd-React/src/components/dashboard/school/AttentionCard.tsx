import { Link } from "react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { AttentionRow, AttentionTone } from "../../../utils/dashboard";
import { cn } from "../../../utils/helpers";
import { DashCard } from "./DashCard";

/** Each tone is the status colours of the app: a tinted tile with its icon, a hairline in the same colour. */
const TONE: Record<AttentionTone, string> = {
  danger: "bg-danger-soft text-danger ring-danger-line",
  warning: "bg-warning-soft text-warning ring-warning-line",
  info: "bg-info-soft text-info ring-info-line",
};

function Row({ row }: { row: AttentionRow }) {
  const body = (
    <>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", TONE[row.tone])}>
        <row.icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">{row.text}</span>
      {row.to && <ArrowRight className="size-4 shrink-0 text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />}
    </>
  );
  const frame = "group flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5";
  return row.to ? (
    <Link to={row.to} className={cn(frame, "transition-colors hover:border-primary/40 hover:bg-primary-soft/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20")}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}

/** "Needs your attention": the list the head acts from. */
export function AttentionCard({ rows }: { rows: AttentionRow[] }) {
  return (
    <DashCard title="Needs your attention" id="attention" aside={rows.length > 0 ? String(rows.length) : undefined}>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2.5 rounded-xl bg-success-soft px-3.5 py-3 text-sm font-semibold text-success ring-1 ring-success-line">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          Nothing needs your attention right now
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key}>
              <Row row={row} />
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}
