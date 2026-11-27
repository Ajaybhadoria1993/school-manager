import { cn } from "../../utils/helpers";

/** How far a subject's chapters are: "3 of 12" over a bar. `words` follows the count ("chapters done"). */
export function ChapterBar({ done, total, words, className }: { done: number; total: number; words?: string; className?: string }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className={cn("min-w-[7rem] space-y-1", className)}>
      <p className="text-xs font-semibold text-foreground-muted">
        {done} of {total}
        {words ? ` ${words}` : ""}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <div className={cn("h-full rounded-full", percent === 100 ? "bg-success" : "bg-primary")} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
