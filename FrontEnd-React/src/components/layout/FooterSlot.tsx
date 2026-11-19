import { createContext, useContext } from "react";

/**
 * The strip under the scroll pane of the signed-in app, where a page's own buttons stand while it scrolls (`MainLayout` makes it and hands its
 * element out here; `FixedSaveBar` fills it). Unlike the form bar slot (`FormBarSlot`, the last thing inside the pane), the strip is not part of
 * what scrolls: the pane ends above it, so the page never passes behind the buttons and they stay exactly where they are. It has no background
 * of its own (the page's shows), and takes no room when nothing is put in it. `null` where there is no such layout (a page on its own, a test).
 */
export const FooterSlotContext = createContext<HTMLElement | null>(null);

export const useFooterSlot = () => useContext(FooterSlotContext);
