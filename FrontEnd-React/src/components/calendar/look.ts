import type { CalendarKind } from "../../types";

/** How a holiday and an event look everywhere on the calendar: red for a day off, blue for a function. Whole class names, so Tailwind finds them. */
export const KIND_LOOK: Record<CalendarKind, { label: string; plural: string; dot: string; text: string; tile: string; bar: string; stripe: string; cell: string }> = {
  holiday: {
    label: "Holiday",
    plural: "Holidays",
    dot: "bg-danger",
    text: "text-danger",
    tile: "bg-danger-soft text-danger",
    bar: "bg-danger/15 text-danger",
    stripe: "border-l-[3px] border-danger",
    cell: "bg-danger-soft",
  },
  event: {
    label: "Event",
    plural: "Events",
    dot: "bg-primary",
    text: "text-primary-deep",
    tile: "bg-primary-soft text-primary-deep",
    bar: "bg-primary/15 text-primary-deep",
    stripe: "border-l-[3px] border-primary",
    cell: "",
  },
};

/** "1 Holiday", "2 Holidays", "0 Events". */
export const countText = (kind: CalendarKind, n: number) => `${n} ${n === 1 ? KIND_LOOK[kind].label : KIND_LOOK[kind].plural}`;
