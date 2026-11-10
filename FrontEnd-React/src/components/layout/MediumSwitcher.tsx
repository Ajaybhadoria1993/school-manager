import { useState } from "react";
import { useNavigate } from "react-router";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useDismiss } from "../../hooks/useDismiss";
import { useMedium } from "../../hooks/useMedium";
import { cn } from "../../utils/helpers";

/**
 * Which medium of the school is open, in the top bar: English Medium, Hindi Medium. Each runs on its own, so moving goes to the dashboard
 * (a class or a student open on one side means nothing on the other). A school with one medium shows nothing here.
 */
export function MediumSwitcher() {
  const { mediums, current, choose } = useMedium();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (mediums.length === 0 || !current) return null;

  const pick = (id: string) => {
    setOpen(false);
    if (id === current.id) return;
    choose(id);
    navigate("/dashboard");
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Medium"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex max-w-[11rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary-deep transition-colors hover:border-primary/50 sm:max-w-none"
      >
        <Languages className="hidden size-3.5 sm:block" aria-hidden />
        <span className="truncate">{current.label}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Mediums" className="pop-in absolute right-0 top-11 z-30 w-64 origin-top-right rounded-2xl border border-border bg-surface p-1.5 shadow-float">
          {mediums.map((m) => {
            const selected = m.id === current.id;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => pick(m.id)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
              >
                <span className="min-w-0 truncate">{m.label}</span>
                {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
