import { useState } from "react";
import { BookOpenText, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { useGetChildDiaryQuery, useGetChildTestsQuery } from "../../redux/api/parentApi";
import { addDays, shortDay } from "../../utils/calendar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

/**
 * The child's class diary, for their parent (docs/parent-teacher-flow.md phase 4): a day's homework and what was taught, subject by subject
 * (today to start with; the arrows go a day back or forward).
 */
export function ChildDiary({ childId }: { childId: string }) {
  const [date, setDate] = useState<string | undefined>(undefined);
  const res = useGetChildDiaryQuery({ id: childId, date });
  const diary = res.data?.data;
  const shown = date ?? diary?.date;

  return (
    <section aria-label="Diary" className="space-y-3">
      <h2 className="text-section-heading flex items-center gap-2">
        <BookOpenText className="size-5 text-primary" aria-hidden />
        Diary
      </h2>
      {res.isLoading || !diary ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : (
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" aria-label="Day before" onClick={() => shown && setDate(addDays(shown, -1))}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <p className="text-sm font-bold text-foreground">{shown ? shortDay(shown) : ""}</p>
            <Button variant="ghost" size="sm" aria-label="Day after" onClick={() => shown && setDate(addDays(shown, 1))}>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
          {diary.entries.length === 0 ? (
            <p className="text-center text-sm text-foreground-muted">Nothing written for this day</p>
          ) : (
            <ul className="divide-y divide-border">
              {diary.entries.map((e) => (
                <li key={e.subjectName} className="space-y-1 py-2.5">
                  <p className="font-bold text-foreground">{e.subjectName}</p>
                  {e.taught && (
                    <p className="text-sm text-foreground">
                      <span className="font-semibold text-foreground-muted">Taught: </span>
                      {e.taught}
                    </p>
                  )}
                  {e.homework && (
                    <p className="text-sm text-foreground">
                      <span className="font-semibold text-foreground-muted">Homework: </span>
                      {e.homework}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </section>
  );
}

/**
 * The child's tests, for their parent (docs/parent-teacher-flow.md phase 5): the coming ones, then each result with the marks and the
 * percentage (absent said so), and the average of the results (their performance).
 */
export function ChildTests({ childId }: { childId: string }) {
  const res = useGetChildTestsQuery(childId);
  const data = res.data?.data;

  return (
    <section aria-label="Tests and marks" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section-heading flex items-center gap-2">
          <ClipboardList className="size-5 text-primary" aria-hidden />
          Tests and marks
        </h2>
        {data?.average != null && <p className="rounded-full bg-success-soft px-3 py-1 text-sm font-bold text-success">Average {data.average}%</p>}
      </div>
      {res.isLoading || !data ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : data.upcoming.length === 0 && data.results.length === 0 ? (
        <Card className="px-5 py-6 text-center text-sm text-foreground-muted">No test yet</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-2 p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-foreground-muted">Coming</h3>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-foreground-muted">No test coming</p>
            ) : (
              <ul aria-label="Coming tests" className="divide-y divide-border">
                {data.upcoming.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-semibold text-foreground">
                      {t.subjectName}: {t.topic}
                    </span>
                    <span className="text-foreground-muted">
                      {shortDay(t.date)} · out of {t.maxMarks}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="overflow-x-auto p-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-foreground-muted">Results</h3>
            {data.results.length === 0 ? (
              <p className="text-sm text-foreground-muted">No marks yet</p>
            ) : (
              <table aria-label="Results" className="w-full text-sm">
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.id} className="border-t border-border first:border-t-0">
                      <td className="py-2 pr-2">
                        <span className="block font-semibold text-foreground">{r.subjectName}</span>
                        <span className="text-xs text-foreground-muted">
                          {r.topic} · {shortDay(r.date)}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold text-foreground">{r.absent ? "Absent" : `${r.marks} / ${r.maxMarks}`}</td>
                      <td className="py-2 text-right font-bold text-foreground">{r.percent === null ? "-" : `${r.percent}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
