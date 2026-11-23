import { useRef, useState } from "react";
import { Popover } from "@heroui/react";
import { Clock3 } from "lucide-react";
import { cn } from "../../utils/helpers";
import { Input } from "./Input";

const pad = (n: number) => String(n).padStart(2, "0");
/** The hours of a school day, shown first; the night and the early morning are one click away. */
const DAY_HOURS = Array.from({ length: 14 }, (_, i) => i + 6);
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
/** "1 PM" under 13: the hour as it is said. */
const spoken = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

/**
 * A time of day (2026-11-22, asked for: "time select karne ka UI accha karo, jaldi select kar paun"): the box still takes a typed time ("10:30"),
 * and the clock at its right opens the hours of a school day (6 AM to 7 PM; Show all hours for the rest) and the minutes by fives. An hour keeps
 * the minutes (00 when there were none), a minute sets them and closes it: two clicks. The browser's own list of times is not used.
 * `label` names the box ("Usual day: lunch from"); the clock is "Pick <label>".
 */
export function TimeBox({ id, label, value, onChange, className }: { id?: string; label: string; value: string; onChange: (clock: string) => void; className?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = match ? Number(match[1]) : null;
  const minute = match ? Number(match[2]) : null;
  const [allHours, setAllHours] = useState(false);
  const hours = allHours || (hour !== null && !DAY_HOURS.includes(hour)) ? ALL_HOURS : DAY_HOURS;

  const cell = (on: boolean) =>
    cn(
      "flex cursor-pointer flex-col items-center justify-center rounded-lg border text-sm font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      on ? "border-primary-deep bg-primary-deep text-white" : "border-border bg-surface text-foreground hover:border-primary/50 hover:bg-primary-soft"
    );

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        aria-label={label}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface pr-10 [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <button
        ref={trigger}
        type="button"
        aria-label={`Pick ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="absolute inset-y-0 right-1 my-auto flex size-8 cursor-pointer items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Clock3 className="size-4" aria-hidden />
      </button>
      {open && (
        <Popover.Content isOpen onOpenChange={(next) => !next && setOpen(false)} triggerRef={trigger} placement="bottom end" offset={6} className="w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surface p-0 shadow-float">
          <Popover.Dialog aria-label={`${label}: pick a time`} className="space-y-3 p-3 outline-none">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-foreground-muted">Hour</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{match ? value : "--:--"}</p>
            </div>
            <div role="group" aria-label="Hours" className={cn("grid gap-1.5", hours === ALL_HOURS ? "grid-cols-6" : "grid-cols-7")}>
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`${pad(h)} hours`}
                  aria-pressed={h === hour}
                  onClick={() => onChange(`${pad(h)}:${pad(minute ?? 0)}`)}
                  className={cn(cell(h === hour), "h-11")}
                >
                  {pad(h)}
                  <span className={cn("text-[9px] font-semibold", h === hour ? "text-white/80" : "text-foreground-muted")}>{spoken(h)}</span>
                </button>
              ))}
            </div>
            {hours === DAY_HOURS && (
              <button type="button" onClick={() => setAllHours(true)} className="cursor-pointer text-xs font-semibold text-primary-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                Show all hours
              </button>
            )}
            <p className="text-[11px] font-bold uppercase tracking-wider text-foreground-muted">Minute</p>
            <div role="group" aria-label="Minutes" className="grid grid-cols-6 gap-1.5">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-label={`${pad(m)} minutes`}
                  aria-pressed={m === minute}
                  onClick={() => {
                    onChange(`${pad(hour ?? 8)}:${pad(m)}`);
                    setOpen(false);
                  }}
                  className={cn(cell(m === minute), "h-9")}
                >
                  {pad(m)}
                </button>
              ))}
            </div>
          </Popover.Dialog>
        </Popover.Content>
      )}
    </div>
  );
}
