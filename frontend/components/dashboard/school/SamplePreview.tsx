"use client";

import { Info } from "lucide-react";
import { useCountUp, useEntered } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

// Made-up numbers, only so the charts have something to draw. They are labelled "Sample data" wherever they appear.
const WEEK = [
  { day: "Mon", present: 214, absent: 23 },
  { day: "Tue", present: 221, absent: 16 },
  { day: "Wed", present: 207, absent: 30 },
  { day: "Thu", present: 226, absent: 11 },
  { day: "Fri", present: 218, absent: 19 },
  { day: "Sat", present: 189, absent: 14 },
];
const FEES = { collected: 68, due: 32 };

function SampleChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning-line bg-warning-soft px-2.5 py-1 text-[11px] font-bold text-warning">
      <Info className="size-3" aria-hidden />
      Sample data
    </span>
  );
}

function AttendanceChart() {
  const entered = useEntered();
  const max = Math.max(...WEEK.flatMap((d) => [d.present, d.absent]));
  const totalPresent = WEEK.reduce((n, d) => n + d.present, 0);
  const totalAbsent = WEEK.reduce((n, d) => n + d.absent, 0);
  const rate = Math.round((totalPresent / (totalPresent + totalAbsent)) * 100);
  const presentCount = useCountUp(totalPresent);
  const absentCount = useCountUp(totalAbsent);
  const rateCount = useCountUp(rate);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Attendance this week</CardTitle>
        <SampleChip />
      </CardHeader>
      <CardContent>
        <div
          role="img"
          aria-label="Sample bar chart of students present and absent, Monday to Saturday"
        >
          <div className="mb-3 flex items-center gap-4 text-xs font-semibold text-foreground-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-emerald-500" /> Present
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-rose-400" /> Absent
            </span>
          </div>
          <div className="relative flex h-52 items-end gap-3 border-b border-border pt-6">
            {/* Three faint guide lines behind the bars */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-6 bottom-0 flex flex-col justify-between"
            >
              <span className="h-px bg-border/70" />
              <span className="h-px bg-border/70" />
              <span className="h-px bg-border/70" />
              <span />
            </div>
            {WEEK.map((d, i) => (
              <div
                key={d.day}
                className="group relative flex h-full flex-1 items-end justify-center gap-1.5"
              >
                {[
                  {
                    value: d.present,
                    color: "bg-gradient-to-t from-emerald-600 to-emerald-400",
                    name: "present",
                  },
                  {
                    value: d.absent,
                    color: "bg-gradient-to-t from-rose-500 to-rose-300",
                    name: "absent",
                  },
                ].map((bar) => (
                  <div
                    key={bar.name}
                    title={`${d.day}: ${bar.value} ${bar.name}`}
                    className={cn(
                      "relative w-full max-w-9 rounded-t-lg transition-[height] duration-700 ease-out",
                      bar.color,
                    )}
                    style={{
                      height: entered ? `${(bar.value / max) * 100}%` : "0%",
                      transitionDelay: `${i * 80}ms`,
                    }}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-bold text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {bar.value}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3">
            {WEEK.map((d) => (
              <span
                key={d.day}
                className="flex-1 text-center text-xs font-semibold text-foreground-muted"
              >
                {d.day}
              </span>
            ))}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 divide-x divide-border rounded-xl bg-surface-muted py-3 text-center">
          <div>
            <dt className="text-xs font-semibold text-foreground-muted">
              Present
            </dt>
            <dd className="mt-0.5 text-xl font-extrabold text-success">
              {presentCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-foreground-muted">
              Absent
            </dt>
            <dd className="mt-0.5 text-xl font-extrabold text-danger">
              {absentCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-foreground-muted">
              Rate
            </dt>
            <dd className="mt-0.5 text-xl font-extrabold text-primary">
              {rateCount}%
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function FeesDonut() {
  const entered = useEntered();
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const collectedLength = (FEES.collected / 100) * circumference;
  const percent = useCountUp(FEES.collected);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Fee collection</CardTitle>
        <SampleChip />
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5">
        <div
          className="relative size-40"
          role="img"
          aria-label="Sample donut chart: 68 percent of fees collected"
        >
          <svg viewBox="0 0 140 140" className="size-full -rotate-90">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              strokeWidth="16"
              className="stroke-rose-200"
            />
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              strokeWidth="16"
              strokeLinecap="round"
              className="stroke-emerald-500 transition-[stroke-dashoffset] duration-1000 ease-out"
              strokeDasharray={circumference}
              strokeDashoffset={
                entered ? circumference - collectedLength : circumference
              }
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold tracking-tight text-foreground">
              {percent}%
            </span>
            <span className="text-xs font-semibold text-foreground-muted">
              collected
            </span>
          </div>
        </div>
        <ul className="grid w-full grid-cols-2 gap-3 text-center text-xs font-semibold">
          <li className="rounded-xl bg-success-soft py-2.5 text-success">
            <span className="block text-base font-extrabold">
              {FEES.collected}%
            </span>
            Collected
          </li>
          <li className="rounded-xl bg-danger-soft py-2.5 text-danger">
            <span className="block text-base font-extrabold">{FEES.due}%</span>
            Still due
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

/** What the dashboard will look like once attendance and fees are live, drawn from made-up numbers and labelled as such. */
export function SamplePreview() {
  return (
    <section aria-labelledby="preview-title" className="space-y-4">
      <div>
        <h2
          id="preview-title"
          className="text-lg font-bold tracking-tight text-foreground"
        >
          Your dashboard, previewed
        </h2>
        <p className="mt-0.5 text-sm text-foreground-muted">
          These charts use made-up numbers to show how they will look once
          attendance and fees go live.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <AttendanceChart />
        <FeesDonut />
      </div>
    </section>
  );
}
