import { ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { STUDENT_PAGE_SIZES } from "../../constants/students";
import type { StudentPage } from "../../types";
import { cn } from "../../utils/helpers";
import { pageNumbers } from "../../utils/students";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

/**
 * "Showing 1 to 12 of 40 students" at the left; "Rows per page" and the numbered pages at the right (previous, 1 2 3, next). The
 * pages are the server's: pressing a number asks for that page. (The attendance register cuts a list it already holds into pages the same
 * way: it needs only the counts and how many rows the page has, so it passes just those.)
 */
export type PagerPage = Pick<StudentPage, "page" | "limit" | "total" | "totalPages"> & { items: readonly unknown[] };

export function StudentPager({
  page,
  limit,
  onPage,
  onLimit,
  compact = false,
}: {
  page: PagerPage;
  limit: number;
  onPage: (page: number) => void;
  onLimit?: (limit: number) => void;
  /** The register's look (2026-11-16): smaller buttons, the word Page before them and an arrow to the last page. */
  compact?: boolean;
}) {
  const from = page.total > 0 ? (page.page - 1) * page.limit + 1 : 0;
  const to = Math.min(page.total, from + page.items.length - 1);

  return (
    <nav aria-label="Pages of students" className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-3", compact ? "text-[13px] text-foreground" : "text-sm text-foreground-muted")}>
      <span aria-live="polite">{page.total > 0 ? `Showing ${from} to ${to} of ${page.total} student${page.total === 1 ? "" : "s"}` : "Showing 0 students"}</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* A list with a fixed page (the attendance register) passes no `onLimit` and has no such box. */}
        {onLimit && (
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <div className="w-[5.5rem]">
              <Select id="students-rows" aria-label="Rows per page" value={String(limit)} options={STUDENT_PAGE_SIZES.map(String)} onChange={(next) => onLimit(Number(next))} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {compact && <span className="mr-1">Page</span>}
          <Button variant="outline" className={compact ? "size-8 px-0" : "px-2.5"} aria-label="Previous page" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          {pageNumbers(page.page, page.totalPages).map((n, i) =>
            n === "gap" ? (
              <span key={`gap-${i}`} aria-hidden className="px-1 text-foreground-muted">
                ...
              </span>
            ) : (
              <button
                key={n}
                type="button"
                aria-label={`Page ${n}`}
                aria-current={n === page.page ? "page" : undefined}
                onClick={() => n !== page.page && onPage(n)}
                className={cn(
                  "rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                  compact ? "h-8 min-w-8 px-1.5 text-[13px]" : "h-10 min-w-10 px-2 text-sm",
                  n === page.page
                    ? "border-transparent bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)]"
                    : "border-border bg-surface text-foreground hover:border-primary/40 hover:bg-primary-soft"
                )}
              >
                {n}
              </button>
            )
          )}
          <Button variant="outline" className={compact ? "size-8 px-0" : "px-2.5"} aria-label="Next page" disabled={page.page >= page.totalPages} onClick={() => onPage(page.page + 1)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {compact && (
            <Button variant="outline" className="size-8 px-0" aria-label="Last page" disabled={page.page >= page.totalPages} onClick={() => onPage(page.totalPages)}>
              <ChevronsRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
