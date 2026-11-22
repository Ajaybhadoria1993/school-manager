import { Plus, Sun, TriangleAlert } from "lucide-react";
import { SUBJECT_COLORS } from "../../constants/timetable";
import { cellAt, cellKey, dayEnds, teacherOf, type GridModel } from "../../utils/timetable";
import { cn } from "../../utils/helpers";
import { withoutArrival } from "../../utils/timings";
import type { GridCell, GridView } from "../../types";

/** What a subject is called in a small box: its code if it has one, else its name. */
const shortName = (view: GridView, subjectId: string) => {
  const a = view.allotments.find((x) => x.subjectId === subjectId);
  return a?.subjectCode ?? a?.subjectName ?? "A subject";
};

/**
 * The week as a table, in the look of the reference pictures (2026-11-22): a column for each day the class has school, a row for each period
 * with its name and times at the left; the lunch (striped orange) and a break as a band across the days. A lesson is a card in its subject's
 * colour with a bar at its left, the subject and its teacher; an empty period is a dashed box with a +. A period is a button: clicking it opens
 * the box to pick its subject beside it (the page's job; this only says which period and which button), and the period being worked on has a
 * blue ring. A period that has something wrong has a red edge and says it (the whole of it in its title), one only worth a look an amber ring.
 * The last row says when the class's day ends: the end of its last period that has a lesson.
 */
export function GridTable({
  view,
  model,
  cells,
  colors,
  accents,
  problems,
  looks,
  openKey,
  onCell,
}: {
  view: GridView;
  model: GridModel;
  cells: GridCell[];
  colors: Map<string, string>;
  /** Each subject's bar colour (`subjectAccents`). */
  accents?: Map<string, { bar: string }>;
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
  const ends = dayEnds(view, cells);

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface p-2 shadow-card">
      <table className="w-full min-w-[44rem] table-fixed border-separate border-spacing-1.5 text-sm" aria-label="Weekly timetable">
        <thead>
          <tr className="text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
            <th scope="col" className="w-32 px-2 py-2">Period</th>
            {view.days.map((d) => (
              <th key={d.day} scope="col" className="px-2 py-2">
                {d.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {withoutArrival(reference.slots).map((slot, i) =>
            slot.period === null ? (
              (() => {
                // The lunch is a striped orange band across the week; a short break a grey one.
                const lunch = slot.label.toLowerCase().includes("lunch");
                const band = lunch ? "bg-orange-soft text-orange-hover" : "bg-surface-muted text-foreground-muted";
                const stripes = lunch ? { backgroundImage: "repeating-linear-gradient(135deg, transparent 0 10px, rgb(245 158 11 / 0.1) 10px 20px)" } : undefined;
                return (
                  <tr key={i}>
                    <th scope="row" style={stripes} className={cn("rounded-l-lg px-2 py-2 text-left text-xs font-bold uppercase tracking-wider", band)}>
                      <span className="inline-flex items-center gap-1.5">
                        {lunch && <Sun className="size-3.5" aria-hidden />}
                        {slot.label}
                      </span>
                    </th>
                    <td colSpan={view.days.length} style={stripes} className={cn("rounded-r-lg px-3 py-2 text-center text-xs font-bold", band)}>
                      {slot.start} to {slot.end}
                    </td>
                  </tr>
                );
              })()
            ) : (
              <tr key={i}>
                <th scope="row" className="px-2 py-1 text-left align-middle">
                  <span className="block whitespace-nowrap text-sm font-bold text-foreground">{slot.label}</span>
                  <span className="block whitespace-nowrap text-xs font-normal text-foreground-muted">
                    {slot.start} to {slot.end}
                  </span>
                </th>
                {view.days.map((d) => {
                  const here = d.slots.find((s) => s.period === slot.period);
                  if (!here) {
                    return (
                      <td key={d.day}>
                        <div aria-hidden className="flex min-h-16 items-center justify-center rounded-lg bg-surface-muted/60 text-foreground-muted">
                          –
                        </div>
                      </td>
                    );
                  }
                  const cell = cellAt(cells, d.day, slot.period!);
                  const key = cellKey(d.day, slot.period!);
                  const wrong = problems.get(key);
                  const first = cell?.lessons[0];
                  const where = `${d.name}, ${here.label}, ${here.start} to ${here.end}`;
                  return (
                    <td key={d.day} className="align-top">
                      <button
                        type="button"
                        onClick={(e) => onCell(d.day, slot.period!, e.currentTarget)}
                        aria-haspopup="dialog"
                        aria-expanded={openKey === key}
                        aria-label={cell ? `${where}: ${cell.lessons.map((l) => shortName(view, l.subjectId)).join(" and ")}` : `${where}: empty`}
                        title={wrong?.join("\n")}
                        className={cn(
                          "group flex min-h-16 w-full cursor-pointer flex-col justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                          cell
                            ? cn(colors.get(first!.subjectId) ?? SUBJECT_COLORS[0], "border-l-4", accents?.get(first!.subjectId)?.bar)
                            : "items-center border-dashed border-border bg-surface hover:border-primary/60 hover:bg-primary-soft/40",
                          wrong && "border-danger bg-danger-soft/70 ring-2 ring-danger/60",
                          !wrong && looks.has(key) && "ring-2 ring-warning/60",
                          openKey === key && "border-primary ring-2 ring-primary/50"
                        )}
                      >
                        {cell ? (
                          <>
                            {cell.lessons.map((l) => {
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
                            })}
                            {wrong && (
                              <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-bold text-danger">
                                <TriangleAlert className="size-3 shrink-0" aria-hidden />
                                <span className="truncate">{wrong[0]}</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span aria-hidden className="m-auto flex items-center gap-1 text-xs font-medium text-foreground-muted/60 transition-colors group-hover:text-primary group-focus-visible:text-primary">
                            <Plus className="size-4" />
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
        <tfoot>
          <tr>
            <th scope="row" className="rounded-l-lg bg-surface-muted/70 px-2 py-2 text-left text-[13.5px] font-semibold text-foreground">
              Class ends
            </th>
            {view.days.map((d, i) => (
              <td key={d.day} className={cn("bg-surface-muted/70 px-2 py-2 text-sm font-semibold tabular-nums text-foreground", i === view.days.length - 1 && "rounded-r-lg")}>
                {ends.get(d.day) ?? <span className="font-normal text-foreground-muted">–</span>}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
