import { DoorOpen, Minus, Plus, Users } from "lucide-react";
import { CLASS_TONES, classMarkOf } from "../../constants/classTones";
import { MAX_CLASS_SEATS, MAX_ROOM, MAX_SEATS, MAX_SECTIONS, classSeats } from "../../utils/mediumPlans";
import { cn } from "../../utils/helpers";
import type { PlanClass } from "../../types";

/** A number box's text as a number: an empty box is 0 and is shown empty, so a number can be cleared and typed again. */
const numberOf = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? 0 : Math.max(0, Math.round(Number(text))));

const BOX =
  "h-8 min-w-0 rounded-lg border border-border bg-white px-2 text-center text-sm font-semibold text-foreground transition-colors placeholder:font-normal placeholder:text-foreground-muted/50 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-foreground-muted";

/**
 * One class of a medium, as a small pastel card: its mark and name, how many sections it starts with (a stepper), the seats of each
 * section (of the whole class when it has no sections) and the room it sits in (the first section's: a class with no sections has no room
 * to give). It hovers up a little. A card that is new only fades in: nothing moves and no other card is touched, so ticking a stream or
 * changing the range never makes the cards around it jump. `error` is the one message of the card, under its boxes.
 */
export function ClassCard({
  row,
  position,
  onChange,
  error,
  className,
}: {
  row: PlanClass;
  /** Where the class is in the list: a class with a name of the school's own takes the colour of its place. */
  position: number;
  onChange: (patch: Partial<PlanClass>) => void;
  error?: string;
  className?: string;
}) {
  const mark = classMarkOf(row.name, position);
  const tone = CLASS_TONES[mark.tone];
  const Icon = mark.icon;
  const setSections = (sections: number) => onChange({ sections: Math.min(MAX_SECTIONS, Math.max(0, sections)) });
  const noSections = row.sections === 0;

  return (
    <li className={cn("fade-in overflow-hidden rounded-2xl border border-white bg-white shadow-raised transition-all duration-200 hover:-translate-y-0.5 hover:shadow-float", className)}>
      <div className={cn("flex items-center gap-2.5 px-3 py-2.5", tone.band)}>
        <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", Icon ? tone.markSoft : tone.mark)}>
          {Icon ? <Icon className="size-[18px]" /> : mark.number}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-bold text-foreground">{row.name}</span>
          <span className="block text-[11px] font-medium tabular-nums text-foreground-muted">{`${classSeats(row)} seat${classSeats(row) === 1 ? "" : "s"}`}</span>
        </span>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground-secondary">Sections</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Fewer sections in ${row.name}`}
              disabled={row.sections <= 0}
              onClick={() => setSections(row.sections - 1)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-foreground-secondary transition-all hover:border-primary/40 hover:text-primary active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <input
              aria-label={`${row.name}: sections`}
              className="h-7 w-8 min-w-0 rounded-md border-0 bg-transparent px-0 text-center text-sm font-bold tabular-nums text-foreground [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-primary/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              type="number"
              min={0}
              max={MAX_SECTIONS}
              value={row.sections}
              onChange={(e) => setSections(numberOf(e.target.value))}
            />
            <button
              type="button"
              aria-label={`More sections in ${row.name}`}
              disabled={row.sections >= MAX_SECTIONS}
              onClick={() => setSections(row.sections + 1)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-foreground-secondary transition-all hover:border-primary/40 hover:text-primary active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </span>
        </div>

        <label className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-medium text-foreground-secondary">{noSections ? "Seats" : "Seats in each"}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Users className="size-3.5 shrink-0 text-foreground-secondary" aria-hidden />
            <input
              aria-label={`${row.name}: seats`}
              aria-invalid={error ? true : undefined}
              className={cn(BOX, "w-14 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none")}
              type="number"
              min={1}
              max={noSections ? MAX_CLASS_SEATS : MAX_SEATS}
              value={row.seats || ""}
              onChange={(e) => onChange({ seats: numberOf(e.target.value) })}
            />
          </span>
        </label>

        <label className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-medium text-foreground-secondary">Room No.</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <DoorOpen className="size-3.5 shrink-0 text-foreground-secondary" aria-hidden />
            <input
              aria-label={`${row.name}: room`}
              className={cn(BOX, "w-14")}
              maxLength={MAX_ROOM}
              disabled={noSections}
              title={noSections ? "A class with no sections has no room to give" : undefined}
              placeholder={noSections ? "-" : "101"}
              value={noSections ? "" : (row.room ?? "")}
              onChange={(e) => onChange({ room: e.target.value })}
            />
          </span>
        </label>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
