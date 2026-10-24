import { Link } from "react-router";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { useCountUp } from "../../../hooks/useMotion";
import { TONES, type Tone } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";

interface KpiCardProps {
  label: string;
  /** A number counts up; a word (a month, say) is shown as it is; `null` means not available yet. */
  value: number | string | null;
  hint: string;
  icon: LucideIcon;
  tone: Tone;
  /** Where the card leads; without it the card is a plain tile. */
  href?: string;
  index?: number;
}

function Value({ value }: { value: number | string | null }) {
  const counted = useCountUp(typeof value === "number" ? value : 0);
  if (value === null)
    return <span className="text-foreground-muted/60">-</span>;
  return (
    <>{typeof value === "number" ? counted.toLocaleString("en-IN") : value}</>
  );
}

/** One number about the school. It lifts on hover, its icon tilts, and a coloured line draws itself along the bottom. */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  href,
  index = 0,
}: KpiCardProps) {
  const t = TONES[tone];
  const frame = {
    className:
      "stagger-item group relative block overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-float focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
    style: { "--i": index } as React.CSSProperties,
  };
  const body = (
    <>
      <div
        aria-hidden
        className={cn(
          "absolute -right-8 -top-8 size-32 rounded-full bg-gradient-to-br to-transparent blur-xl",
          t.glow,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground-muted">{label}</p>
          <p className="mt-1.5 truncate text-3xl font-extrabold tracking-[-0.03em] text-foreground">
            <Value value={value} />
          </p>
        </div>
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110",
            t.tile,
          )}
        >
          <Icon className="size-6" aria-hidden />
        </span>
      </div>
      <p className="relative mt-3 flex items-center justify-between gap-2 text-xs text-foreground-muted">
        <span className="truncate">{hint}</span>
        {href && (
          <ArrowUpRight
            className="size-4 shrink-0 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100"
            aria-hidden
          />
        )}
      </p>
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-1 origin-left scale-x-[0.18] transition-transform duration-500 ease-out group-hover:scale-x-100",
          t.line,
        )}
      />
    </>
  );
  return href ? (
    <Link to={href} {...frame}>
      {body}
    </Link>
  ) : (
    <div {...frame}>{body}</div>
  );
}
