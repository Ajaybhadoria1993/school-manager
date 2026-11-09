import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageBackNav } from "../../ui/PageBackNav";

/** A department next to this one, as a link in the outline look of `Button variant="outline"`. */
const neighbour =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * The top of a department's own screen, in the plain style of the Students page (no banner): the department's name (with `action`, the
 * small pencil, beside it), one line about what is in it, then the round Back arrow and where the page sits ("Classes & Sections >
 * Primary"), and at the right the departments before and after this one.
 */
export function DepartmentHeader({
  title,
  facts,
  backTo,
  backLabel,
  previous,
  next,
  action,
}: {
  title: string;
  /** What is in the department, as short phrases: "4 classes", "3 sections", "160 seats". */
  facts: string[];
  backTo: string;
  backLabel: string;
  previous?: { name: string; to: string };
  next?: { name: string; to: string };
  /** Beside the name. */
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-1.5">
          <h1 className="truncate text-2xl font-extrabold tracking-[-0.02em] text-foreground sm:text-3xl">{title}</h1>
          {action}
        </div>
        <p className="mt-0.5 text-sm text-foreground-muted">{facts.join(" · ")}</p>
        <PageBackNav className="mt-2" crumbs={[{ label: backLabel, to: backTo }, { label: title }]} />
      </div>

      {(previous || next) && (
        <div className="flex flex-wrap items-center gap-2">
          {previous && (
            <Link to={previous.to} className={neighbour}>
              <ArrowLeft className="size-4" aria-hidden />
              {previous.name}
            </Link>
          )}
          {next && (
            <Link to={next.to} className={neighbour}>
              {next.name}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
