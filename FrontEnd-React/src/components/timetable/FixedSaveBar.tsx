import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFooterSlot } from "../layout/FooterSlot";

/**
 * The buttons of a page that has one Save (School timings), kept where they are while the page scrolls (user, 2026-11-13, three times: "scroll
 * ke saath scroll na ho, fix rahe apni jagah par"). In the signed-in app they stand in the layout's footer strip (\`FooterSlot\`): the strip is under
 * the scroll pane, not in it, so the page scrolls above the buttons and never behind them, and nothing moves them. Only the buttons are
 * drawn (each has a look of its own; the strip has no card or band, the page's colour shows). Where there is no such layout (a test, a page on
 * its own) they are fixed to the bottom right of the screen, drawn on the page itself (a portal into the body, outside the page's animated box,
 * where a fixed element would be moved by its ancestors), under the windows (they are above it) and not printed.
 */
export function FixedSaveBar({ children }: { children: ReactNode }) {
  const slot = useFooterSlot();
  if (slot) {
    return createPortal(
      <div data-fixed-bar className="flex items-center justify-end gap-2">
        {children}
      </div>,
      slot
    );
  }
  return createPortal(
    <div data-fixed-bar className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-end pr-4 sm:pr-8 lg:pr-12 print:hidden">
      <div className="pointer-events-auto flex items-center gap-2">{children}</div>
    </div>,
    document.body
  );
}
