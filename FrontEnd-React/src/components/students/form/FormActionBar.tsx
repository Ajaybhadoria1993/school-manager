import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFormBarSlot } from "../../layout/FormBarSlot";
import { cn } from "../../../utils/helpers";

/**
 * The bar at the bottom of a form: the form's buttons (the page puts its own on the left and the right). It is pinned to the bottom of
 * the screen while the form is on it, so the one Next / Admit / Save button is always in reach.
 *  - default: a line across the page, reaching over the page's padding (`-mx-4 lg:-mx-8`, the signed-in layout's) so the form's cards
 *    never show behind it at the sides. `wide`: the form already stands half of that padding wider, so the bar reaches out by the other half.
 *  - `dock` (the student forms): a solid, rounded card that floats a little above the bottom edge with a soft shadow, so the form never
 *    shows through it and its buttons read as one group. In the signed-in app it is put in the layout's bottom slot (FormBarSlot), so it
 *    stands in the same place on a short step and on a long one, and the page ends above it. It is then outside the `<form>` in the page:
 *    its submit button must say which form it belongs to (`form="the form's id"`). Without that slot (a test, a page on its own) it is
 *    pinned inside the form as before.
 */
export function FormActionBar({ children, wide = false, dock = false }: { children: ReactNode; wide?: boolean; dock?: boolean }) {
  const slot = useFormBarSlot();
  if (dock) {
    const card = <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 shadow-float">{children}</div>;
    // The forms stand 1rem wider than the page's padding on a laptop (`lg:-mx-4`): the bar in the slot reaches out by the same.
    return slot ? createPortal(<div className="lg:-mx-4">{card}</div>, slot) : <div className="sticky bottom-3 z-20">{card}</div>;
  }
  return (
    <div className={cn("sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur", wide ? "lg:-mx-4 lg:px-4" : "lg:-mx-8 lg:px-8")}>
      <div className="flex items-center justify-between gap-3">{children}</div>
    </div>
  );
}
