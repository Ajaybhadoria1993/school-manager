import { Clock3 } from "lucide-react";
import { DAY_SHORT } from "../../constants/timetable";
import { useGetTeacherWeekQuery } from "../../redux/api/timetableApi";
import type { Teacher } from "../../types";
import type { WindowColumn } from "../../utils/assignWindow";
import { lessonRuns } from "../../utils/teacherLessons";
import { shortDate } from "../../utils/weekDates";

/**
 * Where the teacher already teaches, by day and hour (Assign class shows it under the class's timetable, 2026-11-13): one line for each stretch
 * in one class ("Mon 9 Nov · Periods 2–6 · 10:10 – 13:45 · Nursery - A · Fun activity"), so a person sees what the teacher's week is before giving them more, and that
 * a class at another hour is no clash (each class has its own timing). One read of the teacher's week; nothing is shown when it cannot be read.
 */
export function TeacherLessonsPanel({ teacher, columns }: { teacher: Teacher; columns: WindowColumn[] }) {
  const res = useGetTeacherWeekQuery(teacher.id);
  const week = res.data?.data;
  if (!week) return null;
  // In the order of the seven days the grid beside it shows (today or tomorrow first), each with the date that weekday comes first.
  const dates = new Map(columns.map((c) => [c.day, c.date]));
  const order = (day: number) => {
    const at = columns.findIndex((c) => c.day === day);
    return at < 0 ? 99 : at;
  };
  const runs = lessonRuns(week.lessons).sort((a, b) => order(a.day) - order(b.day) || a.start.localeCompare(b.start));

  return (
    <section aria-label={`Where ${teacher.name} teaches now`} className="min-w-0 space-y-2 rounded-xl border border-border bg-surface-muted/40 p-3.5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Clock3 className="size-4 text-primary" aria-hidden />
        Where {teacher.name} teaches now
      </h3>
      {runs.length === 0 ? (
        <p className="text-sm text-foreground-muted">{teacher.name} has no lesson in any timetable yet.</p>
      ) : (
        <ul aria-label={`Lessons of ${teacher.name}`} className="space-y-1 text-sm">
          {runs.map((r) => (
            <li key={`${r.day}-${r.start}-${r.label}-${r.subjectName}`} className="flex flex-wrap items-baseline gap-x-2">
              <span className="w-24 shrink-0 font-semibold text-foreground">{`${DAY_SHORT[r.day] ?? ""} ${dates.get(r.day) ? shortDate(dates.get(r.day)!) : ""}`.trim()}</span>{" "}
              <span className="text-foreground-muted">{r.periods[0] === r.periods[1] ? `Period ${r.periods[0]}` : `Periods ${r.periods[0]}–${r.periods[1]}`}</span>{" "}
              <span className="tabular-nums text-foreground-muted">{`${r.start} – ${r.end}`}</span>{" "}
              <span className="min-w-0 text-foreground">{`${r.label} · ${r.subjectName}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
