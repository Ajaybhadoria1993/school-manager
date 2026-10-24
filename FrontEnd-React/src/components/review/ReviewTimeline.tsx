import { History } from "lucide-react";
import { useEntered } from "../../hooks/useMotion";
import type { EventTone, TimelineEvent } from "../../utils/review";
import { formatDateTime, timeAgo } from "../../utils/status";
import { cn } from "../../utils/helpers";
import { DetailCard } from "./DetailCard";

const DOT: Record<EventTone, string> = {
  neutral: "bg-slate-400",
  success: "bg-emerald-500",
  danger: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
};
const RING: Record<EventTone, string> = {
  neutral: "border-slate-400",
  success: "border-emerald-500",
  danger: "border-rose-500",
  warning: "border-amber-500",
  info: "border-sky-500",
};
const PING: Record<EventTone, string> = {
  neutral: "bg-slate-300",
  success: "bg-emerald-300",
  danger: "bg-rose-300",
  warning: "bg-amber-300",
  info: "bg-sky-300",
};

/** What has happened to this school, oldest first. The line down the side draws itself when the page arrives. */
export function ReviewTimeline({ events, now, index }: { events: TimelineEvent[]; now: number; index: number }) {
  const entered = useEntered();
  return (
    <DetailCard icon={History} title="Activity" subtitle="From registration to now" tone="navy" index={index} plain>
      <ol className="relative py-5">
        <span
          aria-hidden
          className={cn(
            "absolute bottom-7 left-[0.6rem] top-7 w-px origin-top bg-border transition-transform duration-[900ms] ease-out",
            entered ? "scale-y-100" : "scale-y-0"
          )}
        />
        {events.map((event, i) => (
          <li key={event.id} className="stagger-item relative pb-6 pl-9 last:pb-0" style={{ "--i": index + i + 1 } as React.CSSProperties}>
            <span className="absolute left-0 top-0.5 flex size-5 items-center justify-center rounded-full bg-surface ring-4 ring-surface">
              {event.upcoming ? (
                <span className="relative flex size-3">
                  <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-70", PING[event.tone])} />
                  <span className={cn("relative inline-flex size-3 rounded-full border-2 bg-surface", RING[event.tone])} />
                </span>
              ) : (
                <span className={cn("size-3 rounded-full", DOT[event.tone])} />
              )}
            </span>
            <p className={cn("text-sm font-semibold", event.upcoming ? "text-foreground-muted" : "text-foreground")}>{event.title}</p>
            {event.at && (
              <p className="text-xs text-foreground-muted" title={formatDateTime(event.at)}>
                {timeAgo(event.at, now)} · {formatDateTime(event.at)}
              </p>
            )}
            {event.detail &&
              (event.quote ? (
                <p className="mt-1.5 rounded-lg border-l-4 border-border bg-surface-muted px-3 py-2 text-sm text-foreground [overflow-wrap:anywhere]">{event.detail}</p>
              ) : (
                <p className="mt-0.5 text-xs text-foreground-muted [overflow-wrap:anywhere]">{event.detail}</p>
              ))}
          </li>
        ))}
      </ol>
    </DetailCard>
  );
}
