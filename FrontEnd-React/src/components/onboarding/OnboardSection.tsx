import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { InfoTip } from "../ui/Hint";

/**
 * One part of a screen of the sign-up form: a white rounded card on the light page, with its icon in a soft blue square, its title in bold
 * and a line running to the right (and any button), then its boxes. The cards come in one after the other.
 */
export function OnboardSection({
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
  /** At the right of the title (a button such as "Add another board"). */
  action?: ReactNode;
  index?: number;
  children: ReactNode;
}) {
  return (
    <section className="stagger-item rounded-2xl border border-white bg-white/90 p-4 shadow-raised sm:p-5" style={{ "--i": index } as React.CSSProperties}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon className="size-[18px]" />
        </span>
        <h2 className="flex items-center gap-1 text-base font-bold text-foreground">
          {title}
          {tip && <InfoTip label={`About ${title.toLowerCase()}`}>{tip}</InfoTip>}
        </h2>
        <span aria-hidden className="h-px min-w-6 flex-1 bg-border" />
        {action}
      </div>
      {children}
    </section>
  );
}
