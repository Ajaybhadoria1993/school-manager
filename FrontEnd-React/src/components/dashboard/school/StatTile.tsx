import { Link } from "react-router";
import type { LucideIcon } from "lucide-react";
import { useCountUp } from "../../../hooks/useMotion";
import { TONES, type Tone } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";

interface StatTileProps {
  label: string;
  /** A number counts up; a word (a month, say) is shown as it is; `null` means not available yet. */
  value: number | string | null;
  /** A small line under the number (the dashboard); a list page leaves it out. */
  hint?: string;
  icon: LucideIcon;
  tone: Tone;
  /** Where the tile leads; without it the tile is plain. */
  href?: string;
}

/**
 * One number about the school, on the dashboard: a flat white tile with the icon on the left (like the Infinity Medisetu
 * dashboard). No glow, no tilt, no moving line; only the border darkens when the tile is a link and the pointer is on it.
 */
export function StatTile({ label, value, hint, icon: Icon, tone, href }: StatTileProps) {
  const counted = useCountUp(typeof value === "number" ? value : 0);
  const shown = value === null ? null : typeof value === "number" ? counted.toLocaleString("en-IN") : value;
  const frame = cn(
    "flex items-center gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card",
    href && "transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
  );
  const body = (
    <>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONES[tone].tile)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground-muted">{label}</span>
        <span className="block truncate text-2xl font-bold tracking-[-0.02em] text-foreground">
          {shown ?? <span className="text-foreground-muted/60">-</span>}
        </span>
        {hint && <span className="block truncate text-xs text-foreground-muted">{hint}</span>}
      </span>
    </>
  );
  return href ? (
    <Link to={href} className={frame}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
