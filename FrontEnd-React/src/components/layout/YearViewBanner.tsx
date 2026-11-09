import { ArrowLeft } from "lucide-react";
import { useYearView } from "../../hooks/useYearView";

/** Under the top bar while a year that is over is open: which year it is, and one click back to the running year. */
export function YearViewBanner() {
  const { viewing, running, choose } = useYearView();
  if (!viewing) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning-line bg-warning-soft px-4 py-2 text-sm lg:px-8 print:hidden">
      <p className="font-semibold text-warning">
        <span>Viewing {viewing.name}</span>
        <span className="ml-3 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-foreground-muted">Read only</span>
      </p>
      <button
        type="button"
        onClick={() => choose(null)}
        className="inline-flex items-center gap-1.5 rounded-full border border-warning-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {running ? `Back to ${running.name}` : "Back to the running year"}
      </button>
    </div>
  );
}
