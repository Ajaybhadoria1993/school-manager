import { ChevronLeft, ChevronRight } from "lucide-react";
import { STUDENT_PAGE_SIZES } from "../../constants/students";
import type { StudentPage } from "../../types";
import { cn } from "../../utils/helpers";
import { pageNumbers } from "../../utils/students";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

/**
 * "Showing 1 to 12 of 40 students" at the left; "Rows per page" and the numbered pages at the right (previous, 1 2 3, next). The
 * pages are the server's: pressing a number asks for that page.
 */
export function StudentPager({ page, limit, onPage, onLimit }: { page: StudentPage; limit: number; onPage: (page: number) => void; onLimit: (limit: number) => void }) {
  const from = page.total > 0 ? (page.page - 1) * page.limit + 1 : 0;
  const to = Math.min(page.total, from + page.items.length - 1);

  return (
    <nav aria-label="Pages of students" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 text-sm text-foreground-muted">
      <span aria-live="polite">{page.total > 0 ? `Showing ${from} to ${to} of ${page.total} student${page.total === 1 ? "" : "s"}` : "Showing 0 students"}</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <div className="w-[5.5rem]">
            <Select id="students-rows" aria-label="Rows per page" value={String(limit)} options={STUDENT_PAGE_SIZES.map(String)} onChange={(next) => onLimit(Number(next))} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" className="px-2.5" aria-label="Previous page" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
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
                  "h-10 min-w-10 rounded-lg border px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                  n === page.page
                    ? "border-transparent bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)]"
                    : "border-border bg-surface text-foreground hover:border-primary/40 hover:bg-primary-soft"
                )}
              >
                {n}
              </button>
            )
          )}
          <Button variant="outline" className="px-2.5" aria-label="Next page" disabled={page.page >= page.totalPages} onClick={() => onPage(page.page + 1)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  );
}
