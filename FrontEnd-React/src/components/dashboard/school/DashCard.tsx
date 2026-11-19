import type { ReactNode } from "react";
import { Card } from "../../ui/Card";
import { cn } from "../../../utils/helpers";

/**
 * One card of the school's dashboard (the look of Infinity Medisetu's section card, 2026-11-10): a small icon, a title (the card's name for a
 * screen reader too) with the days it is about under it, something on the right (a count, a link), and the content. Plain white and the same
 * in every card; cards use their content height instead of stretching to a taller neighbor.
 */
export function DashCard({
  title,
  description,
  icon,
  aside,
  id,
  className,
  children,
}: {
  title: string;
  /** The days or the period the card is about: "10 Nov", "Last 6 months". */
  description?: string;
  icon?: ReactNode;
  aside?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} role="region" aria-label={title} className={cn("flex min-w-0 flex-col p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-section-heading">{title}</h2>
            {description && <p className="truncate text-caption-subtle">{description}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0 text-body-label">{aside}</div>}
      </header>
      {children}
    </Card>
  );
}
