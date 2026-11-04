import type { SeatState } from "../../types";

/** How each state of a section looks everywhere on the School Class pages: its label, its badge and the colour of its bar. */
export const SEAT_LOOK: Record<SeatState, { label: string; badge: string; bar: string }> = {
  open: { label: "Open", badge: "bg-success-soft text-success", bar: "bg-success" },
  almost: { label: "Almost full", badge: "bg-warning-soft text-warning", bar: "bg-amber-500" },
  full: { label: "Full", badge: "bg-danger-soft text-danger", bar: "bg-danger" },
  unlimited: { label: "No limit", badge: "bg-primary-soft text-primary-deep", bar: "bg-primary" },
};
