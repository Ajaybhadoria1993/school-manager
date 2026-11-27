import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CalendarPlus, UsersRound } from "lucide-react";
import type { ExamDetail } from "../../types";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { classesOfExam, groupByDate, groupByTimetable, timetableTabOf } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ClassGroupCard, DaySection } from "./PaperViews";

export type TimetableView = "class" | "date";
const VIEWS: { value: TimetableView; label: string }[] = [
  { value: "class", label: "By class" },
  { value: "date", label: "By date" },
];

/**
 * The timetable on an exam's own page, to read (2026-11-27, the user: "add timetable par modal nahi, mera Exam Time Table ka tab khule"; "proper class
 * name, accha visible"): whom the exam is for with how many of its classes have a timetable (a bar) and which do not yet, **Add timetable** (the Exam
 * Time Table tab, on the first class without one), and the papers by class (each card headed by its classes, with Edit timetable) or by date. The
 * timetable is written in the Exam Time Table tab only.
 */
export function ExamTimetable({ exam, initialView = "class" }: { exam: ExamDetail; initialView?: TimetableView }) {
  const readOnly = useReadOnlyYear();
  const navigate = useNavigate();
  const [view, setView] = useState<TimetableView>(initialView);
  const groups = useMemo(() => groupByTimetable(exam.papers), [exam]);
  const days = useMemo(() => groupByDate(exam.papers), [exam]);
  const classes = classesOfExam(exam);
  const notYet = classes.filter((c) => !exam.papers.some((p) => p.classIds.includes(c.id)));
  const done = classes.length - notYet.length;
  const percent = classes.length === 0 ? 0 : Math.round((done / classes.length) * 100);

  return (
    <div className="space-y-4">
      <Card role="region" aria-label="Classes of the exam" className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {exam.audience && (
              <p className="flex items-center gap-2 text-base font-bold text-foreground">
                <UsersRound className="size-5 shrink-0 text-primary" aria-hidden />
                {exam.audience.label}
              </p>
            )}
            {classes.length > 0 && <p className="mt-0.5 text-sm text-foreground-muted">{`${done} of ${classes.length} ${classes.length === 1 ? "class has" : "classes have"} a timetable`}</p>}
          </div>
          {!readOnly && (
            <Button onClick={() => navigate(timetableTabOf(exam.id, notYet[0]?.id ?? classes[0]?.id))}>
              <CalendarPlus className="size-4" aria-hidden />
              Add timetable
            </Button>
          )}
        </div>
        {classes.length > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Classes with a timetable" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
        )}
        {notYet.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground-muted">
            <span className="font-semibold text-foreground">Not yet: </span>
            {notYet.map((c) => (
              <span key={c.id} className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-foreground">
                {c.name}
              </span>
            ))}
          </p>
        )}
      </Card>

      {exam.papers.length === 0 ? (
        <Card className="px-5 py-14 text-center">
          <p className="text-base font-bold text-foreground">No timetable yet</p>
        </Card>
      ) : (
        <>
          <div role="radiogroup" aria-label="View" className="inline-flex rounded-lg bg-surface-muted p-1">
            {VIEWS.map((v) => (
              <label
                key={v.value}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center rounded-md px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20",
                  view === v.value ? "bg-surface text-primary-deep shadow-sm" : "text-foreground-muted hover:text-foreground"
                )}
              >
                <input type="radio" name={`exam-view-${exam.id}`} className="sr-only" checked={view === v.value} onChange={() => setView(v.value)} />
                {v.label}
              </label>
            ))}
          </div>
          <div className="space-y-4">
            {view === "class"
              ? groups.map((g) => <ClassGroupCard key={g.classes.map((c) => c.id).join()} group={g} editTo={timetableTabOf(exam.id, g.classes[0]?.id)} />)
              : days.map((d) => <DaySection key={d.date} date={d.date} papers={d.papers} exam={exam} />)}
          </div>
        </>
      )}
    </div>
  );
}
