import { useMemo } from "react";
import { CalendarDays, UsersRound } from "lucide-react";
import { DAY_SHORT } from "../../constants/timetable";
import type { GridView, Lesson } from "../../types";
import { cn } from "../../utils/helpers";
import { teachersOfClass } from "../../utils/classTeachers";
import { slotKey } from "../../utils/teacherSlots";
import { assignWindow } from "../../utils/assignWindow";
import { shortDate } from "../../utils/weekDates";
import { subjectColors, teacherOf, buildModel } from "../../utils/timetable";
import { Badge } from "../ui/Badge";

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * A class's timetable as it is now, read only, with who teaches what (Assign class shows it beside the form, 2026-11-13): the teachers of the
 * class with their subjects (the class teacher marked, the subjects nobody teaches yet), and its week: each period names its subject and its
 * teacher, laid out like the class's own timetable page (a row for each period with its number and hours, a column for each day with its date
 * the next seven days). The periods being chosen for the teacher in the form show in it with a dashed edge ("+ Eng, Meena"), so the person sees where the
 * new lessons will stand among the others. It only reads (`grid` is `GET /timetable/grid`); changing the timetable is the form's Assign.
 */
export function ClassTimetablePanel({ grid, label, pending, now }: { grid: GridView; label: string; pending?: { keys: string[]; subject: string; teacher: string }; now?: Date }) {
  // The same seven days as the days-and-periods grid beside it: from today (while the class has a period to come) or tomorrow, in calendar order.
  const columnsOfDays = assignWindow(grid, now ?? new Date());
  const model = useMemo(() => buildModel(grid), [grid]);
  const colors = useMemo(() => subjectColors(grid), [grid]);
  const who = useMemo(() => teachersOfClass(grid), [grid]);
  const coming = new Set(pending?.keys ?? []);
  const periods = Math.max(0, ...grid.days.map((d) => d.slots.filter((s) => s.kind === "period").length));
  const columns = Array.from({ length: periods }, (_, i) => i + 1);
  /** The hours of period `p` ("09:30 – 10:10") when every day that has it runs it then. */
  const hoursOf = (p: number) => {
    const hours = new Set(grid.days.flatMap((d) => d.slots.filter((s) => s.kind === "period" && s.period === p).map((s) => `${s.start} – ${s.end}`)));
    return hours.size === 1 ? [...hours][0] : null;
  };
  const nameOf = (subjectId: string) => grid.allotments.find((a) => a.subjectId === subjectId);
  /** The teacher of a lesson: the one it names, or the one the class's list gives its subject. */
  const teacherNameOf = (lesson: Lesson) => {
    const id = teacherOf(model, lesson);
    return id ? model.teachers.get(id)?.name : undefined;
  };
  const lessonText = (lesson: Lesson) => `${nameOf(lesson.subjectId)?.subjectName ?? "A subject"}${teacherNameOf(lesson) ? ` (${teacherNameOf(lesson)})` : ""}`;

  return (
    <section aria-label={`Timetable of ${label}`} className="min-w-0 space-y-3.5 rounded-xl border border-border bg-surface-muted/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CalendarDays className="size-4 text-primary" aria-hidden />
          Timetable of {label}
        </h3>
        <Badge tone={grid.status === "published" ? "success" : "neutral"}>{grid.status === "published" ? "Published" : "Draft"}</Badge>
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground-muted">
          <UsersRound className="size-3.5" aria-hidden />
          Teachers of this class
        </p>
        {who.teachers.length === 0 && who.withoutTeacher.length === 0 ? (
          <p className="text-sm text-foreground-muted">No subject or teacher yet.</p>
        ) : (
          <ul aria-label={`Teachers of ${label}`} className="space-y-1">
            {who.teachers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-foreground">{t.name}</span>
                {t.head && <Badge tone="primary">Class teacher</Badge>}
                <span className="text-foreground-muted">{t.subjects.length > 0 ? t.subjects.join(", ") : "no subject yet"}</span>
              </li>
            ))}
            {who.withoutTeacher.length > 0 && (
              <li className="text-sm text-foreground-muted">
                <span className="font-semibold text-warning">No teacher yet:</span> {who.withoutTeacher.join(", ")}
              </li>
            )}
          </ul>
        )}
      </div>

      {periods === 0 ? (
        <p className="text-sm text-foreground-muted">{label} has no timing yet, so there is no week to show.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label={`Timetable now of ${label}`} className="w-full min-w-[28rem] table-fixed border-separate border-spacing-1 text-center">
            <thead>
              <tr>
                <th scope="col" className="w-28 text-left text-xs font-semibold text-foreground-muted">
                  Period
                </th>
                {columnsOfDays.map((c) => {
                  const school = grid.days.some((d) => d.day === c.day);
                  return (
                    <th key={c.date.getTime()} scope="col" aria-current={c.today ? "date" : undefined} className={cn("leading-tight", c.today ? "text-primary-deep" : school ? "text-foreground" : "text-foreground-muted/60")}>
                      <span className="block text-xs font-semibold">{DAY_SHORT[c.day]}</span>{" "}
                      <span className="block text-[10px] font-medium text-foreground-muted">{shortDate(c.date)}</span>
                      {!school && (
                        <>
                          {" "}
                          <span className="block text-[9px] font-medium text-foreground-muted/70">No school</span>
                        </>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {columns.map((p) => (
                <tr key={p}>
                  <th scope="row" className="pr-1 text-left leading-tight">
                    <span className="block text-xs font-bold text-foreground">Period {p}</span>
                    {hoursOf(p) && <span className="block text-[10px] font-medium text-foreground-muted">{hoursOf(p)}</span>}
                  </th>
                  {columnsOfDays.map((c) => {
                    const d = grid.days.find((x) => x.day === c.day);
                    if (!d || !d.slots.some((s) => s.kind === "period" && s.period === p)) return <td key={c.date.getTime()} />;
                    const lessons = grid.cells.find((x) => x.day === d.day && x.period === p)?.lessons ?? [];
                    const key = slotKey(d.day, p);
                    if (lessons.length === 0) {
                      const isComing = coming.has(key);
                      return (
                        <td key={c.date.getTime()} title={`${d.name} period ${p}: ${isComing ? `${pending?.subject} with ${pending?.teacher} (to be added)` : "empty"}`}>
                          <div className={cn("flex h-11 flex-col items-center justify-center rounded-md border text-[11px] leading-tight", isComing ? "border-dashed border-primary bg-primary-soft/60 font-semibold text-primary-deep" : "border-border/60 text-foreground-muted/60")}>
                            {isComing ? (
                              <>
                                <span>+ {pending?.subject.slice(0, 3)}</span>
                                <span className="font-medium">{firstName(pending?.teacher ?? "")}</span>
                              </>
                            ) : (
                              "·"
                            )}
                          </div>
                        </td>
                      );
                    }
                    const first = lessons[0];
                    const subject = nameOf(first.subjectId);
                    const teacher = teacherNameOf(first);
                    return (
                      <td key={c.date.getTime()} title={`${d.name} period ${p}: ${lessons.map(lessonText).join(" and ")}`}>
                        <div className={cn("flex h-11 flex-col items-center justify-center rounded-md border text-[11px] leading-tight", colors.get(first.subjectId))}>
                          <span className="max-w-full truncate font-bold">
                            {(subject?.subjectCode ?? subject?.subjectName ?? "").slice(0, 4)}
                            {lessons.length > 1 ? ` +${lessons.length - 1}` : ""}
                          </span>
                          <span className="max-w-full truncate font-medium opacity-80">{teacher ? firstName(teacher) : "no teacher"}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
