import type { CSSProperties } from "react";

/**
 * The looks the signed-in app can wear (Settings > Appearance > Theme). "classic" is the app as it was: its own accent colour and its light
 * or dark mode (`appearanceStyle` in AppThemeProvider). The others are whole looks from the school's sign-up form: a deep panel for the
 * menu, a tinted page, white cards, and soft rounded boxes for every field. They are light only and have their own colours, so the accent
 * and the display mode belong to Classic.
 */
export type ThemeName = "classic" | "onboarding" | "evergreen";

export const DEFAULT_THEME: ThemeName = "classic";

export interface ThemeInfo {
  id: ThemeName;
  name: string;
  /** One short line under the name on its card. */
  description: string;
  /** The picture on its card: the menu, the accent and the page. */
  swatches: { menu: string; accent: string; page: string };
}

export const THEMES: readonly ThemeInfo[] = [
  { id: "classic", name: "Classic", description: "The look you have now, with your accent colour and light or dark mode", swatches: { menu: "#ffffff", accent: "#0f7774", page: "#faf8f5" } },
  { id: "onboarding", name: "Onboarding", description: "The deep blue menu and soft boxes of the sign-up form", swatches: { menu: "#1e3a8a", accent: "#2563eb", page: "#f2f7ff" } },
  { id: "evergreen", name: "Evergreen", description: "The same soft look in deep green", swatches: { menu: "#134e4a", accent: "#0f766e", page: "#f1f8f6" } },
];

export const isThemeName = (value: unknown): value is ThemeName => THEMES.some((theme) => theme.id === value);

/** What a look decides; every other colour of the app follows from these. */
interface Palette {
  background: string;
  surfaceMuted: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  foregroundSecondary: string;
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primaryDeep: string;
  brand: string;
  /** "r g b" of the shadows' tint. */
  tint: string;
  menuFrom: string;
  menuTo: string;
  /** The lit row of the menu. */
  menuActive: string;
}

const PALETTES: Record<Exclude<ThemeName, "classic">, Palette> = {
  onboarding: {
    background: "#f2f7ff",
    surfaceMuted: "#eef3fb",
    border: "#dce5f3",
    foreground: "#0f172a",
    foregroundMuted: "#64748b",
    foregroundSecondary: "#475569",
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    primarySoft: "#eaf1ff",
    primaryDeep: "#1e3a8a",
    brand: "#2563eb",
    tint: "30 58 138",
    menuFrom: "#1e3a8a",
    menuTo: "#172554",
    menuActive: "#2f67e5",
  },
  evergreen: {
    background: "#f1f8f6",
    surfaceMuted: "#ecf3f1",
    border: "#d5e4e0",
    foreground: "#10231f",
    foregroundMuted: "#5f736e",
    foregroundSecondary: "#44574f",
    primary: "#0f766e",
    primaryHover: "#115e59",
    primarySoft: "#e3f3ef",
    primaryDeep: "#134e4a",
    brand: "#0f766e",
    tint: "19 78 74",
    menuFrom: "#134e4a",
    menuTo: "#0d3331",
    menuActive: "#12887e",
  },
};

/** The status colours of the light app: the same in every look, so a green tick or a red warning is read the same everywhere. */
const LIGHT_STATUS = {
  "--success": "#047857",
  "--success-soft": "#ecfdf5",
  "--success-line": "#a7f3d0",
  "--warning": "#b45309",
  "--warning-soft": "#fffbeb",
  "--warning-line": "#fde68a",
  "--danger": "#b91c1c",
  "--danger-soft": "#fef2f2",
  "--danger-line": "#fecaca",
  "--info": "#0369a1",
  "--info-soft": "#f0f9ff",
  "--info-line": "#bae6fd",
} as const;

/**
 * The tokens of a look other than Classic, set on the signed-in shell. The menu's own colours (`--menu-*`) are read by the `.app-sidebar` rules
 * of index.css, which turn the menu deep. Nothing here changes what a page does: only colours, shadows and the look of the boxes.
 */
export function themeStyle(theme: Exclude<ThemeName, "classic">): CSSProperties {
  const p = PALETTES[theme];
  return {
    colorScheme: "light",
    "--background": p.background,
    "--surface": "#ffffff",
    "--surface-muted": p.surfaceMuted,
    "--foreground": p.foreground,
    "--foreground-muted": p.foregroundMuted,
    "--foreground-secondary": p.foregroundSecondary,
    "--border": p.border,
    "--primary": p.primary,
    "--primary-hover": p.primaryHover,
    "--primary-foreground": "#ffffff",
    "--primary-soft": p.primarySoft,
    "--primary-deep": p.primaryDeep,
    "--brand": p.brand,
    // The strip that starts each part of a form (and the icons beside it) takes the look's colour instead of gold.
    "--gold": p.primary,
    ...LIGHT_STATUS,
    "--accent": "var(--primary)",
    "--accent-foreground": "var(--primary-foreground)",
    "--focus": "var(--primary)",
    "--muted": "var(--foreground-muted)",
    "--field-background": "var(--surface)",
    "--field-foreground": "var(--foreground)",
    "--field-placeholder": "#94a3b8",
    "--overlay": "var(--surface)",
    "--overlay-foreground": "var(--foreground)",
    "--primary-shadow": `0 4px 10px -2px rgb(${p.tint} / 0.4)`,
    "--primary-shadow-hover": `0 6px 14px -2px rgb(${p.tint} / 0.45)`,
    "--elev-card": `0 1px 3px 0 rgb(${p.tint} / 0.08)`,
    "--elev-raised": `0 6px 16px -6px rgb(${p.tint} / 0.16), 0 2px 4px -2px rgb(${p.tint} / 0.06)`,
    "--elev-float": `0 12px 20px -6px rgb(${p.tint} / 0.14), 0 4px 6px -4px rgb(${p.tint} / 0.06)`,
    "--menu-from": p.menuFrom,
    "--menu-to": p.menuTo,
    "--menu-active": p.menuActive,
  } as CSSProperties;
}
