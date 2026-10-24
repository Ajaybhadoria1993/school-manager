import { Link } from "react-router";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import { WithTip } from "../ui/Hint";

/**
 * The one button of a class card or a department heading: it opens that class's or department's own screen, where
 * everything about it is changed. Tinted in the colour of its department; the arrow nudges on hover.
 */
export function ManageLink({ to, label, tip, tone }: { to: string; /** For a screen reader: "Manage Class 5". */ label: string; tip: string; tone: Tone }) {
  return (
    <WithTip tip={tip}>
      <Link
        to={to}
        aria-label={label}
        className={cn(
          "group/manage inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-bold ring-1 ring-inset transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
          TONES[tone].chip
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Manage
        <ArrowRight className="size-4 transition-transform duration-200 group-hover/manage:translate-x-0.5" aria-hidden />
      </Link>
    </WithTip>
  );
}
