import { Fragment } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "../../utils/helpers";

/** One step of the trail: a link (`to`), an in-page step (`onClick`, for a screen that is not an address of its own), or plain text. */
export interface Crumb {
  label: string;
  to?: string;
  onClick?: () => void;
}

/**
 * The app's one "go back": a round arrow, then where the page sits ("Students > Add student"), under the page title. The arrow goes
 * to `onBack` when given (an edit form that is not an address of its own, or a page that asks before leaving), else to the crumb
 * before the last, else one step back in the browser's history. Every crumb but the last is a way back too; the last is this page.
 * `onDark` is for a deep-blue banner.
 */
export function PageBackNav({ crumbs, onBack, onDark = false, className }: { crumbs: Crumb[]; onBack?: () => void; onDark?: boolean; className?: string }) {
  const navigate = useNavigate();
  const previous = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
  const back = () => {
    if (onBack) onBack();
    else if (previous?.onClick) previous.onClick();
    else if (previous?.to) navigate(previous.to);
    else navigate(-1);
  };
  const crumbLink = cn(
    "shrink-0 rounded font-medium underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2",
    onDark ? "text-slate-200 hover:text-white focus-visible:ring-white/40" : "text-foreground-muted hover:text-primary focus-visible:ring-primary/30"
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 sm:gap-3", className)}>
      <button
        type="button"
        onClick={back}
        aria-label={`Back to ${previous?.label ?? "the previous page"}`}
        title={`Back to ${previous?.label ?? "the previous page"}`}
        className={cn(
          "group/back grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-4",
          onDark
            ? "border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-white/30"
            : "border-border bg-surface text-foreground-muted hover:border-primary/50 hover:bg-primary-soft hover:text-primary-deep focus-visible:ring-primary/20"
        )}
      >
        <ArrowLeft className="size-4 transition-transform duration-200 group-hover/back:-translate-x-0.5" aria-hidden />
      </button>
      <nav aria-label="Breadcrumb" className={cn("flex min-w-0 flex-wrap items-center gap-1.5 text-xs sm:gap-2 sm:text-sm", onDark ? "text-slate-200" : "text-foreground-muted")}>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />}
              {last ? (
                <span aria-current="page" className={cn("truncate font-semibold", onDark ? "text-white" : "text-primary-deep")}>
                  {crumb.label}
                </span>
              ) : crumb.to ? (
                <Link to={crumb.to} className={crumbLink}>
                  {crumb.label}
                </Link>
              ) : crumb.onClick ? (
                <button type="button" onClick={crumb.onClick} className={cn(crumbLink, "cursor-pointer")}>
                  {crumb.label}
                </button>
              ) : (
                <span className="shrink-0 font-medium">{crumb.label}</span>
              )}
            </Fragment>
          );
        })}
      </nav>
    </div>
  );
}
