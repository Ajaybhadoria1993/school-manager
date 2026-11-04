import { useMemo } from "react";
import { SUBJECT_COLORS } from "../../constants/timetable";
import { buildModel, cellAt, subjectColors, teacherOf } from "../../utils/timetable";
import { cn } from "../../utils/helpers";
import type { GridView } from "../../types";

/**
 * A class's week to look at (its School Class page): a column for each day it has school, a row for each period with its time (the lunch
 * and the breaks as thin rows), and in each period its subject, its teacher and its room. Nothing here can be pressed: the week is changed
 * in the timetable (Edit timetable). The rows follow the day with the most rows, as in the timetable itself.
 */
export function ClassWeekView({ view, label }: { view: GridView; label: string }) {
  const model = useMemo(() => buildModel(view), [view]);
  const colors = useMemo(() => subjectColors(view), [view]);
  const reference = view.days.reduce((best, d) => (d.slots.length > best.slots.length ? d : best), view.days[0]);
  if (!reference) return null;
  const subjectName = (id: string) => model.allotments.get(id)?.subjectName ?? "A subject";

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
            {view.days.map((d) => (
              <th key={d.day} scope="col" className="px-2 py-2.5">
                {d.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reference.slots.map((slot, i) =>
            slot.period === null ? (
              <tr key={i} className="bg-surface-muted/70">
                <th scope="row" className="px-3 py-1.5 text-left text-xs font-semibold text-foreground-muted">
                  {slot.label}
                </th>
                <td colSpan={view.days.length} className="px-2 py-1.5 text-center text-xs text-foreground-muted">
                  {slot.start} to {slot.end}
                </td>
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
    </div>
  );
}
