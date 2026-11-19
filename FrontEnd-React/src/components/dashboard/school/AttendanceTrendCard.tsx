import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { useGetSchoolTrendQuery } from "../../../redux/api/dashboardApi";
import type { SchoolTrend } from "../../../types";
import { pointsChange } from "../../../utils/dashboardRange";
import { Select } from "../../ui/Select";
import { DashCard } from "./DashCard";

const OPTIONS = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The chart's width until the card's own is known (and in a place that cannot measure). */
const WIDE = 600;
const H = 190;
const PAD = { left: 44, right: 14, top: 12, bottom: 26 };

/** "Mon, 9 Nov". */
const dayText = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTHS[m - 1]}`;
};

/** The line and the area under it through the days that have marks, in an SVG of its own (no chart library). */
function Area({ trend }: { trend: SchoolTrend }) {
  // Drawn at the width the card gives it (1 unit = 1 pixel), so the words are as big on a phone as on a laptop.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(WIDE);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const n = trend.points.length;
  const x = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right));
  const y = (percent: number) => PAD.top + (1 - percent / 100) * (H - PAD.top - PAD.bottom);
  const marked = trend.points.flatMap((p, i) => (p.percent === null ? [] : [{ ...p, i, px: x(i), py: y(p.percent) }]));
  const line = marked.map((p, k) => `${k === 0 ? "M" : "L"}${p.px.toFixed(1)} ${p.py.toFixed(1)}`).join(" ");
  const floor = y(0);
  const area = marked.length > 1 ? `${line} L${marked[marked.length - 1].px.toFixed(1)} ${floor} L${marked[0].px.toFixed(1)} ${floor} Z` : "";
  // A week names every day; a month names the 1st, 5th, 10th...
  const labelled = (i: number) => n <= 8 || i === 0 || (i + 1) % (W < 400 ? 10 : 5) === 0;

  return (
    <div ref={box} className="w-full">
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full">
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray={g === 0 ? undefined : "3 4"} />
          <text x={PAD.left - 6} y={y(g) + 4} textAnchor="end" className="fill-foreground-muted text-[11px]">
            {g}%
          </text>
        </g>
      ))}
      {area && <path d={area} fill="url(#trend-fill)" />}
      {line && <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {marked.map((p) => (
        <circle key={p.date} cx={p.px} cy={p.py} r="4" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5">
          <title>{`${dayText(p.date)}: ${p.percent}%`}</title>
        </circle>
      ))}
      {trend.points.map((p, i) =>
        labelled(i) ? (
          <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-foreground-muted text-[11px]">
            {n <= 8 ? WEEKDAYS[new Date(`${p.date}T00:00:00Z`).getUTCDay()] : Number(p.date.slice(8))}
          </text>
        ) : null
      )}
    </svg>
    </div>
  );
}

/**
 * Attendance Overview (the look of Infinity Medisetu's Revenue Overview, 2026-11-10): the share of the children who came, day by day, for
 * this week or this month (its own choice, apart from the days at the top of the page), the share of the whole period with how it went
 * against the one before, and the days with marks drawn as an area. A day nobody marked (no school, not taken, not come yet) has no point.
 */
export function AttendanceTrendCard() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const res = useGetSchoolTrendQuery(period);
  const trend = res.data?.data;
  const change = trend ? pointsChange(trend.percent, trend.before) : null;
  const none = !!trend && trend.points.every((p) => p.percent === null);

  return (
    <DashCard
      title="Attendance Overview"
      icon={<TrendingUp className="size-4" />}
      aside={
        <div className="w-36">
          <Select aria-label="Attendance chart period" value={period} options={OPTIONS} onChange={(v) => setPeriod(v === "month" ? "month" : "week")} />
        </div>
      }
    >
      {res.isError && !trend ? (
        <p role="alert" className="text-sm font-medium text-danger">
          Could not load the chart.{" "}
          <button type="button" onClick={() => void res.refetch()} className="cursor-pointer font-semibold underline">
            Try again
          </button>
        </p>
      ) : !trend ? (
        <div aria-hidden className="h-48 animate-pulse rounded-xl bg-surface-muted" />
      ) : none ? (
        <p className="flex min-h-40 items-center justify-center text-sm text-foreground-muted">No attendance marked yet</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-metric-headline">{trend.percent === null ? "–" : `${trend.percent}%`}</span>
            {change !== null && (
              <span className="flex items-center gap-x-1 text-xs">
                <span className={change > 0 ? "font-semibold text-success" : change < 0 ? "font-semibold text-danger" : "font-semibold text-foreground-muted"}>
                  {change > 0 ? `↑ +${change}%` : change < 0 ? `↓ ${change}%` : "0%"}
                </span>
                <span className="text-foreground-muted">{period === "week" ? "vs last week" : "vs last month"}</span>
              </span>
            )}
          </div>
          <Area trend={trend} />
          <table className="sr-only">
            <caption>Attendance by day</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Children who came</th>
              </tr>
            </thead>
            <tbody>
              {trend.points.map((p) => (
                <tr key={p.date}>
                  <th scope="row">{dayText(p.date)}</th>
                  <td>{p.percent === null ? "No marks" : `${p.percent}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}
