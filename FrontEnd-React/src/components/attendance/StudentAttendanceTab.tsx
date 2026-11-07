import { useState } from "react";
import { useSearchParams } from "react-router";
import { Backpack, CalendarX2, ClockAlert, Percent } from "lucide-react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetStudentsAttendanceQuery, useGetStudentsTodayQuery } from "../../redux/api/attendanceApi";
import { getApiError } from "../../utils/apiErrors";
import { dayCount, isLowPercent, percentText, rangePresets, showsEveryDay, weekdayLetter } from "../../utils/attendance";
import { shortDay } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import type { AttendanceStatus, StudentRangeRow } from "../../types";
import { StatTile } from "../dashboard/school/StatTile";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { RangeFilter } from "./RangeFilter";
import { StudentDaysDialog } from "./StudentDaysDialog";

const MARK: Record<AttendanceStatus, { letter: string; word: string; tone: string }> = {
  present: { letter: "P", word: "Present", tone: "bg-success-soft text-success" },
  absent: { letter: "A", word: "Absent", tone: "bg-danger-soft text-danger" },
  late: { letter: "L", word: "Late", tone: "bg-warning-soft text-warning" },
  leave: { letter: "Lv", word: "Leave", tone: "bg-info-soft text-info" },
};
const WEEKDAY_NAME = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TH = "whitespace-nowrap px-2.5 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted";

