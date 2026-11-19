import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { InfoTip } from "../../ui/Hint";

/**
 * One part of a form (the student form, the school's sign-up form), inside the form's one white sheet: a strip with a coloured edge, its icon and title and an optional ?, a line
 * running to the right (and any button), then its boxes.
 */
export function FormSection({
  icon: Icon,
  title,
  tip,
  action,
  index = 0,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tip?: ReactNode;
  /** At the right of the title (a button such as "Add another guardian"). */
  action?: ReactNode;
  index?: number;
  children: ReactNode;
}) {
  return (
    <div className="stagger-item" style={{ "--i": index } as React.CSSProperties}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg border border-border border-l-[3px] border-l-gold! bg-surface-muted/50 px-3.5 py-2">
        <Icon className="size-[18px] shrink-0 text-gold" aria-hidden />
        <h2 className="flex items-center gap-1 text-sm font-bold text-foreground">
          {title}
          {tip && <InfoTip label={`About ${title.toLowerCase()}`}>{tip}</InfoTip>}
        </h2>
        <span aria-hidden className="h-px min-w-6 flex-1 bg-border" />
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
