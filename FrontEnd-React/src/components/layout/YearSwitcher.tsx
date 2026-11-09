import { useState } from "react";
import { Check, ChevronDown, History } from "lucide-react";
import { useDismiss } from "../../hooks/useDismiss";
import { useYearView } from "../../hooks/useYearView";
import { cn } from "../../utils/helpers";

/**
 * The academic year in the top bar, for the people who run the school: it names the year the screens are about and opens the years that
 * are over, to look at what the school was then (read only). A school that has no year that is over has nothing to pick, so it shows nothing.
 */
export function YearSwitcher() {
  const { canLook, running, viewing, offered, hasPast, choose } = useYearView();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (!canLook || !hasPast) return null;

  const shown = viewing ?? running;
  const pick = (id: string | null) => {
    choose(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Academic year"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
          viewing ? "border-warning-line bg-warning-soft text-warning" : "border-border bg-surface text-foreground hover:bg-surface-muted",
        )}
      >
        <History className="hidden size-3.5 sm:block" aria-hidden />
        {shown?.name}
        <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Academic years" className="pop-in absolute right-0 top-11 z-30 w-56 origin-top-right rounded-2xl border border-border bg-surface p-1.5 shadow-float">
          {offered.map((y) => {
            const selected = y.status === "active" ? !viewing : viewing?.id === y.id;
            return (
              <button
                key={y.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => pick(y.status === "active" ? null : y.id)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
              >
                <span className="flex items-center gap-2">
                  {y.name}
                  {y.status === "active" && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">Current</span>}
                </span>
                {selected && <Check className="size-4 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
