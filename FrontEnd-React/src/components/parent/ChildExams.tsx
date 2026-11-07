import { GraduationCap } from "lucide-react";
import { useGetChildExamsQuery } from "../../redux/api/parentApi";
import { getApiError } from "../../utils/apiErrors";
import { clock12, durationText, examDays, resultText, weekdayDay } from "../../utils/exams";
import { todayInIndia } from "../../utils/students";
import { STATUS_LOOK } from "../exams/look";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

/**
 * A child's exams for their parent (2026-11-06): each exam of the child's class with its days and the school's hours, the papers (the
 * subject, the topic, the day and time, what it is out of) and, once the marks are in, the child's own marks and percentage in each, with
 * the total. One read for the child (`/parent/children/:id/exams`, which also carries this week's exam days for the timetable).
 */
export function ChildExamsSection({ childId }: { childId: string }) {
  const res = useGetChildExamsQuery(childId);
  const exams = res.data?.data.items;
  const today = todayInIndia();

  return (
    <section aria-label="Exams" className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
        <GraduationCap className="size-5 text-primary" aria-hidden />
        Exams
      </h2>
      {res.isLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : !exams ? (
        <Card className="px-5 py-6 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the exams."}</Card>
      ) : exams.length === 0 ? (
        <Card className="px-5 py-6 text-center text-sm text-foreground-muted">No exam or test yet</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {exams.map((exam) => (
            <article key={exam.id} aria-label={exam.name} className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-surface-muted/50 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold tracking-tight text-foreground">{exam.name}</h3>
                  <p className="text-sm text-foreground-muted">
                    {exam.typeLabel} · {examDays(exam.startDate, exam.endDate)}
                    {exam.schoolHours && ` · School ${clock12(exam.schoolHours.start)} to ${clock12(exam.schoolHours.end)}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {exam.summary && <Badge tone="success">{`Total ${exam.summary.marks} / ${exam.summary.outOf} · ${exam.summary.percent}%`}</Badge>}
                  <Badge tone={STATUS_LOOK[exam.status].tone}>{STATUS_LOOK[exam.status].label}</Badge>
                </div>
              </div>
              {exam.papers.length === 0 ? (
                <p className="px-4 py-4 text-sm text-foreground-muted">Timetable not made yet</p>
              ) : (
                <ul className="divide-y divide-border">
                  {exam.papers.map((p) => {
                    const result = resultText(p, today);
                    return (
                      <li key={p.id} aria-label={`${p.subject.name}, ${weekdayDay(p.date)}`} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-bold text-foreground">
                            {p.subject.name}
                            {p.topic && <span className="ml-2 font-normal text-foreground-muted">{p.topic}</span>}
                          </p>
                          <p className="text-sm text-foreground-muted">
                            {weekdayDay(p.date)} · {clock12(p.startTime)} to {clock12(p.endTime)} · {durationText(p.durationMinutes)}
                            {p.maxMarks !== null && ` · out of ${p.maxMarks}`}
                          </p>
                        </div>
                        {result && <p className={result === "Marks not in yet" ? "text-sm text-foreground-muted" : "text-sm font-bold text-foreground"}>{result}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
