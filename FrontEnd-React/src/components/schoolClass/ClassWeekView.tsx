import { useMemo } from "react";
import { SUBJECT_COLORS } from "../../constants/timetable";
import { buildModel, cellAt, subjectColors, teacherOf } from "../../utils/timetable";
import { clock12, weekdayDay } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import type { ExamDay, GridView } from "../../types";

/**
 * A class's week to look at (its School Class page): a column for each day it has school, a row for each period with its time (the lunch
 * and the breaks as thin rows), and in each period its subject, its teacher and its room. Nothing here can be pressed: the week is changed
 * in the timetable (Edit timetable). The rows follow the day with the most rows, as in the timetable itself.
 *
 * The timetable gives way on exam days (2026-11-06): `examDays` are the days of this week on which the class has a paper. A day of a
 * **full exam** shows the exam (its papers and the school's hours) in place of that day's lessons; a **test** keeps the lessons and shows
 * itself in the day's heading. An exam day the timetable has no column for (a Saturday paper of a Monday to Friday school) is listed under
 * the week.
 */
export function ClassWeekView({ view, label, examDays = [] }: { view: GridView; label: string; examDays?: ExamDay[] }) {
  const model = useMemo(() => buildModel(view), [view]);
  const colors = useMemo(() => subjectColors(view), [view]);
  const reference = view.days.reduce((best, d) => (d.slots.length > best.slots.length ? d : best), view.days[0]);
  if (!reference) return null;
  const subjectName = (id: string) => model.allotments.get(id)?.subjectName ?? "A subject";
  const examOn = new Map(examDays.map((e) => [e.day, e]));
  const columns = new Set(view.days.map((d) => d.day));
  const replaced = new Set(examDays.filter((e) => e.replacesLessons && columns.has(e.day)).map((e) => e.day));
  const outside = examDays.filter((e) => !columns.has(e.day));

  return (
    // `relative`: the hidden words of a free period ("Free", for a screen reader) are placed against this box, so the ones scrolled off
    // to the right stay inside it instead of widening the page on a phone.
    <div className="relative overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      <table className="w-full min-w-[44rem] table-fixed border-collapse text-sm" aria-label={`Weekly timetable of ${label}`}>
        <thead>
          <tr className="bg-surface-muted text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
            <th scope="col" className="w-32 px-3 py-2.5">
              Period
            </th>
            {view.days.map((d) => {
              const exam = examOn.get(d.day);
              return (
                <th key={d.day} scope="col" className="px-2 py-2.5">
                  {d.name}
                  {exam && (
                    <span className="mt-1 block text-[11px] font-semibold normal-case tracking-normal text-primary">
                      <span className="mr-1 rounded bg-primary-soft px-1.5 py-0.5 font-bold uppercase tracking-wide">{exam.replacesLessons ? "Exam" : "Test"}</span>
                      {!exam.replacesLessons && exam.papers.map((p) => `${p.subject.name} ${clock12(p.startTime)}`).join(", ")}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {reference.slots.map((slot, i) =>
            slot.period === null ? (
              <tr key={i} className="bg-surface-muted/70">
                <th scope="row" className="px-3 py-1.5 text-left text-xs font-semibold text-foreground-muted">
                  {slot.label}
                </th>
                {/* A break runs across the days that have lessons; an exam day's column is one tall cell that the break goes around. */}
                {runsOf(
                  view.days.map((d) => d.day),
                  replaced
                ).map((run, at) =>
                  run.kind === "exam" ? (
                    i === 0 ? (
                      <ExamCell key={`exam-${run.day}`} exam={examOn.get(run.day)!} rows={reference.slots.length} />
                    ) : null
                  ) : (
                    <td key={at} colSpan={run.length} className="px-2 py-1.5 text-center text-xs text-foreground-muted">
                      {slot.start} to {slot.end}
                    </td>
                  )
                )}
              </tr>
            ) : (
              <tr key={i} className="border-t border-border">
                <th scope="row" className="px-3 py-1.5 text-left align-middle">
                  <span className="block whitespace-nowrap text-sm font-bold text-foreground">{slot.label}</span>
                  <span className="block whitespace-nowrap text-xs font-normal text-foreground-muted">
                    {slot.start} to {slot.end}
                  </span>
                </th>
                {view.days.map((d) => {
                  if (replaced.has(d.day)) return i === 0 ? <ExamCell key={d.day} exam={examOn.get(d.day)!} rows={reference.slots.length} /> : null;
                  const here = d.slots.find((s) => s.period === slot.period);
                  const cell = here ? cellAt(view.cells, d.day, slot.period!) : undefined;
                  if (!cell) {
                    return (
                      <td key={d.day} className="px-1.5 py-1.5">
                        <div className="flex min-h-14 items-center justify-center rounded-lg bg-surface-muted/50 text-foreground-muted/60">
                          <span aria-hidden>–</span>
                          <span className="sr-only">{here ? "Free" : "No period"}</span>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={d.day} className="px-1.5 py-1.5">
                      <div className={cn("flex min-h-14 flex-col justify-center gap-0.5 rounded-lg border px-2 py-1.5", colors.get(cell.lessons[0].subjectId) ?? SUBJECT_COLORS[0])}>
                        {cell.lessons.map((lesson) => {
                          const teacher = teacherOf(model, lesson);
                          return (
                            <span key={lesson.subjectId} className="block min-w-0 leading-tight">
                              <span className="block truncate text-xs font-bold">{subjectName(lesson.subjectId)}</span>
                              <span className="block truncate text-[11px] font-medium opacity-75">
                                {teacher ? (model.teachers.get(teacher)?.name ?? "A teacher") : "No teacher"}
                                {lesson.room ? ` · ${lesson.room}` : ""}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            )
          )}
        </tbody>
      </table>
      {outside.length > 0 && (
        <ul aria-label="Exam days outside the timetable" className="space-y-1 border-t border-border px-4 py-3 text-sm text-foreground">
          {outside.map((e) => (
            <li key={e.date}>
              <span className="font-bold">{weekdayDay(e.date)}</span>
              <span className="text-foreground-muted">
                {" "}
                · {e.exams.map((x) => x.name).join(", ")}:{" "}
                {[...e.papers]
                  .sort(byStart)
                  .map((p) => `${p.subject.name} ${clock12(p.startTime)} to ${clock12(p.endTime)}`)
                  .join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const byStart = (a: { startTime: string }, b: { startTime: string }) => a.startTime.localeCompare(b.startTime);

type Run = { kind: "lessons"; length: number } | { kind: "exam"; day: number };

/** The days across a break row: the runs of days that have lessons (one cell each), with the exam days (tall cells) between them. */
function runsOf(days: number[], replaced: Set<number>): Run[] {
  const runs: Run[] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (replaced.has(day)) runs.push({ kind: "exam", day });
    else if (last?.kind === "lessons") last.length += 1;
    else runs.push({ kind: "lessons", length: 1 });
  }
  return runs;
}

/** A day of a full exam: one tall cell in the day's column, the exam and its papers in place of the day's lessons. */
function ExamCell({ exam, rows }: { exam: ExamDay; rows: number }) {
  return (
    <td rowSpan={rows} aria-label={exam.exams.map((e) => e.name).join(", ")} className="h-px px-1.5 py-1.5 align-top">
      <div className="flex h-full min-h-14 flex-col gap-1.5 rounded-lg border border-primary/30 bg-primary-soft px-2 py-2 text-primary-deep">
        <p className="text-xs font-bold">{exam.exams.map((e) => e.name).join(", ")}</p>
        <p className="text-[11px] font-medium opacity-80">No regular lessons</p>
        {exam.schoolHours && (
          <p className="text-[11px] font-semibold">
            School {clock12(exam.schoolHours.start)} to {clock12(exam.schoolHours.end)}
          </p>
        )}
        <ul className="space-y-1">
          {[...exam.papers].sort(byStart).map((p) => (
            <li key={p.id} className="text-[11px] leading-tight">
              <span className="block font-bold">{p.subject.name}</span>
              <span className="block opacity-80">
                {clock12(p.startTime)} to {clock12(p.endTime)}
                {p.topic ? ` · ${p.topic}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </td>
  );
}
