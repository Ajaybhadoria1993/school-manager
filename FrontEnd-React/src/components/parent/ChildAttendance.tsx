import { useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight } from "lucide-react";
import { useGetChildAttendanceQuery } from "../../redux/api/parentApi";
import { monthTitle, shortDay } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import type { AttendanceStatus } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

const LOOK: Record<AttendanceStatus, { label: string; chip: string }> = {
  present: { label: "Present", chip: "bg-success-soft text-success" },
  absent: { label: "Absent", chip: "bg-danger-soft text-danger" },
  late: { label: "Late", chip: "bg-warning-soft text-warning" },
  leave: { label: "Leave", chip: "bg-info-soft text-info" },
};

const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * The child's attendance, for their parent (docs/parent-teacher-flow.md phase 3): the year's percentage (late counts as there) and its
 * counts, and the days of a month with their marks; the arrows go to the month before or after.
 */
export function ChildAttendance({ childId }: { childId: string }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const res = useGetChildAttendanceQuery({ id: childId, month });
  const data = res.data?.data;
  const shown = month ?? data?.month;

  return (
    <section aria-label="Attendance" className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
        <CalendarCheck2 className="size-5 text-primary" aria-hidden />
        Attendance
      </h2>
      {res.isLoading || !data ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-4xl font-extrabold tracking-tight text-foreground">{data.year.percent === null ? "-" : `${data.year.percent}%`}</p>
            <p className="text-sm text-foreground-muted">
              This year: {data.year.present} present · {data.year.absent} absent · {data.year.late} late · {data.year.leave} on leave
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" aria-label="Month before" onClick={() => shown && setMonth(shiftMonth(shown, -1))}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <p className="text-sm font-bold text-foreground">{shown ? monthTitle(shown) : ""}</p>
            <Button variant="ghost" size="sm" aria-label="Month after" onClick={() => shown && setMonth(shiftMonth(shown, 1))}>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
          {data.days.length === 0 ? (
            <p className="text-center text-sm text-foreground-muted">No attendance taken this month yet</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {data.days.map((d) => (
                <li key={d.date} aria-label={shortDay(d.date)} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-bold", LOOK[d.status].chip)}>
                  <span className="block">{shortDay(d.date)}</span>
                  <span className="block font-semibold opacity-80">{LOOK[d.status].label}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </section>
  );
}
