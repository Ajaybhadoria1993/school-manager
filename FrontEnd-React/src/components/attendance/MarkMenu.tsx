import type { RefObject } from "react";
import { Popover } from "@heroui/react";
import { Check } from "lucide-react";
import { cn } from "../../utils/helpers";

export type Answer = "present" | "absent";

const CHOICES: { value: Answer; word: string; letter: string; tone: string }[] = [
  { value: "present", word: "Present", letter: "P", tone: "bg-success/20 text-success" },
  { value: "absent", word: "Absent", letter: "A", tone: "bg-danger/20 text-danger" },
];

/**
 * The two answers for one child on one day (2026-11-17), opened by a click on a cell of the register: Present or Absent. What the cell
 * says now is ticked (a late child is Present). The menu is anchored to the cell (`anchor`) and goes away with a click outside or Escape.
 */
export function MarkMenu({ anchor, title, current, onPick, onClose }: { anchor: RefObject<HTMLElement | null>; title: string; current: Answer | null; onPick: (answer: Answer) => void; onClose: () => void }) {
  return (
    <Popover.Content isOpen onOpenChange={(open) => !open && onClose()} triggerRef={anchor} placement="bottom" offset={6} className="w-52 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-float">
      <Popover.Dialog aria-label={title} className="flex flex-col gap-1 p-0 outline-none">
        <p className="truncate px-2 pb-0.5 pt-1 text-xs font-semibold text-foreground-muted">{title}</p>
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={current === c.value}
            onClick={() => onPick(c.value)}
            className={cn(
              "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              current === c.value && "bg-surface-muted"
            )}
          >
            <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold", c.tone)}>{c.letter}</span>
            {c.word}
            {current === c.value && <Check className="ml-auto size-4 text-foreground-muted" aria-hidden />}
          </button>
        ))}
      </Popover.Dialog>
    </Popover.Content>
  );
}
