import { Link, useParams, useSearchParams } from "react-router";
import { BookOpen, CalendarClock, Clock3, FolderTree, ListOrdered, Pencil, UserRound } from "lucide-react";
import { useGetClassOverviewQuery } from "../../redux/api/studentsApi";
import { useGetGridQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { timingGroups, unitPath } from "../../utils/timetable";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { ClassWeekView } from "../../components/schoolClass/ClassWeekView";
import { UnitTeachers } from "../../components/schoolClass/UnitTeachers";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";

const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * A class's Timetable & teachers (`/school-class/:classId/timetable`, from its School Class page): only this class, or one section of it
 * (`?section=`; a class with sections opens on its first one and switches with the section links). Four numbers (its class teacher or
 * N/A, its subjects, their periods a week, its school day), its teachers (the class teacher and each subject's teacher, picked here and
 * saved at once: it is the timetable's own list), its week as it is placed (to look at: Edit timetable opens the timetable on this class)
 * and its timing, kind of day by kind of day. One read for the week (`/timetable/grid`), besides what the class page already read.
 */
export default function SchoolClassTimetablePage() {
  const { classId = "" } = useParams();
  const [params] = useSearchParams();
  const overviewRes = useGetClassOverviewQuery({ classId });
  const overview = overviewRes.data?.data.classes[0];
  const hasSections = (overview?.sections.length ?? 0) > 0;
  const section = hasSections ? (overview!.sections.find((s) => s.id === params.get("section")) ?? overview!.sections[0]) : undefined;
  const unit = { classId, sectionId: section?.id ?? null };
  const gridRes = useGetGridQuery(unit, { skip: !overview });
  const grid = gridRes.data?.data;

  if (overviewRes.error && !overview) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">{getApiError(overviewRes.error)?.message ?? "Could not load the class."}</p>
        <Button variant="outline" onClick={() => overviewRes.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!overview) {
    if (overviewRes.data) {
      return (
        <StudentsNotice
          icon={FolderTree}
          tone="navy"
          title="This class is not in your school"
          actions={
            <Link to="/school-class" className={outlineLink}>
              Back to School Class
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const label = section ? `${overview.name} - ${section.name}` : overview.name;
  const headTeacher = section ? section.classTeacher : overview.classTeacher;
  const groups = grid ? timingGroups(grid.days) : [];
  const main = groups.reduce<(typeof groups)[number] | undefined>((best, g) => (!best || g.periods > best.periods ? g : best), undefined);
  const periodsAWeek = grid ? grid.allotments.reduce((sum, a) => sum + a.periodsPerWeek, 0) : null;

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title={label}
        current="Timetable & teachers"
        crumbs={[
          { label: "School Class", to: "/school-class" },
          { label: overview.name, to: `/school-class/${classId}${section ? `?section=${section.id}` : ""}` },
        ]}
        actions={
          <Link to={unitPath(unit)} className={outlineLink}>
            <Pencil className="size-4" aria-hidden />
            Edit timetable
          </Link>
        }
      />

      {hasSections && (
        <nav aria-label={`Sections of ${overview.name}`} className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
          {overview.sections.map((s) => (
            <Link
              key={s.id}
              to={`/school-class/${classId}/timetable?section=${s.id}`}
              replace
              aria-current={s.id === section?.id ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-lg px-4 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                s.id === section?.id ? "bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.45)]" : "text-foreground-muted hover:bg-surface hover:text-foreground"
              )}
            >
              Section {s.name}
            </Link>
          ))}
        </nav>
      )}

      {/* One to a line on a phone: a name and a time need the width. */}
      <section aria-label={`About ${label}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Class teacher" value={headTeacher?.name ?? "N/A"} icon={UserRound} tone={headTeacher ? "primary" : "navy"} />
        <StatTile label="Subjects" value={grid ? grid.allotments.length : null} icon={BookOpen} tone="success" />
        <StatTile label="Periods a week" value={periodsAWeek} icon={ListOrdered} tone="info" />
        <StatTile label="School day" value={grid ? (main ? `${main.start} to ${main.end}` : "Not set") : null} icon={Clock3} tone="warning" />
      </section>

      <UnitTeachers key={`${classId}-${section?.id ?? "class"}`} classId={classId} sectionId={section?.id ?? null} label={label} classTeacher={headTeacher} />

      {gridRes.error && !grid ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-danger">{getApiError(gridRes.error)?.message ?? "Could not load the timetable."}</p>
          <Button variant="outline" onClick={() => gridRes.refetch()}>
            Try again
          </Button>
        </Card>
      ) : !grid ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : grid.days.length === 0 ? (
        <StudentsNotice
          icon={CalendarClock}
          tone="warning"
          title="No school timing yet"
          actions={
            <Link to="/school/timetable?tab=timings" className={outlineLink}>
              Set the school timing
            </Link>
          }
        />
      ) : (
        <>
          <section aria-label="Week" className="space-y-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-foreground">Week</h2>
              {grid.exists ? <Badge tone={grid.status === "published" ? "success" : "warning"}>{grid.status === "published" ? "Published" : "Draft"}</Badge> : <Badge>Not made yet</Badge>}
            </div>
            <ClassWeekView view={grid} label={label} />
          </section>

          <Card role="region" aria-label="Timing" className="space-y-2 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
              <Clock3 className="size-5 text-primary" aria-hidden />
              Timing
            </h2>
            <ul className="divide-y divide-border/70">
              {groups.map((g) => (
                <li key={g.days} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="min-w-40 font-semibold text-foreground">{g.days}</span>
                  <span className="text-foreground">
                    {g.start} to {g.end}
                  </span>
                  <span className="text-foreground-muted">{`${g.periods} period${g.periods === 1 ? "" : "s"}`}</span>
                  {g.breaks.map((b) => (
                    <span key={b} className="text-foreground-muted">
                      {b}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
