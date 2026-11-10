import type { ReactNode } from "react";
import { cn } from "../../../utils/helpers";

/**
 * The bar at the bottom of the admission and the edit form: a line, then the form's buttons (the page puts its own on the left and the
 * right). It is pinned to the bottom of the screen while the form is on it, so the one Admit / Save button is always in reach, and it
 * reaches across the page's padding (`-mx-4 lg:-mx-8`, the signed-in layout's) so the form's cards never show behind it at the sides.
 * `wide`: the form already stands half of that padding wider (the student forms), so the bar reaches out by the other half.
 */
export function FormActionBar({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur", wide ? "lg:-mx-4 lg:px-4" : "lg:-mx-8 lg:px-8")}>
      <div className="flex items-center justify-between gap-3">{children}</div>
    </div>
  );
}
