import { Pencil, Trash2 } from "lucide-react";
import type { Exam, ExamPaper } from "../../types";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { clock12, durationText, weekdayDay, type ClassGroup } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

interface Actions {
  onEdit: (paper: ExamPaper) => void;
  onRemove: (paper: ExamPaper) => void;
}

/** A paper's pencil (change it) and bin (take it away). */
function PaperButtons({ paper, onEdit, onRemove }: Actions & { paper: ExamPaper }) {
  // A year that is over is only looked at: a paper is not changed or taken away.
  if (useReadOnlyYear()) return null;
  return (
    <span className="flex shrink-0 gap-1">
      <Button variant="ghost" size="sm" aria-label={`Change ${paper.subject.name}`} onClick={() => onEdit(paper)}>
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button variant="ghost" size="sm" aria-label={`Take ${paper.subject.name} away`} className="hover:text-danger" onClick={() => onRemove(paper)}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </span>
  );
}

/** What the paper has gone through since it was set: a holiday declared on its day (the school moves it), and the marks already entered. */
function PaperNotes({ paper }: { paper: ExamPaper }) {
  if (!paper.holiday && paper.marked === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-normal">
      {paper.holiday && <Badge tone="warning">Holiday: {paper.holiday}</Badge>}
      {paper.marked > 0 && <span className="text-foreground-muted">{`Marks of ${paper.marked} ${paper.marked === 1 ? "child" : "children"}`}</span>}
    </span>
  );
}

const timeText = (p: ExamPaper) => `${clock12(p.startTime)} to ${clock12(p.endTime)}`;
const Dash = () => <span className="text-foreground-muted">–</span>;

/**
 * One card of "by class": the classes that write the same papers on the same days at the same times, and those papers. A paper only
 * some of the card's classes write says which ("Class 1 only").
 */
export function ClassGroupCard({ group, onEdit, onRemove }: Actions & { group: ClassGroup }) {
  const names = group.classes.map((c) => c.name);
  return (
    <section role="region" aria-label={names.join(", ")} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap gap-2 border-b border-border bg-surface-muted/50 px-4 py-3">
        {names.map((n) => (
          <span key={n} className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm font-bold text-primary-deep">
            {n}
          </span>
        ))}
      </div>
      {/* A phone has no room for the table: each paper is a row of its own, with its buttons. */}
      <ul className="divide-y divide-border sm:hidden">
        {group.papers.map((p) => (
          <li key={p.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold text-foreground">
                {p.subject.name}
                {p.maxMarks !== null && <span className="ml-2 font-normal text-foreground-muted">{p.maxMarks} marks</span>}
              </p>
              <p className="text-foreground">
                {weekdayDay(p.date)} · {timeText(p)}
              </p>
              <p className="text-foreground-muted">
                {durationText(p.durationMinutes)}
                {p.topic ? ` · ${p.topic}` : ""}
                {p.classIds.length !== group.classes.length ? ` · ${p.classes.map((c) => c.name).join(", ")} only` : ""}
              </p>
              <PaperNotes paper={p} />
            </div>
            <PaperButtons paper={p} onEdit={onEdit} onRemove={onRemove} />
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        {/* Fixed columns, so the cards of different classes line up one under the other. */}
        <table className="w-full min-w-[44rem] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-32" />
            <col className="w-64" />
            <col className="w-44" />
            <col />
            <col className="w-20" />
            <col className="w-28" />
          </colgroup>
          <thead>
            <tr className="text-xs font-bold uppercase tracking-wide text-foreground-muted">
              <th scope="col" className="px-4 py-2.5">Day</th>
              <th scope="col" className="px-4 py-2.5">Time</th>
              <th scope="col" className="px-4 py-2.5">Subject</th>
              <th scope="col" className="px-4 py-2.5">Topic</th>
              <th scope="col" className="px-4 py-2.5">Marks</th>
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">Change or take away</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {group.papers.map((p) => (
              <tr key={p.id} className="align-top transition-colors hover:bg-surface-muted/40">
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-foreground">{weekdayDay(p.date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-foreground">
                  {timeText(p)} <span className="ml-1 text-foreground-muted">{durationText(p.durationMinutes)}</span>
                </td>
                <td className="px-4 py-3 font-semibold text-foreground">
                  {p.subject.name}
                  {p.classIds.length !== group.classes.length && <span className="ml-2 text-xs font-semibold text-foreground-muted">{p.classes.map((c) => c.name).join(", ")} only</span>}
                  <PaperNotes paper={p} />
                </td>
                <td className="px-4 py-3 text-foreground">{p.topic ?? <Dash />}</td>
                <td className="px-4 py-3 text-foreground">{p.maxMarks ?? <Dash />}</td>
                <td className="py-2 pl-2 pr-3">
                  <PaperButtons paper={p} onEdit={onEdit} onRemove={onRemove} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** What the school keeps on a day of a full exam: the hours the school gave the exam, or else from the first paper's start to the last one's end. */
function schoolTime(exam: Pick<Exam, "full" | "schoolHours">, papers: ExamPaper[]): string | null {
  if (!exam.full) return null;
  if (exam.schoolHours) return `School ${clock12(exam.schoolHours.start)} to ${clock12(exam.schoolHours.end)}`;
  const start = papers.map((p) => p.startTime).sort()[0];
  const end = papers.map((p) => p.endTime).sort().reverse()[0];
  return start && end ? `School ${clock12(start)} to ${clock12(end)}` : null;
}

/** One day of "by date": its papers in time order, each with the classes that write it, under the day and the hours of the school that day. */
export function DaySection({ date, papers, exam, onEdit, onRemove }: Actions & { date: string; papers: ExamPaper[]; exam: Pick<Exam, "full" | "schoolHours"> }) {
  const heading = weekdayDay(date, true);
  const hours = schoolTime(exam, papers);
  return (
    <section role="region" aria-label={heading} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-surface-muted/50 px-4 py-3">
        <h3 className="text-base font-bold tracking-tight text-foreground">{heading}</h3>
        {hours && <p className="text-sm font-semibold text-foreground-muted">{hours}</p>}
      </div>
      <ul className="divide-y divide-border">
        {papers.map((p) => (
          <li key={p.id} className="flex items-start gap-4 px-4 py-3">
            <div className="w-40 shrink-0 text-sm">
              <p className="font-semibold text-foreground">{timeText(p)}</p>
              <p className="text-foreground-muted">{durationText(p.durationMinutes)}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-foreground">
                {p.subject.name}
                {p.maxMarks !== null && <span className="ml-2 text-sm font-normal text-foreground-muted">{p.maxMarks} marks</span>}
              </p>
              {p.topic && <p className="text-sm text-foreground">{p.topic}</p>}
              <PaperNotes paper={p} />
              <div className={cn("mt-1.5 flex flex-wrap gap-1.5")}>
                {p.classes.map((c) => (
                  <span key={c.id} className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-deep">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
            <PaperButtons paper={p} onEdit={onEdit} onRemove={onRemove} />
          </li>
        ))}
      </ul>
    </section>
  );
}