/** A group of choices that is one at a time, drawn as chips (the classes, the sections). */
function Chips({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="relative block">
          <input type="radio" className="peer sr-only" name={`chips-${label}`} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span
            className={cn(
              "inline-flex h-10 cursor-pointer select-none items-center rounded-xl border px-4 text-sm font-semibold transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20",
              value === o.value ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/40" : "border-border bg-surface text-foreground hover:border-primary/50"
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Student attendance for the school (the Student tab of Attendance, 2026-11-06): every class by name; one with sections shows them too
 * (All sections, A, B...). The children of what is picked come with their marks for the days asked (this month to start with): a column for
 * each day up to a month (P, A, L; a day nobody took is empty, a holiday is said), then their counts and percentage; a longer range shows the
 * counts only. A child's name opens their days with the reason of each absence. What is picked is kept in the address.
 */
export function StudentAttendanceTab() {
  const [params, setParams] = useSearchParams();
  const structure = useGetStructureQuery();
  const classes = structure.data?.data.classes ?? [];
  const today = todayInIndia();
  const month = rangePresets(today).find((p) => p.id === "month")!;

  const klass = classes.find((c) => c.id === params.get("class")) ?? classes[0];
  const section = klass?.sections.find((s) => s.id === params.get("section"));
  const range = { from: params.get("from") ?? month.from, to: params.get("to") ?? month.to };

  const res = useGetStudentsAttendanceQuery({ classId: klass?.id ?? "", sectionId: section?.id ?? "all", ...range }, { skip: !klass });
  const data = res.data?.data;
  const [open, setOpen] = useState<StudentRangeRow | null>(null);
  // The classes that have not taken today's attendance (a warning above the list; a failed read leaves it out).
  const pending = useGetStudentsTodayQuery().data?.data.pending ?? [];

  function change(patch: Record<string, string>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === "") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );
  }

  if (structure.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!klass) return <Card className="px-5 py-10 text-center text-sm text-foreground-muted">No class yet</Card>;

  const grid = data ? showsEveryDay(dayCount(data.from, data.to)) : false;

  return (
    <div className="space-y-5">
      {pending.length > 0 && (
        <section aria-label="Attendance not taken today" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning-line bg-warning-soft/60 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-bold text-warning">
            <CalendarX2 className="size-4" aria-hidden />
            Not taken today
          </span>
          {pending.map((p) => (
            <button
              key={`${p.classId}-${p.sectionId ?? ""}`}
              type="button"
              onClick={() => change({ class: p.classId, section: p.sectionId ?? "", from: today, to: today })}
              className="h-8 rounded-lg border border-warning-line bg-surface px-3 font-semibold text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              {p.label}
            </button>
          ))}
        </section>
      )}
      <div className="space-y-3">
        <Chips label="Class" value={klass.id} options={classes.map((c) => ({ value: c.id, label: c.name }))} onChange={(id) => change({ class: id, section: "" })} />
        {klass.sections.length > 0 && (
          <Chips
            label="Section"
            value={section?.id ?? "all"}
            options={[{ value: "all", label: "All sections" }, ...klass.sections.map((s) => ({ value: s.id, label: s.name }))]}
            onChange={(id) => change({ section: id === "all" ? "" : id })}
          />
        )}
        <RangeFilter idPrefix="students" range={range} onChange={(r) => change({ from: r.from, to: r.to })} />
      </div>

      {res.isFetching && !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data ? (
        <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the attendance."}</Card>
      ) : (
        <>
          <section aria-label="About the attendance" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Students" value={data.summary.students} icon={Backpack} tone="primary" />
            <StatTile label="Attendance" value={percentText(data.summary.percent)} icon={Percent} tone="success" />
            <StatTile label="Absent" value={data.summary.absent} icon={CalendarX2} tone="danger" />
            <StatTile label="Late" value={data.summary.late} icon={ClockAlert} tone="warning" />
          </section>

          {data.students.length === 0 ? (
            <Card className="px-5 py-10 text-center text-sm text-foreground-muted">No student in this class yet</Card>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
              <table aria-label={`Attendance of ${data.label}`} className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-muted/60">
                    <th scope="col" className={TH}>
                      Roll
                    </th>
                    <th scope="col" className={TH}>
                      Student
                    </th>
                    {grid &&
                      data.days.map((d) => (
                        <th
                          key={d.date}
                          scope="col"
                          aria-label={`${WEEKDAY_NAME[d.weekday]} ${shortDay(d.date)}${d.holiday ? `, Holiday: ${d.holiday}` : !d.taken ? ", attendance not taken" : ""}`}
                          title={d.holiday ? `Holiday: ${d.holiday}` : d.taken ? undefined : "Attendance not taken"}
                          className={cn("px-1 py-2 text-center text-[11px] font-bold leading-tight text-foreground-muted", d.holiday && "bg-info-soft text-info", !d.taken && !d.holiday && "opacity-50")}
                        >
                          <span className="block">{weekdayLetter(d.weekday)}</span>
                          <span className="block">{d.date.slice(8)}</span>
                        </th>
                      ))}
                    <th scope="col" className={TH}>
                      Present
                    </th>
                    <th scope="col" className={TH}>
                      Absent
                    </th>
                    <th scope="col" className={TH}>
                      Late
                    </th>
                    <th scope="col" className={TH}>
                      Leave
                    </th>
                    <th scope="col" className={TH}>
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => {
                    const byDay = new Map(s.records.map((r) => [r.date, r]));
                    return (
                      <tr key={s.id} className="border-t border-surface-muted hover:bg-background">
                        <td className="px-3 py-2 text-foreground-muted">{s.rollNumber ?? ""}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <button type="button" onClick={() => setOpen(s)} className="max-w-[14rem] truncate text-left font-bold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                            {s.name}
                          </button>
                          {s.section && !section && klass.sections.length > 0 && <span className="ml-2 text-xs font-semibold text-foreground-muted">{s.section}</span>}
                        </td>
                        {grid &&
                          data.days.map((d) => {
                            const r = byDay.get(d.date);
                            if (!r) return <td key={d.date} className={cn("px-px py-1.5 text-center text-foreground-muted/40", d.holiday && "bg-info-soft/40")} />;
                            const m = MARK[r.status];
                            const said = `${s.name}, ${shortDay(d.date)}: ${m.word}${r.reason ? `, ${r.reason}` : ""}`;
                            return (
                              <td key={d.date} className="px-px py-1.5 text-center">
                                <span aria-label={said} title={said} className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md px-0.5 text-[11px] font-bold", m.tone)}>
                                  {m.letter}
                                  {r.reason && <span aria-hidden className="ml-0.5 size-1 rounded-full bg-current" />}
                                </span>
                              </td>
                            );
                          })}
                        <td aria-label={`Present: ${s.tally.present}`} className="px-3 py-2 font-semibold text-success">
                          {s.tally.present}
                        </td>
                        <td aria-label={`Absent: ${s.tally.absent}`} className="px-3 py-2 font-semibold text-danger">
                          {s.tally.absent}
                        </td>
                        <td aria-label={`Late: ${s.tally.late}`} className="px-3 py-2 font-semibold text-warning">
                          {s.tally.late}
                        </td>
                        <td aria-label={`Leave: ${s.tally.leave}`} className="px-3 py-2 font-semibold text-info">
                          {s.tally.leave}
                        </td>
                        <td aria-label="Percentage" title={isLowPercent(s.tally.percent) ? "Below 75%" : undefined} className={cn("px-3 py-2 font-bold", isLowPercent(s.tally.percent) ? "text-danger" : "text-foreground")}>
                          {percentText(s.tally.percent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {open && data && <StudentDaysDialog student={open} range={{ from: data.from, to: data.to }} onClose={() => setOpen(null)} />}
    </div>
  );
}
