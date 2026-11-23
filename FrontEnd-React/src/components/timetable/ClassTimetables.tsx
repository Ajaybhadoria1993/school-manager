import { useRef, useState, type ReactNode } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { Link, useSearchParams } from "react-router";
import { CalendarClock, Clock3, FolderTree, MousePointerClick, Search } from "lucide-react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetGridQuery, useGetOverviewQuery } from "../../redux/api/timetableApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import type { OverviewQuery, OverviewUnit, UnitRef } from "../../types";
import { StudentFormHeader } from "../students/StudentFormHeader";
import { StudentsNotice } from "../students/StudentsNotice";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Skeleton } from "../ui/Skeleton";
import { ClassWeekView } from "../schoolClass/ClassWeekView";
import { ClassWeek } from "./ClassWeek";

const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

type Status = NonNullable<OverviewQuery["status"]>;

/** Where a class's timetable stands, in two or three words, as a small coloured badge (2026-11-22, the reference pictures). */
function StatusText({ unit }: { unit: OverviewUnit }) {
  const pill = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold";
  if (!unit.hasTiming) return <span className={cn(pill, "bg-warning-soft text-warning")}>No timing</span>;
  if (unit.subjects === 0) return <span className={cn(pill, "bg-surface-muted text-foreground-muted")}>No subjects yet</span>;
  if (unit.errors > 0) return <span className={cn(pill, "bg-danger-soft text-danger")}>{unit.errors} to fix</span>;
  if (unit.status === "published") return <span className={cn(pill, "bg-success-soft text-success")}>Published</span>;
  if (unit.status === "draft")
    return (
      <span className={cn(pill, "bg-orange-soft text-orange-hover")}>
        Draft · {unit.filled} of {unit.total}
      </span>
    );
  return <span className={cn(pill, "bg-surface-muted text-foreground-muted")}>Not started</span>;
}

/** The bar under a class in the list: how much of its week has a lesson; green once it is published. */
function UnitBar({ unit }: { unit: OverviewUnit }) {
  const share = unit.total > 0 ? Math.min(100, Math.round((unit.filled / unit.total) * 100)) : 0;
  return (
    <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-surface-muted">
      <span className={cn("block h-full rounded-full", unit.status === "published" ? "bg-success" : "bg-orange")} style={{ width: `${unit.status === "published" ? 100 : share}%` }} />
    </span>
  );
}

const keyOf = (u: { classId: string; sectionId: string | null }) => `${u.classId}:${u.sectionId ?? "none"}`;

/**
 * Class timetables (its own page, `/school/timetable`, no longer a tab): every class or section on the left (searched by the server), and the one
 * picked on the right with its subjects and its week, made right there. The class picked is kept in the address (`?class=&section=`); with none,
 * the first of the list opens. 2026-11-13 (user): the page's title is the class picked, with its year and where its timetable stands beside it
 * (the way back still says Class timetables), and the filter of the list (All / Not started / Draft / Published, with their numbers) is four
 * buttons in one line at the right of the title instead of a dropdown above the list. The title reads the class's week with the same request the
 * workspace makes (one cache entry, so nothing is asked twice).
 */
