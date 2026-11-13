import { useCallback, useState, type ReactNode } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { useDismiss } from "../../hooks/useDismiss";
import { cn } from "../../utils/helpers";

/**
 * The dropdown of the top bar, in the look of Infinity Medisetu's panel switch: a bordered box with an icon, what is chosen and a
 * chevron; open, a card under it with a small heading ("Switch medium") and one row per choice (`MenuRow`), the one in use ticked. A press
 * outside it, or Escape, closes it; `children` gets `close` for a row that should close it when chosen. `tone="warning"` is for a choice
 * that shows something other than the usual (a past year).
 */
export function HeaderMenu({
  icon: Icon,
  label,
  ariaLabel,
  menuLabel,
  caption,
  tone = "default",
  width = "w-64",
  children,
}: {
  icon: LucideIcon;
  /** What is chosen now, in the box. */
  label: ReactNode;
  /** The box's own name (it is a button that opens a menu). */
  ariaLabel: string;
  menuLabel: string;
  /** The small heading of the card. */
  caption: string;
  tone?: "default" | "warning";
  width?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex h-10 max-w-[11rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border bg-surface px-3 text-sm font-semibold transition-colors sm:max-w-[16rem]",
          tone === "warning" ? "border-warning-line bg-warning-soft text-warning" : "text-foreground",
          tone === "default" && (open ? "border-primary" : "border-border hover:border-primary/40")
        )}
      >
        <Icon className="hidden size-[18px] shrink-0 sm:block" aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-foreground-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label={menuLabel} className={cn("pop-in absolute right-0 top-12 z-30 origin-top-right rounded-2xl border border-border bg-surface p-2 shadow-float", width)}>
          <p className="px-3 pb-2 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground-muted">{caption}</p>
          <div aria-hidden className="mx-1 mb-1.5 h-px bg-border" />
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** One choice of a `HeaderMenu`: an icon in a small tile, its words, and a tick when it is the one in use. */
export function MenuRow({
  icon: Icon,
  selected,
  onClick,
  trailing,
  children,
}: {
  icon: LucideIcon;
  selected: boolean;
  onClick: () => void;
  /** Something small after the words (a "Current" tag). */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors",
        selected ? "bg-primary-soft/60 font-semibold text-foreground" : "font-medium text-foreground hover:bg-surface-muted"
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", selected ? "bg-primary-soft text-primary" : "bg-surface-muted text-foreground-muted")}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
      {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
