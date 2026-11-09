import { UsersRound } from "lucide-react";
import { useGetAllotmentsQuery } from "../../redux/api/timetableApi";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

/**
 * The teachers of one section (or class without sections) to look at: the class teacher, then each subject with its main teacher, the other
 * teachers and the periods. What `UnitTeachers` is while the year runs; a year that is over is only read, so there is nothing to pick or save.
 */
export function UnitTeachersView({ classId, sectionId, classTeacher }: { classId: string; sectionId: string | null; classTeacher: { id: string; name: string } | null }) {
  const allotments = useGetAllotmentsQuery({ classId, sectionId });
  const rows = allotments.data?.data.rows ?? [];

  return (
    <Card role="region" aria-label="Teachers" className="space-y-4 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
        <UsersRound className="size-5 text-primary" aria-hidden />
        Teachers
      </h2>
      <p className="text-sm">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Class teacher</span>
        <span className="font-semibold text-foreground">{classTeacher?.name ?? "N/A"}</span>
      </p>
      {allotments.isLoading ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-foreground-muted">No subjects</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.subjectId} aria-label={r.subjectName} className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface p-3">
              <span className="font-bold text-foreground">{r.subjectName}</span>
              <span className="text-sm text-foreground">{r.teacherName ?? <span className="text-foreground-muted">No teacher</span>}</span>
              {r.backups.length > 0 && <span className="text-xs text-foreground-muted">{r.backups.map((b) => b.name).join(", ")}</span>}
              <span className="text-xs text-foreground-muted">{`${r.periodsPerWeek} period${r.periodsPerWeek === 1 ? "" : "s"}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
