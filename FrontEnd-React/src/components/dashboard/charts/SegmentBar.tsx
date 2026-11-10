import { shareOf } from "../../../utils/dashboard";
import { pctOf } from "./pct";
import { Tip } from "./Tip";

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * One tall bar split into parts (who came today, boys and girls). The parts are in proportion with a 2px gap between them, a part of 0 is not
 * drawn, and with nothing to split the bar is an empty track. Under it a legend says every part with its number, 0 as well: the colour is
 * never the only way to tell a part.
 */
export function SegmentBar({ label, segments }: { label: string; segments: Segment[] }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const drawn = segments.filter((s) => s.value > 0);
  return (
    <div role="group" aria-label={label}>
      <div aria-hidden className="flex h-7 gap-0.5">
        {total === 0 ? (
          <div data-empty className="h-full w-full rounded-lg bg-surface-muted" />
        ) : (
          drawn.map((s, i) => (
            <div
              key={s.key}
              data-segment={s.key}
              style={{ width: `${pctOf(s.value, total)}%`, backgroundColor: s.color }}
              className={`group/mark relative h-full min-w-1.5 grow-x ${i === 0 ? "rounded-l-lg" : ""} ${i === drawn.length - 1 ? "rounded-r-lg" : ""}`}
            >
              <Tip className="bottom-full left-1/2 mb-2 -translate-x-1/2">{`${s.label}: ${s.value} of ${total} (${shareOf(s.value, total)}%)`}</Tip>
            </div>
          ))
        )}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5 text-sm text-foreground">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
            <span>
              {s.label} {s.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
