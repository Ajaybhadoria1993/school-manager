/**
 * The colours of the dashboard's charts (the dataviz palette, validated with its script on the light surface).
 *  - SERIES: categorical slots 1 to 3 in their fixed order (blue, orange, aqua); the one hue of a single-series chart is blue.
 *  - STATUS: the fixed status palette (good, warning, critical); a segment in one always comes with its word, never the colour alone.
 * The text beside a mark wears the text tokens, never these.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
  /** A child on leave is not a status of the palette: the first series blue. */
  leave: SERIES[0],
} as const;

/** What a segment of "not yet" is drawn in: a quiet grey, so it reads as nothing recorded. */
export const NOT_YET = "#cbd5e1";
