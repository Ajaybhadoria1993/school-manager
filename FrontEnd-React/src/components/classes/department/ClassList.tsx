import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES } from "../../../hooks/useClassFilters";
import { TONES } from "../../../constants/tones";
import { classMark, plural, toneOf } from "../../../utils/academics";
import { cn } from "../../../utils/helpers";
import type { AcademicStructure, ClassItem, ClassPage } from "../../../types";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { Skeleton } from "../../ui/Skeleton";

/**
 * One class in the list: its mark in its department's colour, its name, and a line about it (how many sections and seats). Pressing
 * it opens it on the right; the one that is open takes the colour of its department along its left edge. (Every class of this list is in
 * the same department, so the line does not name it.)
 */
function Row({ item, structure, selected, onSelect }: { item: ClassItem; structure: AcademicStructure; selected: boolean; onSelect: () => void }) {
  const t = TONES[toneOf(structure, item.departmentId)];
  const seats = item.sections.reduce((sum, s) => sum + (s.capacity ?? 0), 0);
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "group relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
          selected ? cn("bg-gradient-to-r to-transparent", t.wash) : "hover:bg-background"
        )}
      >
        {selected && <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1 rounded-r-full", t.line)} />}
        <span
          aria-hidden
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold tracking-tight transition-transform duration-200 group-hover:scale-105", t.gradient)}
        >
          {classMark(item.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">{item.name}</span>
          <span className="block truncate text-xs text-foreground-muted">
            {item.sections.length === 0 ? "No sections" : plural(item.sections.length, "section")}
            {seats > 0 && <> · {seats} seats</>}
          </span>
        </span>
        <ChevronRight className={cn("size-4 shrink-0 text-foreground-muted/60 transition-transform group-hover:translate-x-0.5", selected && cn("translate-x-0.5", t.text))} aria-hidden />
      </button>
    </li>
  );
}

/**
 * The page of classes the server sent, and the controls to move through them: "Showing 1 to 10 of 16", the arrows, and how many
 * to show on a page. The list itself does no filtering: it draws what it is given.
 */
export function ClassList({
  page,
  loading,
  structure,
  selectedId,
  limit,
  onSelect,
  onPage,
  onLimit,
}: {
  page: ClassPage | undefined;
  /** True until the first answer arrives (a later request keeps showing the last page meanwhile). */
  loading: boolean;
  structure: AcademicStructure;
  selectedId: string | null;
  limit: number;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  if (loading && !page) {
    return (
      <div className="space-y-px" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[3.75rem] rounded-none" />
        ))}
      </div>
    );
  }

  const from = page && page.total > 0 ? (page.page - 1) * page.limit + 1 : 0;
  const to = page ? Math.min(page.total, from + page.items.length - 1) : 0;

  return (
    <div>
      {!page || page.items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-foreground-muted">No class matches these filters.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {page.items.map((item) => (
            <Row key={item.id} item={item} structure={structure} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 text-xs text-foreground-muted">
        <span aria-live="polite">{page && page.total > 0 ? `Showing ${from} to ${to} of ${page.total}` : "Showing 0 of 0"}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span id="rows-per-page">Rows</span>
            <div className="w-[5.5rem]">
              <Select aria-label="Rows per page" value={String(limit)} options={PAGE_SIZES.map(String)} onChange={(next) => onLimit(Number(next))} />
            </div>
          </div>
          <Button variant="outline" size="sm" className="px-2" aria-label="Previous page" disabled={!page || page.page <= 1} onClick={() => page && onPage(page.page - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="min-w-8 text-center font-semibold text-foreground">{page?.page ?? 1}</span>
          <Button
            variant="outline"
            size="sm"
            className="px-2"
            aria-label="Next page"
            disabled={!page || page.page >= page.totalPages}
            onClick={() => page && onPage(page.page + 1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
