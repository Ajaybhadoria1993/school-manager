import { useLayoutEffect } from "react";
import { themeStyle, type ThemeName } from "./themes";

/**
 * Puts the colours of a look other than Classic on the page's root while the signed-in app is open. The shell carries them too (so the app
 * is right at once), but a dialog or a dropdown list is drawn outside the shell, on the page itself: without this it would keep the default
 * colours (a blue button in a green app). Classic puts nothing here: it is the app as it was. They are taken off again when the look changes
 * or the app is left.
 */
export function useRootTheme(theme: ThemeName) {
  useLayoutEffect(() => {
    if (theme === "classic") return;
    const root = document.documentElement;
    const tokens = Object.entries(themeStyle(theme)).filter(([name]) => name.startsWith("--")) as [string, string][];
    for (const [name, value] of tokens) root.style.setProperty(name, String(value));
    return () => {
      for (const [name] of tokens) root.style.removeProperty(name);
      if (root.getAttribute("style") === "") root.removeAttribute("style");
    };
  }, [theme]);
}
