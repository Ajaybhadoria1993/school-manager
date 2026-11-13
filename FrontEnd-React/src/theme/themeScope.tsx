import type { ReactNode } from "react";
import { ThemeScopeContext } from "./themeScopeContext";
import type { ThemeName } from "./themes";

/**
 * Says which look the part of the app inside it wears. The signed-in shell puts its dialogs, forms and menu inside one, so the boxes and the
 * menu know the look; the public pages and the sign-up form are outside it and stay as they are.
 */
export function ThemeScope({ theme, children }: { theme: ThemeName; children: ReactNode }) {
  return <ThemeScopeContext.Provider value={theme}>{children}</ThemeScopeContext.Provider>;
}
