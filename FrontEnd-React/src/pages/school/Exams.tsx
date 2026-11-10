import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CalendarDays, CalendarPlus, ClipboardList, Clock3 } from "lucide-react";
import { useGetExamsQuery } from "../../redux/api/examsApi";
import type { Exam, ExamStatus } from "../../types";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { getApiError } from "../../utils/apiErrors";
import { clock12, examDays } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { ExamDialog } from "../../components/exams/ExamDialog";
import { STATUS_LOOK, classesText, papersText } from "../../components/exams/look";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";

type Show = "all" | ExamStatus;
const SHOWS: { value: Show; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "upcoming", label: "Upcoming" },
  { value: "over", label: "Over" },
];

function ExamCard({ exam: e }: { exam: Exam }) {
  const look = STATUS_LOOK[e.status];
  return (
    <Link
      to={`/school/exams/${e.id}`}
      className="group block rounded-2xl border border-border bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-float focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-primary-deep">{e.typeLabel}</p>
          <h3 className="text-section-heading mt-1 truncate">{e.name}</h3>
        </div>
        <Badge tone={look.tone}>{look.label}</Badge>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-foreground">
        <CalendarDays className="size-4 shrink-0 text-foreground-muted" aria-hidden />
        {examDays(e.startDate, e.endDate)}
      </p>
      {e.full && e.schoolHours && (
        <p className="mt-1.5 flex items-center gap-2 text-sm text-foreground">
          <Clock3 className="size-4 shrink-0 text-foreground-muted" aria-hidden />
          School {clock12(e.schoolHours.start)} to {clock12(e.schoolHours.end)}
        </p>
      )}
      <p className={cn("mt-3 text-sm font-semibold", e.paperCount === 0 ? "text-foreground-muted" : "text-foreground")}>
        {papersText(e.paperCount)}
        {e.paperCount > 0 && <span className="font-normal text-foreground-muted"> · {classesText(e.classCount)}</span>}
      </p>
    </Link>
  );
}

/**
 * Manage school > Test & Exam (`/school/exams`): the year's exams and tests (Half-Yearly, Annual, Unit, Monthly, Class test), the one
 * that is on first, found by whether they have come; a card opens the exam's own page, where its timetable is. One read of the list
 * serves the filter, so choosing a status asks for nothing.
 */
export default function ExamsPage() {
  // A year that is over is only looked at: no Schedule exam (the server refuses it too).
  const readOnly = useReadOnlyYear();
  const navigate = useNavigate();
  const res = useGetExamsQuery();
  const [show, setShow] = useState<Show>("all");
  const [scheduling, setScheduling] = useState(false);
  const items = res.data?.data.items;
  const shown = (items ?? []).filter((e) => show === "all" || e.status === show);
  const schedule = (
    <Button onClick={() => setScheduling(true)}>
      <CalendarPlus className="size-4" aria-hidden />
      Schedule exam
    </Button>
  );

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Test & Exam" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} actions={items && items.length > 0 && !readOnly ? schedule : undefined} />

      {res.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !items ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the exams."}</Card>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-5 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <ClipboardList className="size-6" aria-hidden />
          </span>
          <p className="text-base font-bold text-foreground">No exams or tests yet</p>
          {!readOnly && schedule}
        </Card>
      ) : (
        <>
          <div role="radiogroup" aria-label="Show" className="inline-flex rounded-lg bg-surface-muted p-1">
            {SHOWS.map((s) => (
              <label
                key={s.value}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center rounded-md px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20",
                  show === s.value ? "bg-surface text-primary-deep shadow-sm" : "text-foreground-muted hover:text-foreground"
                )}
              >
                <input type="radio" name="exam-show" className="sr-only" checked={show === s.value} onChange={() => setShow(s.value)} />
                {s.label}
              </label>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-foreground-muted">Nothing here</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((e) => (
                <ExamCard key={e.id} exam={e} />
              ))}
            </div>
          )}
        </>
      )}

      {scheduling && <ExamDialog exam={null} onClose={() => setScheduling(false)} onSaved={(made) => navigate(`/school/exams/${made.id}`)} />}
    </div>
  );
}
