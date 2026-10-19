export type Tone =
  "primary" | "success" | "warning" | "danger" | "info" | "navy";

/** One place for the colour of a tile: the icon box, the soft glow behind a card, and the line along its bottom. */
export const TONES: Record<
  Tone,
  { tile: string; glow: string; line: string; text: string }
> = {
  primary: {
    tile: "bg-primary-soft text-primary",
    glow: "from-primary/15",
    line: "bg-primary",
    text: "text-primary",
  },
  success: {
    tile: "bg-success-soft text-success",
    glow: "from-emerald-400/20",
    line: "bg-emerald-500",
    text: "text-success",
  },
  warning: {
    tile: "bg-warning-soft text-warning",
    glow: "from-amber-400/20",
    line: "bg-amber-500",
    text: "text-warning",
  },
  danger: {
    tile: "bg-danger-soft text-danger",
    glow: "from-rose-400/20",
    line: "bg-rose-500",
    text: "text-danger",
  },
  info: {
    tile: "bg-info-soft text-info",
    glow: "from-sky-400/25",
    line: "bg-sky-500",
    text: "text-info",
  },
  navy: {
    tile: "bg-surface-muted text-navy",
    glow: "from-slate-400/20",
    line: "bg-navy",
    text: "text-navy",
  },
};
