import { SERIES } from "./palette";
import { pctOf } from "./pct";
import { Tip } from "./Tip";

export interface ColumnRow {
  key: string;
  /** Short, for the axis ("Nov"). */
  label: string;
  value: number;
  /** The tooltip, in words ("November 2026: 2 admissions"). */
  tip: string;
}

/**
 * A row of columns, one hue, one per period (admissions by month). Each is as tall as its share of the highest and at most 28px wide, with
 * its top rounded; a period with 0 has no column. The number is written over the highest column only; every column says its number in a
 * tooltip. A table of the same numbers is there for a screen reader.
 */
export function Columns({ title, rows }: { title: string; rows: ColumnRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  const highest = rows.find((r) => r.value === max && max > 0)?.key;
  return (
    <div>
      <div aria-hidden className="flex h-44 items-end gap-3 border-b border-border pt-7">
        {rows.map((r, i) => {
          const height = pctOf(r.value, max);
          return (
            <div key={r.key} className="group/mark relative flex h-full flex-1 items-end justify-center">
              {r.value > 0 && (
                <span data-column={r.key} style={{ height: `${height}%`, backgroundColor: SERIES[0] }} className="grow-y block w-7 rounded-t-[4px]" />
              )}
              {r.key === highest && (
                <span data-value-label style={{ bottom: `calc(${height}% + 4px)` }} className="absolute text-xs font-bold tabular-nums text-foreground">
                  {r.value}
                </span>
              )}
              <Tip className={`bottom-full mb-1 ${i === 0 ? "left-0" : i === rows.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>{r.tip}</Tip>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-2 flex gap-3">
        {rows.map((r) => (
          <span key={r.key} className="flex-1 text-center text-xs font-medium text-foreground-muted">
            {r.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Number</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
