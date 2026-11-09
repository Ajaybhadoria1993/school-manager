import { Link, useParams } from "react-router";
import { Printer } from "lucide-react";
import { DAY_NAMES } from "../../constants/timetable";
import { useGetTeacherWeekQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";

/**
 * Manage school > Timetable > Teachers > one teacher's week (`/school/timetable/teacher/:teacherId`): every lesson they have in every
 * class, by day and time, and what they were given. A lesson of a timetable that is not published yet is marked as a draft.
 */
export default function TimetableTeacherWeekPage() {
  const { teacherId = "" } = useParams();
  const res = useGetTeacherWeekQuery(teacherId);
  const week = res.currentData?.data;
  const crumbs = [{ label: "Dashboard", to: "/dashboard" }, { label: "Timetable", to: "/school/timetable" }, { label: "Teachers", to: "/school/teachers" }];

  if (res.error && !week) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Teacher" crumbs={crumbs} />
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load this teacher's week."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>Try again</Button>
        </Card>
      </div>
    );
  }
  if (!week) return <Skeleton className="h-96 rounded-2xl" aria-busy="true" />;

  const { teacher } = week;
  // Monday to Saturday always; Sunday only when someone has a lesson then.
  const days = [1, 2, 3, 4, 5, 6, ...(week.lessons.some((l) => l.day === 7) ? [7] : [])];
  const over = (day: number) => teacher.maxPerDay !== null && (week.perDay[String(day)] ?? 0) > teacher.maxPerDay;

  return (
    <div className="space-y-5">
      <StudentFormHeader
        title={`${teacher.name}'s week`}
        subtitle={`${week.week} period${week.week === 1 ? "" : "s"} this week${teacher.maxPerWeek !== null ? ` (the most is ${teacher.maxPerWeek})` : ""}`}
        crumbs={crumbs}
        current={teacher.name}
        actions={
          <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            Print
          </Button>
        }
      />
      {!teacher.isActive && <p className="rounded-xl bg-warning-soft px-4 py-2.5 text-sm font-medium text-warning">{teacher.name} has left. These are the lessons that were theirs.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="The week by day">
        {days.map((day) => {
          const lessons = week.lessons.filter((l) => l.day === day);
          const off = teacher.offDays.includes(day);
          return (
            <Card key={day} className={cn("space-y-2 p-3", off && "bg-surface-muted")}>
              <h2 className="flex items-center justify-between text-sm font-bold text-foreground">
                {DAY_NAMES[day]}
                <span className={cn("text-xs font-semibold", over(day) ? "text-warning" : "text-foreground-muted")}>{lessons.length}</span>
              </h2>
              {off ? (
                <p className="text-xs text-foreground-muted">Does not come</p>
              ) : lessons.length === 0 ? (
                <p className="text-xs text-foreground-muted">Free</p>
              ) : (
                <ul className="space-y-1.5">
                  {lessons.map((l) => (
                    <li key={`${l.classId}:${l.sectionId}:${l.day}:${l.period}`} className={cn("rounded-lg border px-2 py-1.5 text-xs", l.published ? "border-border bg-surface" : "border-dashed border-warning-line bg-warning-soft/50")}>
                      <p className="font-bold text-foreground">{l.start} to {l.end}</p>
                      <p className="text-foreground">{l.label} · {l.subjectName}</p>
                      {l.room && <p className="text-foreground-muted">{l.room}</p>}
                      {!l.published && <p className="font-semibold text-warning">Draft</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-bold text-foreground">What they teach this year</h2>
        {week.teaches.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            Nothing is given to them yet. Choose them as the teacher of a subject in a class's <Link to="/school/timetable?tab=classes" className="font-semibold text-primary-deep underline">timetable</Link> (Edit subjects).
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {week.teaches.map((t) => (
              <li key={`${t.classId}:${t.sectionId}:${t.subjectId}`}>
                <Badge tone="primary">{t.label} · {t.subjectName} · {t.periodsPerWeek} a week</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
