import { useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/helpers";

export interface PageTab<T extends string = string> {
  id: T;
  label: string;
  /** A number after the name (0 is shown); left out, there is none. */
  count?: number;
  /** A small icon before the name (hidden from a screen reader: the name says it). */
  icon?: LucideIcon;
}

/**
 * The tabs of a page (2026-11-22, the reference pictures): side by side under the page's title, the open one with an orange bar under it and
 * every tab with its count. They are tabs of ONE page, not links to other pages: the caller keeps which one is open (in the address, so a
 * reload and the back button keep it) and shows what belongs to it. Only the open tab is a stop of the Tab key; the arrow keys move to the
 * next and the one before (the last follows the first).
 */
export function PageTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  className,
}: {
  /** What the tabs choose between, for a screen reader ("Which students to show"). */
  label: string;
  tabs: readonly PageTab<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function move(from: number, step: number) {
    const next = (from + step + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === "ArrowRight") move(index, 1);
    else if (event.key === "ArrowLeft") move(index, -1);
    else return;
    event.preventDefault();
  }

  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {tabs.map((tab, index) => {
        const open = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={open}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              if (!open) onChange(tab.id);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "relative inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
              open
                ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-orange"
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            {tab.icon && <tab.icon className="size-4" aria-hidden />}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold leading-none", open ? "bg-orange-soft text-foreground" : "bg-surface-muted text-foreground-muted")}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
