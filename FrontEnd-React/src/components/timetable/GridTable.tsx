import { Plus } from "lucide-react";
import { SUBJECT_COLORS } from "../../constants/timetable";
import { cellAt, cellKey, teacherOf, type GridModel } from "../../utils/timetable";
import { cn } from "../../utils/helpers";
import type { GridCell, GridView } from "../../types";

/** What a subject is called in a small box: its code if it has one, else its name. */
const shortName = (view: GridView, subjectId: string) => {
  const a = view.allotments.find((x) => x.subjectId === subjectId);
  return a?.subjectCode ?? a?.subjectName ?? "A subject";
};

/**
 * The week as a table: a column for each day the class has school, a row for each period (the lunch and the breaks as thin rows
 * between), the times at the left. A period is a button: clicking it opens the box to pick its subject beside it (the page's job; this
 * only says which period and which button), and the period being worked on has a blue ring. A period that has something wrong has a red
 * edge (and says what in its title), one that is only worth a look an amber one.
 */
export function GridTable({
  view,
  model,
  cells,
  colors,
  problems,
  looks,
  openKey,
  onCell,
}: {
  view: GridView;
  model: GridModel;
  cells: GridCell[];
  colors: Map<string, string>;
  /** Periods with something wrong, by key, and what. */
  problems: Map<string, string[]>;
  /** Periods that are only worth a look. */
  looks: Set<string>;
  /** The period whose box is open now (`cellKey`), if any. */
  openKey: string | null;
  onCell: (day: number, period: number, button: HTMLButtonElement) => void;
}) {
  // The rows follow the day with the most rows; a day that has fewer periods has nothing in the rest.
  const reference = view.days.reduce((best, d) => (d.slots.length > best.slots.length ? d : best), view.days[0]);
  if (!reference) return null;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      <table className="w-full min-w-[44rem] table-fixed border-collapse text-sm" aria-label="Weekly timetable">
        <thead>
          <tr className="bg-surface-muted text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
            <th scope="col" className="w-32 px-3 py-2.5">Period</th>
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
                  <span className="block whitespace-nowrap text-xs font-normal text-foreground-muted">{slot.start} to {slot.end}</span>
                </th>
                {view.days.map((d) => {
                  const here = d.slots.find((s) => s.period === slot.period);
                  if (!here) {
                    return (
                      <td key={d.day} className="px-1.5 py-1.5">
                        <div aria-hidden className="flex min-h-16 items-center justify-center rounded-lg bg-surface-muted/60 text-foreground-muted">–</div>
                      </td>
                    );
                  }
                  const cell = cellAt(cells, d.day, slot.period!);
                  const key = cellKey(d.day, slot.period!);
                  const wrong = problems.get(key);
                  const first = cell?.lessons[0];
                  const where = `${d.name}, ${here.label}, ${here.start} to ${here.end}`;
                  return (
                    <td key={d.day} className="px-1.5 py-1.5">
                      <button
                        type="button"
                        onClick={(e) => onCell(d.day, slot.period!, e.currentTarget)}
                        aria-haspopup="dialog"
                        aria-expanded={openKey === key}
                        aria-label={cell ? `${where}: ${cell.lessons.map((l) => shortName(view, l.subjectId)).join(" and ")}` : `${where}: empty`}
                        title={wrong?.join("\n")}
                        className={cn(
                          "group flex min-h-16 w-full cursor-pointer flex-col justify-center gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                          cell ? colors.get(first!.subjectId) ?? SUBJECT_COLORS[0] : "border-dashed border-border bg-surface hover:border-primary/60 hover:bg-primary-soft/40",
                          wrong && "border-danger bg-danger-soft/70 ring-2 ring-danger/60",
                          !wrong && looks.has(key) && "ring-2 ring-warning/60",
                          openKey === key && "border-primary ring-2 ring-primary/50"
                        )}
                      >
                        {cell ? (
                          cell.lessons.map((l) => {
                            const teacher = teacherOf(model, l);
                            return (
                              <span key={l.subjectId} className="block min-w-0 leading-tight">
                                <span className="block truncate text-xs font-bold">{shortName(view, l.subjectId)}</span>
                                <span className="block truncate text-[11px] font-medium opacity-75">
                                  {teacher ? (model.teachers.get(teacher)?.name ?? "") : "no teacher"}
                                  {l.room ? ` · ${l.room}` : ""}
                                </span>
                              </span>
                            );
                          })
                        ) : (
                          <span aria-hidden className="m-auto flex items-center gap-1 text-xs font-medium text-foreground-muted/60 transition-colors group-hover:text-primary group-focus-visible:text-primary">
                            <Plus className="size-3.5" />
                            <span className="hidden group-hover:inline group-focus-visible:inline">Add subject</span>
                          </span>
                        )}
                      </button>
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

