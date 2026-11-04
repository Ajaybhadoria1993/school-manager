import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CalendarClock, Clock3, FolderTree, MousePointerClick, Search } from "lucide-react";
import { useGetOverviewQuery } from "../../redux/api/timetableApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import type { OverviewQuery, OverviewUnit, UnitRef } from "../../types";
import { StudentsNotice } from "../students/StudentsNotice";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { ClassWeek } from "./ClassWeek";

const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

type Status = NonNullable<OverviewQuery["status"]>;

/** Where a class's timetable stands, in two or three words, coloured. */
function StatusText({ unit }: { unit: OverviewUnit }) {
  if (!unit.hasTiming) return <span className="text-warning">No timing</span>;
  if (unit.subjects === 0) return <span className="text-foreground-muted">No subjects yet</span>;
  if (unit.errors > 0) return <span className="font-semibold text-danger">{unit.errors} to fix</span>;
  if (unit.status === "published") return <span className="font-semibold text-success">Published</span>;
  if (unit.status === "draft") return <span className="text-warning">Draft · {unit.filled} of {unit.total}</span>;
  return <span className="text-foreground-muted">Not started</span>;
}

const keyOf = (u: { classId: string; sectionId: string | null }) => `${u.classId}:${u.sectionId ?? "none"}`;

/**
 * Timetable > Class timetables: every class or section on the left (searched and filtered by the server), and the one picked on the right
 * with its subjects and its week, made right there. The class picked is kept in the address (`?class=&section=`); with none, the first of
 * the list opens.
 */
export function ClassTimetablesTab({ onGoTimings }: { onGoTimings: () => void }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const typed = useDebouncedValue(search.trim(), 300);
  const res = useGetOverviewQuery({ ...(typed ? { search: typed } : {}), status });
  const overview = res.data?.data;
  const detail = useRef<HTMLDivElement>(null);

  if (res.error && !overview) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the classes."}</p>
        <Button variant="outline" onClick={() => res.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!overview) {
    return (
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]" aria-busy="true">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  if (!overview.academicYear) {
    return (
      <StudentsNotice icon={CalendarClock} tone="warning" title="Your school has no running academic year yet" actions={<Link to="/dashboard" className={plainLink}>Go to the dashboard</Link>}>
        <p>Set up the running year on the dashboard first. A timetable belongs to a year.</p>
      </StudentsNotice>
    );
  }
  if (overview.summary.units === 0) {
    return (
      <StudentsNotice icon={FolderTree} tone="primary" title="No classes yet" actions={<Link to="/school/classes" className={plainLink}>Add your classes</Link>}>
        <p>A timetable is made for each class (or section). Add your classes first.</p>
      </StudentsNotice>
    );
  }
  if (overview.counts.timings === 0) {
    return (
      <StudentsNotice
        icon={Clock3}
        tone="primary"
        title="Set the school timings first"
        actions={
          <Button onClick={onGoTimings}>
            Set the school timings
          </Button>
        }
      >
        <p>When school starts, how long a period is and the lunch. Then every class gets its periods, and you can make its timetable here.</p>
      </StudentsNotice>
    );
  }

  const chosen = params.get("class") ? `${params.get("class")}:${params.get("section") ?? "none"}` : null;
  const picked: UnitRef | null = chosen
    ? { classId: params.get("class")!, sectionId: params.get("section") && params.get("section") !== "none" ? params.get("section") : null }
    : overview.units[0]
      ? { classId: overview.units[0].classId, sectionId: overview.units[0].sectionId }
      : null;

  function pick(unit: OverviewUnit) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "classes");
      next.set("class", unit.classId);
      next.set("section", unit.sectionId ?? "none");
      return next;
    });
    // On a phone the week opens below the list: bring it into view.
    if (window.matchMedia?.("(max-width: 1023px)").matches) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tabs: { value: Status; label: string }[] = [
    { value: "all", label: `All classes (${overview.summary.units})` },
    { value: "none", label: `Not started (${overview.summary.none})` },
    { value: "draft", label: `Draft (${overview.summary.draft})` },
    { value: "published", label: `Published (${overview.summary.published})` },
  ];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Card className="overflow-hidden">
        <div className="space-y-2 border-b border-border p-3">
          <Input aria-label="Search classes" icon={Search} placeholder="Search a class" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select aria-label="Which timetables to show" value={status} options={tabs} onChange={(v) => setStatus(v as Status)} />
        </div>
        {overview.units.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-foreground-muted">No class matches.</p>
        ) : (
          <ul aria-label="Classes" className="max-h-[32rem] divide-y divide-border overflow-y-auto lg:max-h-[70vh]">
            {overview.units.map((u) => {
              const selected = picked !== null && keyOf(u) === keyOf(picked);
              return (
                <li key={keyOf(u)}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => pick(u)}
                    className={cn(
                      "relative flex w-full cursor-pointer flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                      selected ? "bg-primary-soft/70" : "hover:bg-background"
                    )}
                  >
                    {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-primary" />}
                    <span className="text-sm font-bold text-foreground">{u.label}</span>
                    <span className="text-xs">
                      <StatusText unit={u} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div ref={detail} className="min-w-0 scroll-mt-4">
        {picked ? (
          <ClassWeek key={keyOf(picked)} unit={picked} onGoTimings={onGoTimings} />
        ) : (
          <Card className="flex flex-col items-center gap-2 px-6 py-20 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <MousePointerClick className="size-6" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-foreground">Pick a class from the list</p>
          </Card>
        )}
      </div>
    </div>
  );
}
