import { useEffect, useState } from "react";
import type { SchoolDashboard } from "../../../types";
import { dayState, indiaMinutes } from "../../../utils/dashboardRange";
import { cn } from "../../../utils/helpers";

/**
 * The line under the figures (Infinity Medisetu's "Open now"): is school open, from when to when and how long is left (with a bar of the day
 * gone), and what is going on today: how many classes have taken attendance, how many teachers are in, how many children are absent, how
 * many leave requests wait. It is about today only, so the page shows it only while Today is looked at. It moves on by itself every minute.
 */
export function SchoolNowStrip({ data }: { data: SchoolDashboard }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const state = dayState(data.day, indiaMinutes(now));
  const { students, teachers } = data.attendance;
  const leaves = data.attention.find((a) => a.kind === "leave_pending")?.count ?? 0;
  const items = [
    { label: "Attendance taken", value: `${students.classesTaken} of ${students.classesTotal} classes` },
    { label: "Teachers in school", value: `${teachers.present + teachers.late} of ${teachers.total}` },
    { label: "Children absent today", value: String(students.absent) },
    { label: "Leaves waiting", value: String(leaves) },
  ];

  return (
    // Moves on by itself, so a screen reader hears the change.
    <section aria-label="School right now" aria-live="polite" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card lg:flex-row lg:items-center lg:gap-6">
      <p className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
        {/* Green and pulsing only while school is actually open. */}
        <span aria-hidden className="relative flex size-2.5">
          {state.open && <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />}
          <span className={cn("relative inline-flex size-2.5 rounded-full", state.open ? "bg-success" : "bg-foreground-muted/60")} />
        </span>
        {state.label}
      </p>

      <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="truncate text-xs text-foreground-muted">{item.label}</dt>
            <dd className="truncate text-sm font-semibold tabular-nums text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="min-w-0 lg:w-64 lg:shrink-0">
        {state.hours ? (
          <>
            <div className="flex items-baseline justify-between gap-2 text-xs text-foreground-muted">
              <span className="truncate">{state.hours}</span>
              <span className="shrink-0 font-medium text-foreground">{state.readout}</span>
            </div>
            <div role="progressbar" aria-label="School day" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent ?? 0} className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${state.percent ?? 0}%` }} />
            </div>
          </>
        ) : (
          state.readout && <p className="text-sm font-medium text-foreground">{state.readout}</p>
        )}
      </div>
    </section>
  );
}
