import type { ReactNode } from "react";
import { cn } from "../../../utils/helpers";

/**
 * The tooltip of a mark: shown while the pointer is over the mark (its parent carries `group/mark`). It stays in the page (not shown), so what
 * it says is there for a test or a tool that reads the page; being not shown, it never widens the page past a phone's edge.
 */
export function Tip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-20 hidden whitespace-nowrap rounded-lg bg-navy px-2.5 py-1.5 text-xs font-semibold text-white shadow-float group-hover/mark:block",
        className,
      )}
    >
      {children}
    </span>
  );
}
