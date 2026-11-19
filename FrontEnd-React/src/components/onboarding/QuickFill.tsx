import { useState } from "react";
import { Check, ChevronDown, DoorOpen, Layers, Users, Zap } from "lucide-react";
import { useDismiss } from "../../hooks/useDismiss";
import { MAX_ROOM, MAX_SEATS, MAX_SECTIONS, roomSequence } from "../../utils/mediumPlans";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export interface QuickFillValues {
  sections: number;
  seats: number;
  firstRoom?: string;
}

const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : NaN);

/**
 * "Quick Fill: apply the same settings to all": one small window for the sections, the seats of each section and, if wanted, the first
 * room number (the others count up from it, one for each class that has sections). Nothing changes until Apply is pressed; what the
 * classes had before is replaced for the boxes that are filled in.
 */
export function QuickFill({ medium, onApply, className }: { medium: string; onApply: (values: QuickFillValues) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const [sections, setSections] = useState("1");
  const [seats, setSeats] = useState("40");
  const [firstRoom, setFirstRoom] = useState("");
  const [problem, setProblem] = useState<Record<string, string>>({});

  function apply() {
    const next: Record<string, string> = {};
    const s = whole(sections);
    const n = whole(seats);
    if (Number.isNaN(s) || s > MAX_SECTIONS) next.sections = `Enter 0 to ${MAX_SECTIONS}.`;
    if (Number.isNaN(n) || n < 1 || n > MAX_SEATS) next.seats = `Enter 1 to ${MAX_SEATS}.`;
    if (firstRoom.trim() && !roomSequence(firstRoom, 1)) next.room = "End it with a number, for example 101.";
    setProblem(next);
    if (Object.keys(next).length > 0) return;
    onApply({ sections: s, seats: n, ...(firstRoom.trim() ? { firstRoom: firstRoom.trim() } : {}) });
    setOpen(false);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Quick Fill for ${medium}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-white bg-white px-3.5 text-left shadow-card transition-all hover:shadow-raised focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Zap className="size-4" aria-hidden />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-foreground">Quick Fill</span>
          <span className="block text-[11px] text-foreground-muted">Apply same settings to all</span>
        </span>
        <ChevronDown className={cn("ml-1 size-4 shrink-0 text-foreground-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div role="dialog" aria-label={`Quick Fill for ${medium}`} className="fade-in absolute right-0 top-14 z-20 w-72 space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-float">
          <p className="text-sm font-semibold text-foreground">Same for every class</p>
          <div>
            <label htmlFor={`qf-sections-${medium}`} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary">
              <Layers className="size-3.5 text-foreground-muted" aria-hidden />
              Sections
            </label>
            <Input id={`qf-sections-${medium}`} inputMode="numeric" value={sections} maxLength={2} aria-invalid={!!problem.sections} onChange={(e) => setSections(e.target.value)} />
            {problem.sections && <p className="mt-1 text-xs font-medium text-danger">{problem.sections}</p>}
          </div>
          <div>
            <label htmlFor={`qf-seats-${medium}`} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary">
              <Users className="size-3.5 text-foreground-muted" aria-hidden />
              Seats in each section
            </label>
            <Input id={`qf-seats-${medium}`} inputMode="numeric" value={seats} maxLength={3} aria-invalid={!!problem.seats} onChange={(e) => setSeats(e.target.value)} />
            {problem.seats && <p className="mt-1 text-xs font-medium text-danger">{problem.seats}</p>}
          </div>
          <div>
            <label htmlFor={`qf-room-${medium}`} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary">
              <DoorOpen className="size-3.5 text-foreground-muted" aria-hidden />
              First room number <span className="font-normal text-foreground-muted">(optional)</span>
            </label>
            <Input id={`qf-room-${medium}`} value={firstRoom} maxLength={MAX_ROOM} placeholder="101: the next classes get 102, 103..." aria-invalid={!!problem.room} onChange={(e) => setFirstRoom(e.target.value)} />
            {problem.room && <p className="mt-1 text-xs font-medium text-danger">{problem.room}</p>}
          </div>
          <Button type="button" className="w-full" onClick={apply}>
            <Check className="size-4" aria-hidden />
            Apply to all classes
          </Button>
        </div>
      )}
    </div>
  );
}
