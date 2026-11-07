import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { CalendarEvent } from "../../types";
import { dayRange } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { KIND_LOOK } from "./look";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * One holiday or event: a tile with its first day, its name, what it is and its days, the note under it. The people who run the school
 * also get the pencil (change it) and the bin (take it off); `onEdit` / `onRemove` are only used for them. A standard festival
 * (Diwali, Holi...) has the bin only (it is the standard list's, so it is taken off, not changed), and a national day, which stays on
 * every calendar, has neither. A festival the school took off (`taken`, only drawn in the school's own list) stays where it was, faded,
 * with one round arrow to bring it back.
 */
export function EventRow({
  event: e,
  canEdit,
  taken = false,
  onEdit,
  onRemove,
  onBring,
}: {
  event: CalendarEvent;
  canEdit: boolean;
  taken?: boolean;
  onEdit: (e: CalendarEvent) => void;
  onRemove: (e: CalendarEvent) => void;
  onBring?: (e: CalendarEvent) => void;
}) {
  const look = KIND_LOOK[e.kind];
  return (
    <li className="flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-surface-muted/60">
      <span aria-hidden className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none", taken ? "bg-surface-muted text-foreground-muted" : look.tile)}>
        <span className="text-lg font-extrabold">{Number(e.startDate.slice(8, 10))}</span>
        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">{MONTH_SHORT[Number(e.startDate.slice(5, 7)) - 1]}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-bold", taken ? "text-foreground-muted line-through" : "text-foreground")}>{e.title}</span>
        <span className="block text-sm text-foreground-muted">
          {taken ? <span className="font-semibold">Taken off</span> : <span className={cn("font-semibold", look.text)}>{e.source === "national" ? "National holiday" : look.label}</span>} ·{" "}
          {dayRange(e.startDate, e.endDate)}
        </span>
        {!taken && e.note && <span className="mt-1 block text-sm text-foreground">{e.note}</span>}
      </span>
      {taken && canEdit && (
        <Button variant="ghost" size="sm" aria-label={`Bring back ${e.title}`} title="Bring back" className="shrink-0 hover:text-primary" onClick={() => onBring?.(e)}>
          <RotateCcw className="size-4" aria-hidden />
        </Button>
      )}
      {!taken && canEdit && e.source !== "national" && (
        <span className="flex shrink-0 gap-1">
          {e.source === "school" && (
            <Button variant="ghost" size="sm" aria-label={`Change ${e.title}`} onClick={() => onEdit(e)}>
              <Pencil className="size-4" aria-hidden />
            </Button>
          )}
          <Button variant="ghost" size="sm" aria-label={`Remove ${e.title}`} className="hover:text-danger" onClick={() => onRemove(e)}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </span>
      )}
    </li>
  );
}
