import type { ReactNode } from "react";

/**
 * The bar at the bottom of the admission and the edit form: a line, then the form's buttons (the page puts its own on the left and the
 * right). It is pinned to the bottom of the screen while the form is on it, so the one Admit / Save button is always in reach, and it
 * reaches across the page's padding (`-mx-4 lg:-mx-8`, the signed-in layout's) so the form's cards never show behind it at the sides.
 */
export function FormActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
      <div className="flex items-center justify-between gap-3">{children}</div>
    </div>
  );
}
