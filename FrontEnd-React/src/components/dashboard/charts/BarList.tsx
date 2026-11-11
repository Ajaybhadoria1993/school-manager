import { shareOf } from "../../../utils/dashboard";
import { SERIES } from "./palette";
import { pctOf } from "./pct";
import { Tip } from "./Tip";

export interface BarRow {
  key: string;
  label: string;
  value: number;
}

/**
 * Horizontal bars, one hue, one row per name (the students of each class). The bars are in proportion to the longest, at most 20px thick,
 * with the end that carries the value rounded; the number stands beside the bar, and a tooltip gives the share of all. A table of the same
 * numbers is there for a screen reader.
 */
export function BarList({ title, rows, unit }: { title: string; rows: BarRow[]; unit: [one: string, other: string] }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <div>
      <ul aria-hidden className="max-h-[18rem] space-y-1.5 overflow-y-auto pr-1">
        {rows.map((r) => (
          <li key={r.key} className="group/mark relative grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 rounded-md py-0.5 text-sm hover:bg-primary-soft/60">
            <span className="truncate pl-1 text-foreground-muted" title={r.label}>
              {r.label}
            </span>
            <span className="flex h-5 items-center">
              <span data-bar={r.key} style={{ width: `${pctOf(r.value, max)}%`, backgroundColor: SERIES[0] }} className="grow-x block h-5 rounded-r-[4px]" />
            </span>
            <span className="pr-1 text-right font-semibold tabular-nums text-foreground">{r.value.toLocaleString("en-IN")}</span>
            <Tip className="bottom-full left-1/2 mb-1 -translate-x-1/2">{`${r.label}: ${r.value.toLocaleString("en-IN")} ${r.value === 1 ? unit[0] : unit[1]} (${shareOf(r.value, total)}%)`}</Tip>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
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
