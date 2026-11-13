import { createContext, useContext } from "react";
import { DEFAULT_THEME, type ThemeName } from "./themes";

/** Which look the part of the app a component is in wears (set by `ThemeScope`). Without one it is Classic, so a component drawn on its own is never changed. */
export const ThemeScopeContext = createContext<ThemeName>(DEFAULT_THEME);

/** The look of the part of the app this component is in. */
export const useThemeScope = () => useContext(ThemeScopeContext);
