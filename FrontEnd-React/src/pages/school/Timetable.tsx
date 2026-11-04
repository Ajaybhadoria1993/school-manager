import { useSearchParams } from "react-router";
import { CalendarDays, Clock3 } from "lucide-react";
import { useGetOverviewQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ClassTimetablesTab } from "../../components/timetable/ClassTimetablesTab";
import { SchoolTimingsTab } from "../../components/timetable/SchoolTimingsTab";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";

type Tab = "timings" | "classes";
const TABS: { value: Tab; label: string; icon: typeof Clock3 }[] = [
  { value: "timings", label: "School timings", icon: Clock3 },
  { value: "classes", label: "Class timetables", icon: CalendarDays },
];

/**
 * Manage school > Timetable (`/school/timetable`): everything in one place, in two tabs. **School timings**: the usual school day (when it
 * starts, how long a period is, the lunch) and what each day of the week does. **Class timetables**: every class on the left, the one picked on
 * the right with its subjects and its week. The tab and the class are kept in the address (`?tab=classes&class=&section=`). A school with no
 * timing yet opens on School timings; otherwise on Class timetables. The two tabs are in the header, at the right of the title (2026-11-03: the
 * Subjects and Teachers buttons that were there are gone: a subject is added where it is used, in the box of a period; their pages are still
 * at `/school/timetable/subjects` and `/teachers`).
 */
export default function TimetablePage() {
  const [params, setParams] = useSearchParams();
  // The same read the class list starts with (same arguments), so it is asked once.
  const res = useGetOverviewQuery({ status: "all" });
  const overview = res.data?.data;
  const asked = params.get("tab");
  const tab: Tab = asked === "timings" || asked === "classes" ? asked : overview && overview.counts.timings === 0 ? "timings" : "classes";

  const go = (next: Tab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", next);
      return p;
    });

  return (
    <div className="space-y-5">
      <StudentFormHeader
        title="Timetable"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        actions={
          overview ? (
            <div role="tablist" aria-label="Timetable" className="inline-flex gap-1 rounded-xl bg-surface-muted p-1">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  onClick={() => go(t.value)}
                  className={cn(
                    "inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                    tab === t.value ? "bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.45)]" : "text-foreground-muted hover:bg-surface hover:text-foreground"
                  )}
                >
                  <t.icon className="size-4" aria-hidden />
                  {t.label}
                </button>
              ))}
            </div>
          ) : res.error ? undefined : (
            <Skeleton className="h-12 w-72 rounded-xl" />
          )
        }
      />

      {res.error && !overview ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the timetable."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>
            Try again
          </Button>
        </Card>
      ) : !overview ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)!.label}>
          {tab === "timings" ? <SchoolTimingsTab onNext={() => go("classes")} /> : <ClassTimetablesTab onGoTimings={() => go("timings")} />}
        </div>
      )}
    </div>
  );
}
