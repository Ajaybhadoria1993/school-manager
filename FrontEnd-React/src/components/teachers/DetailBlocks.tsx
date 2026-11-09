import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import { Card } from "../ui/Card";

/** What a detail the school has not been given shows. */
export const None = () => <span className="font-normal text-foreground-muted">Not given</span>;

/** One block of the page: a coloured mark and a title, then rows. */
export function Block({ icon: Icon, tone, title, index = 0, children }: { icon: LucideIcon; tone: Tone; title: string; index?: number; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <Card role="region" aria-label={title} className="stagger-item relative overflow-hidden p-5" style={{ "--i": index } as React.CSSProperties}>
      <div aria-hidden className={cn("pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br to-transparent blur-2xl", t.glow)} />
      <h2 className="relative flex items-center gap-2.5 text-base font-bold tracking-tight text-foreground">
        <span aria-hidden className={cn("flex size-9 items-center justify-center rounded-xl", t.gradient)}>
          <Icon className="size-4.5" />
        </span>
        {title}
      </h2>
      <dl className="relative mt-4">{children}</dl>
    </Card>
  );
}

/** A label and its value, one row of a block. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border/70 py-2 last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

