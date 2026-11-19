import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_THEME, isThemeName, themeStyle, type ThemeName } from "./themes";

const STORAGE_KEY = "edushiksha.appearance.v1";

export type ThemeMode = "light" | "dark";
export interface Appearance {
  mode: ThemeMode;
  accent: string;
  /** The look (Settings > Appearance > Theme). Classic uses `accent` and `mode`; every other look has colours of its own. */
  theme: ThemeName;
}

export const ACCENT_PRESETS = [
  { name: "Warm bronze", color: "#8b684f" },
  { name: "Ocean blue", color: "#2563eb" },
  { name: "Teal", color: "#0f7774" },
  { name: "Berry", color: "#9a5269" },
  { name: "Graphite", color: "#58616e" },
] as const;

interface AppearanceContextValue extends Appearance {
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: string) => void;
  setTheme: (theme: ThemeName) => void;
}

const DEFAULT_APPEARANCE: Appearance = { mode: "light", accent: ACCENT_PRESETS[0].color, theme: DEFAULT_THEME };
const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);

function readAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_APPEARANCE;
    const value = JSON.parse(stored) as Partial<Appearance>;
    return {
      mode: value.mode === "dark" ? "dark" : "light",
      accent: isHexColor(value.accent) ? value.accent : DEFAULT_APPEARANCE.accent,
      // An appearance saved before themes existed has none: it is Classic, exactly as it was.
      theme: isThemeName(value.theme) ? value.theme : DEFAULT_THEME,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(readAppearance);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // The selected appearance still applies for this visit when storage is unavailable.
    }
  }, [appearance]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...appearance,
      setMode: (mode) => setAppearance((current) => ({ ...current, mode })),
      setAccent: (accent) => setAppearance((current) => ({ ...current, accent: isHexColor(accent) ? accent : current.accent })),
      // The accent and the mode are kept as they are, so going back to Classic finds them.
      setTheme: (theme) => setAppearance((current) => ({ ...current, theme: isThemeName(theme) ? theme : current.theme })),
    }),
    [appearance],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppTheme(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppTheme must be used inside AppThemeProvider");
  return value;
}

/** The theme lives on the signed-in shell so its sidebar, header, cards and forms all change together. */
export function appearanceStyle({ mode, accent, theme = DEFAULT_THEME }: Appearance): CSSProperties {
  // Another look has colours of its own (light only): the accent and the mode are for Classic.
  if (theme !== "classic") return themeStyle(theme);
  const dark = mode === "dark";
  const primary = dark ? `color-mix(in srgb, ${accent} 70%, white)` : accent;
  const hover = dark ? `color-mix(in srgb, ${accent} 58%, white)` : `color-mix(in srgb, ${accent} 84%, black)`;
  const soft = dark ? `color-mix(in srgb, ${accent} 20%, #211f1c)` : `color-mix(in srgb, ${accent} 10%, white)`;
  const deep = dark ? `color-mix(in srgb, ${accent} 38%, white)` : `color-mix(in srgb, ${accent} 90%, black)`;

  return {
    colorScheme: dark ? "dark" : "light",
    "--background": dark ? "#171614" : "#faf8f5",
    "--surface": dark ? "#211f1c" : "#ffffff",
    "--surface-muted": dark ? "#2b2824" : "#f5f2ee",
    "--foreground": dark ? "#f4f1ec" : "#26221f",
    "--foreground-muted": dark ? "#b4aca3" : "#716960",
    "--foreground-secondary": dark ? "#d0c9bf" : "#514941",
    "--border": dark ? "#3b3630" : "#e8e1d9",
    "--primary": primary,
    "--primary-hover": hover,
    "--primary-foreground": "#ffffff",
    "--primary-soft": soft,
    "--primary-deep": deep,
    "--brand": dark ? "#93c5fd" : "#2563eb",
    "--success": dark ? "#34d399" : "#047857",
    "--success-soft": dark ? "#153326" : "#ecfdf5",
    "--success-line": dark ? "#246044" : "#a7f3d0",
    "--warning": dark ? "#fbbf24" : "#b45309",
    "--warning-soft": dark ? "#342a16" : "#fffbeb",
    "--warning-line": dark ? "#624b21" : "#fde68a",
    "--danger": dark ? "#f87171" : "#b91c1c",
    "--danger-soft": dark ? "#351e1e" : "#fef2f2",
    "--danger-line": dark ? "#693333" : "#fecaca",
    "--info": dark ? "#38bdf8" : "#0369a1",
    "--info-soft": dark ? "#142d3a" : "#f0f9ff",
    "--info-line": dark ? "#28556b" : "#bae6fd",
    "--accent": "var(--primary)",
    "--accent-foreground": "var(--primary-foreground)",
    "--focus": "var(--primary)",
    "--muted": "var(--foreground-muted)",
    "--field-background": "var(--surface)",
    "--field-foreground": "var(--foreground)",
    "--field-placeholder": dark ? "#968e84" : "#94a3b8",
    "--overlay": "var(--surface)",
    "--overlay-foreground": "var(--foreground)",
    "--primary-shadow": `0 4px 10px -2px color-mix(in srgb, ${primary} 38%, transparent)`,
    "--primary-shadow-hover": `0 6px 14px -2px color-mix(in srgb, ${primary} 44%, transparent)`,
  } as CSSProperties;
}
