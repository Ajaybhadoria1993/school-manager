export type Tone =
  "primary" | "success" | "warning" | "danger" | "info" | "navy";

/**
 * One place for the colour of a tile. `tile` / `glow` / `line` / `text` are the icon box, the soft glow behind a card,
 * the line along its bottom and its text. `gradient` is a bold icon badge, `chip` a small tinted label, and `wash` a
 * faint tinted band behind a heading (used by the classes page, so every department keeps one colour everywhere).
 */
export const TONES: Record<
  Tone,
  { tile: string; glow: string; line: string; text: string; gradient: string; chip: string; wash: string }
> = {
  primary: {
    tile: "bg-primary-soft text-primary",
    glow: "from-primary/15",
    line: "bg-primary",
    text: "text-primary",
    gradient: "bg-gradient-to-br from-sky-400 to-primary text-white shadow-[0_8px_18px_-6px_rgb(37_99_235/0.7)]",
    chip: "bg-primary-soft text-primary-deep ring-primary/25",
    wash: "from-primary/10",
  },
  success: {
    tile: "bg-success-soft text-success",
    glow: "from-emerald-400/20",
    line: "bg-emerald-500",
    text: "text-success",
    gradient: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_8px_18px_-6px_rgb(5_150_105/0.7)]",
    chip: "bg-success-soft text-success ring-emerald-300/70",
    wash: "from-emerald-400/10",
  },
  warning: {
    tile: "bg-warning-soft text-warning",
    glow: "from-amber-400/20",
    line: "bg-amber-500",
    text: "text-warning",
    gradient: "bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-[0_8px_18px_-6px_rgb(217_119_6/0.7)]",
    chip: "bg-warning-soft text-warning ring-amber-300/70",
    wash: "from-amber-400/10",
  },
  danger: {
    tile: "bg-danger-soft text-danger",
    glow: "from-rose-400/20",
    line: "bg-rose-500",
    text: "text-danger",
    gradient: "bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-[0_8px_18px_-6px_rgb(225_29_72/0.7)]",
    chip: "bg-danger-soft text-danger ring-rose-300/70",
    wash: "from-rose-400/10",
  },
  info: {
    tile: "bg-info-soft text-info",
    glow: "from-sky-400/25",
    line: "bg-sky-500",
    text: "text-info",
    gradient: "bg-gradient-to-br from-cyan-300 to-sky-500 text-white shadow-[0_8px_18px_-6px_rgb(2_132_199/0.7)]",
    chip: "bg-info-soft text-info ring-sky-300/70",
    wash: "from-sky-400/10",
  },
  navy: {
    tile: "bg-surface-muted text-navy",
    glow: "from-slate-400/20",
    line: "bg-navy",
    text: "text-navy",
    gradient: "bg-gradient-to-br from-slate-500 to-navy text-white shadow-[0_8px_18px_-6px_rgb(15_23_42/0.6)]",
    chip: "bg-surface-muted text-navy ring-slate-300",
    wash: "from-slate-400/10",
  },
};
