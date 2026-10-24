import type { ReactNode } from "react";
import { PageBackNav, type Crumb } from "../ui/PageBackNav";

/**
 * The top of every student page, in the plain style of the list: the title (and a short line beside it), then the round Back arrow
 * and where the page sits ("Students > Add student"), and the page's buttons at the right (`actions`). No banner.
 * `crumbs` are the steps before this page (the student list by default); the last crumb is the title itself. `onBack` replaces where
 * the arrow goes (an edit form that is not an address of its own, or a page that asks before it is left).
 */
export function StudentFormHeader({
  title,
  subtitle,
  current,
  crumbs = [{ label: "Students", to: "/school/students" }],
  onBack,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  /** The last crumb when it differs from the title ("Edit" under "Edit student"). */
  current?: string;
  crumbs?: Crumb[];
  onBack?: () => void;
  /** Buttons at the right of the header (a student's page: Admit a sibling, Edit). */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-foreground sm:text-[1.75rem]">{title}</h1>
          {subtitle && <p className="text-sm text-foreground-muted">{subtitle}</p>}
        </div>
        <PageBackNav className="mt-2" crumbs={[...crumbs, { label: current ?? title }]} onBack={onBack} />
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </header>
  );
}