export function ClassTimetables({ onGoTimings }: { onGoTimings: () => void }) {
  // A year that is over is only looked at: the school's timings are not set from there.
  const readOnly = useReadOnlyYear();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const typed = useDebouncedValue(search.trim(), 300);
  const res = useGetOverviewQuery({ ...(typed ? { search: typed } : {}), status });
  const overview = res.data?.data;
  const detail = useRef<HTMLDivElement>(null);
  // The departments, to put the classes of the list under their department's name (the same read as Classes & Sections: no request of its own).
  const structure = useGetStructureQuery().data?.data;

  const chosen = params.get("class");
  const picked: UnitRef | null = !overview
    ? null
    : chosen
      ? { classId: chosen, sectionId: params.get("section") && params.get("section") !== "none" ? params.get("section") : null }
      : overview.units[0]
        ? { classId: overview.units[0].classId, sectionId: overview.units[0].sectionId }
        : null;
  const week = useGetGridQuery(picked ?? skipToken).currentData?.data;

  const tabs: { value: Status; label: string }[] = overview
    ? [
        { value: "all", label: `All classes · ${overview.summary.units}` },
        { value: "none", label: `Not started · ${overview.summary.none}` },
        { value: "draft", label: `Draft · ${overview.summary.draft}` },
        { value: "published", label: `Published · ${overview.summary.published}` },
      ]
    : [];
  const listed = !!overview && !!overview.academicYear && overview.summary.units > 0 && overview.counts.timings > 0;

  /** The page: the title (the class picked, once its week is read) with the filter at its right, then what the page has to show. */
  const frame = (body: ReactNode) => (
    <div className="space-y-5">
      <StudentFormHeader
        title={picked && week ? week.unit.label : "Class timetables"}
        current="Class timetables"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        subtitle={
          picked && week ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              {week.unit.academicYear.name}
              {week.status === "published" ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>}
            </span>
          ) : undefined
        }
        actions={
          listed ? (
            <div role="radiogroup" aria-label="Which timetables to show" className="inline-flex max-w-full overflow-x-auto rounded-xl border border-border bg-surface p-1 shadow-card">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={status === t.value}
                  onClick={() => setStatus(t.value)}
                  className={cn(
                    "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    status === t.value ? "bg-primary-deep text-white shadow-sm" : "text-foreground-muted hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />
      {body}
    </div>
  );

  if (res.error && !overview) {
    return frame(
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the classes."}</p>
        <Button variant="outline" onClick={() => res.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!overview) {
    return frame(
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]" aria-busy="true">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  if (!overview.academicYear) {
    return frame(
      <StudentsNotice icon={CalendarClock} tone="warning" title="Your school has no running academic year yet" actions={<Link to="/dashboard" className={plainLink}>Go to the dashboard</Link>}>
        <p>Set up the running year on the dashboard first. A timetable belongs to a year.</p>
      </StudentsNotice>
    );
  }
  if (overview.summary.units === 0) {
    return frame(
      <StudentsNotice icon={FolderTree} tone="primary" title="No classes yet" actions={<Link to="/school/classes" className={plainLink}>Add your classes</Link>}>
        <p>A timetable is made for each class (or section). Add your classes first.</p>
      </StudentsNotice>
    );
  }
  if (overview.counts.timings === 0) {
    return frame(
      <StudentsNotice
        icon={Clock3}
        tone="primary"
        title="Set the school timings first"
        actions={
          readOnly ? undefined : (
            <Button onClick={onGoTimings}>
              Set the school timings
            </Button>
          )
        }
      >
        <p>When school starts, how long a period is and the lunch. Then every class gets its periods, and you can make its timetable here.</p>
      </StudentsNotice>
    );
  }

  /** The department a class is in, by name; null for a class in none (or a school with no departments). */
  function departmentOf(classId: string): string | null {
    const departmentId = structure?.classes.find((c) => c.id === classId)?.departmentId;
    return departmentId ? (structure?.departments.find((d) => d.id === departmentId)?.name ?? null) : null;
  }

  function pick(unit: OverviewUnit) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("class", unit.classId);
      next.set("section", unit.sectionId ?? "none");
      return next;
    });
    // On a phone the week opens below the list: bring it into view.
    if (window.matchMedia?.("(max-width: 1023px)").matches) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return frame(
    <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Card className="overflow-hidden">
        <div className="border-b border-border p-3">
          <Input aria-label="Search classes" icon={Search} placeholder="Search a class" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {overview.units.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-foreground-muted">No class matches.</p>
        ) : (
          <ul aria-label="Classes" className="max-h-[32rem] space-y-1 overflow-y-auto p-2 lg:max-h-[70vh]">
            {overview.units.map((u, i) => {
              const selected = picked !== null && keyOf(u) === keyOf(picked);
              // A department's name over its first class (the list is in teaching order, so its classes are together).
              const group = departmentOf(u.classId);
              const heading = group && (i === 0 || departmentOf(overview.units[i - 1].classId) !== group) ? group : null;
              return (
                <li key={keyOf(u)}>
                  {heading && <p className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-foreground-muted first:pt-1">{heading}</p>}
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => pick(u)}
                    className={cn(
                      "relative flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                      selected ? "border-orange bg-orange-soft/40 shadow-sm" : "border-transparent hover:bg-background"
                    )}
                  >
                    {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-orange" />}
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-foreground">{u.label}</span>
                      <StatusText unit={u} />
                    </span>
                    <UnitBar unit={u} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div ref={detail} className="min-w-0 scroll-mt-4">
        {picked && readOnly ? (
          // A year that is over is only looked at (2026-11-22): its week as it was, nothing to change (the editor, Fill and Save are not offered).
          week ? (
            <Card className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Badge tone="warning">Read only</Badge>
                {week.unit.label}
              </p>
              <ClassWeekView view={week} label={week.unit.label} />
            </Card>
          ) : (
            <Skeleton className="h-80 w-full rounded-2xl" />
          )
        ) : picked ? (
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
