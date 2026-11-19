import { useEffect, useRef, useState } from "react";
import { CalendarX2, ChevronDown } from "lucide-react";
import { cn } from "../../utils/helpers";

export interface PendingClass {
  classId: string;
  sectionId: string | null;
  label: string;
}

/**
 * The classes that have not taken today's attendance (2026-11-16, like the reference picture): one cream strip, the classes in ONE row.
 * A school with many classes fills the row: a chevron at the end appears then, and opens the rest (and closes it again). A click on a
 * class opens it, for today.
 */
export function NotTakenStrip({ pending, onPick }: { pending: PendingClass[]; onPick: (p: PendingClass) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [crowded, setCrowded] = useState(false);

  // The row is too full when its list is taller than the one row that shows. While it is open the answer is kept (the chevron stays).
  useEffect(() => {
    const el = row.current;
    if (!el || open) return;
    const measure = () => setCrowded(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [pending, open]);

  return (
    <section aria-label="Attendance not taken today" className="flex items-start gap-3 rounded-xl border border-warning-line bg-warning-soft/60 px-3 py-2 text-sm">
      <span className="flex h-8 shrink-0 items-center gap-2 font-bold text-warning">
        <CalendarX2 className="size-4" aria-hidden />
        Not taken today
      </span>
      <div ref={row} className={cn("flex min-w-0 flex-1 flex-wrap gap-1.5", !open && "max-h-8 overflow-hidden")}>
        {pending.map((p) => (
          <button
            key={`${p.classId}-${p.sectionId ?? ""}`}
            type="button"
            onClick={() => onPick(p)}
            className="h-8 rounded-lg border border-warning-line bg-surface px-2.5 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
          >
            {p.label}
          </button>
        ))}
      </div>
      {(crowded || open) && (
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Show fewer classes" : "Show all classes"}
          onClick={() => setOpen((was) => !was)}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-foreground-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
      )}
    </section>
  );
}
