import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { TONES, type Tone } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";
import { Card } from "../../ui/Card";
import { InfoTip } from "../../ui/Hint";

/** One block of the admission form: a coloured mark, a title, a line saying what it is for, an optional ?, and its boxes. */
export function FormCard({
  icon: Icon,
  tone,
  title,
  description,
  tip,
  action,
  index = 0,
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  description: string;
  tip?: ReactNode;
  /** At the right of the title (a button such as "Add another guardian"). */
  action?: ReactNode;
  index?: number;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <Card className="stagger-item relative overflow-hidden p-5 sm:p-6" style={{ "--i": index } as React.CSSProperties}>
      <div aria-hidden className={cn("pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br to-transparent blur-2xl", t.glow)} />
      <div className="relative flex flex-wrap items-start gap-3">
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t.gradient)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="flex items-center gap-1 text-base font-bold tracking-tight text-foreground">
            {title}
            {tip && <InfoTip label={`About ${title.toLowerCase()}`}>{tip}</InfoTip>}
          </h2>
          <p className="text-xs text-foreground-muted sm:text-sm">{description}</p>
        </div>
        {action}
      </div>
      <div className="relative mt-5">{children}</div>
    </Card>
  );
}
