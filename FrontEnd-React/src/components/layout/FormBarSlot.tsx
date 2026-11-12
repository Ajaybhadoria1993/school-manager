import { createContext, useContext } from "react";

/**
 * The strip at the very bottom of the signed-in app's scroll pane, where a form's bar of buttons stands (`MainLayout` makes it and hands
 * its element out here; `FormActionBar dock` fills it). The bar stays in that one place whatever the page's length or scroll, instead of
 * following the end of the form. `null` where there is no such layout (a page on its own, a test): the bar then stands inside the form.
 */
export const FormBarSlotContext = createContext<HTMLElement | null>(null);

export const useFormBarSlot = () => useContext(FormBarSlotContext);
