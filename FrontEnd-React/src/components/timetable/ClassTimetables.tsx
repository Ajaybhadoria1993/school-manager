import { useRef, useState, type ReactNode } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { Link, useSearchParams } from "react-router";
import { Popover } from "@heroui/react";
import { BookOpen, CalendarClock, CalendarDays, Check, ChevronDown, Clock3, FolderTree, GraduationCap, Search, Settings, UsersRound } from "lucide-react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetGridQuery, useGetOverviewQuery } from "../../redux/api/timetableApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { getApiError } from "../../utils/apiErrors";
import { isArrival } from "../../utils/timings";
import { cn } from "../../utils/helpers";
import type { ClassWeekStatus, ClassWeekTab, GridView, OverviewUnit, UnitRef } from "../../types";
import { StudentFormHeader } from "../students/StudentFormHeader";
import { StudentsNotice } from "../students/StudentsNotice";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ControlIcon, Input, controlClass, controlHeight, iconPadding, useControlStyle } from "../ui/Input";
import { PageTabs } from "../ui/PageTabs";
import { TabPanel } from "../ui/TabPanel";
import { Skeleton } from "../ui/Skeleton";
import { ClassWeekView } from "../schoolClass/ClassWeekView";
import { FigureTile } from "./TimingParts";
import { ClassWeek } from "./ClassWeek";

const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/** The tabs over the class's week (2026-11-23, the reference picture; Subject Teachers was taken away the same day). */
const WEEK_TABS: { id: ClassWeekTab; label: string; icon: typeof Clock3 }[] = [
  { id: "timetable", label: "Class Timetable", icon: CalendarDays },
  { id: "settings", label: "Class Settings", icon: Settings },
];

const keyOf = (u: { classId: string; sectionId: string | null }) => `${u.classId}:${u.sectionId ?? "none"}`;

/**
 * Whether a class is ready (2026-11-23, user: "class mein subject aur teacher assign hai to Active, nahi to Inactive"): Active once it has subjects and
 * every one of them has a teacher; Inactive otherwise, with why in its title.
 */
function ActiveText({ unit }: { unit: OverviewUnit }) {
  const active = unit.subjects > 0 && unit.withoutTeacher === 0;
  const why = unit.subjects === 0 ? "No subjects yet" : `${unit.withoutTeacher} ${unit.withoutTeacher === 1 ? "subject has" : "subjects have"} no teacher`;
  return (
    <span title={active ? undefined : why} className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold", active ? "bg-success-soft text-success" : "bg-surface-muted text-foreground-muted")}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}


/**
 * The class picked, as a box that opens the list of classes (2026-11-23, the second reference picture: no list beside the week): the search (the server
 * searches, after the typing stops), the classes under their department's name, each with Active or Inactive and a tick on the one picked.
 */
function ClassPicker({
  week,
  units,
  picked,
  search,
  onSearch,
  departmentOf,
  onPick,
}: {
  week: GridView | undefined;
  units: OverviewUnit[];
  picked: UnitRef | null;
  search: string;
  onSearch: (text: string) => void;
  departmentOf: (classId: string) => string | null;
  onPick: (unit: OverviewUnit) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const style = useControlStyle();
  const label = week?.unit.label ?? units.find((u) => picked && keyOf(u) === keyOf(picked))?.label ?? "Choose a class";
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Choose the class"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          controlClass(style),
          controlHeight(style),
          iconPadding(style),
          "relative flex w-full cursor-pointer items-center justify-between gap-2 py-0 pr-3 text-left text-sm font-semibold text-foreground",
          open && "border-primary ring-4 ring-primary/15"
        )}
      >
        <ControlIcon icon={GraduationCap} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-foreground-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <Popover.Content isOpen onOpenChange={(next) => !next && setOpen(false)} triggerRef={trigger} placement="bottom start" offset={6} className="w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surface p-0 shadow-float">
          <Popover.Dialog aria-label="Choose the class" className="outline-none">
            <div className="border-b border-border p-2.5">
              <Input aria-label="Search classes" icon={Search} placeholder="Search a class" value={search} onChange={(e) => onSearch(e.target.value)} autoFocus />
            </div>
            {units.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-foreground-muted">No class matches.</p>
            ) : (
              <ul aria-label="Classes" className="max-h-80 overflow-y-auto py-1">
                {units.map((u, i) => {
                  const selected = picked !== null && keyOf(u) === keyOf(picked);
                  // A department's name over its first class (the list is in teaching order, so its classes are together).
                  const group = departmentOf(u.classId);
                  const heading = group && (i === 0 || departmentOf(units[i - 1].classId) !== group) ? group : null;
                  return (
                    <li key={keyOf(u)}>
                      {heading && <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-foreground-muted">{heading}</p>}
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => {
                          onPick(u);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                          selected ? "bg-primary-soft/70" : "hover:bg-background"
                        )}
                      >
                        <span className={cn("min-w-0 break-words text-sm font-semibold", selected ? "text-primary-deep" : "text-foreground")}>{u.label}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <ActiveText unit={u} />
                          {selected && <Check className="size-4 text-primary" aria-hidden />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Popover.Dialog>
        </Popover.Content>
      )}
    </>
  );
}

const SHORT_DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Four cards of the class's week on top (2026-11-23, user: "upar normal card rakho, zyada data show ho, 4 cards"): how many periods it has, its subjects
 * (and how many have no teacher), its **School time** (first row to last, which days) and its **Class time** (first period to last, with what comes before
 * it: "Arrival 08:00–08:05 · Assembly 08:05–08:20", as on the School timings page). The lunch is not here any more (it is in the week).
 */
function ClassHeader({ week, live }: { week: GridView | undefined; live: ClassWeekStatus | null }) {
  const days = week ? week.days.filter((d) => d.slots.some((x) => x.period !== null)) : [];
  const starts = days.map((d) => d.slots[0]?.start).filter((x): x is string => Boolean(x)).sort();
  const ends = days.map((d) => d.slots[d.slots.length - 1]?.end).filter((x): x is string => Boolean(x)).sort();
  // When the first period starts, and what comes before it (the time to come in, the assembly), from the day with the earliest start.
  const first = days.find((d) => d.slots[0]?.start === starts[0]);
  const firstPeriod = first?.slots.find((x) => x.period !== null);
  const classStart = days.map((d) => d.slots.find((x) => x.period !== null)?.start).filter((x): x is string => Boolean(x)).sort()[0];
  const before = first && firstPeriod ? first.slots.slice(0, first.slots.indexOf(firstPeriod)) : [];
  const between = before.map((x) => `${isArrival(x) ? "Arrival" : x.label || "Break"} ${x.start}–${x.end}`).join(" · ");
  const perDay = Math.max(0, ...days.map((d) => d.slots.filter((x) => x.period !== null).length));
  // The subjects of the week on screen when it says them (with the ones put in, not saved yet), else the class's saved list.
  const subjects = live?.subjects ?? week?.allotments.length ?? 0;
  const untaught = live?.withoutTeacher ?? (week ? week.allotments.filter((a) => !a.teacherId).length : 0);
  const dayRange = days.length === 0 ? "No school day" : days.length === 1 ? SHORT_DAYS[days[0].day] : `${SHORT_DAYS[days[0].day]} to ${SHORT_DAYS[days[days.length - 1].day]}`;
  return (
    <section aria-label="The class" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.5fr)]">
      {/* The class's name is the heading of the page's work (the box in the line of the tabs shows it, and opens the list). */}
      {week && <h2 className="sr-only">{week.unit.label}</h2>}
      {/* Words, not numbers: a card counts a number up, and these change with each class. */}
      {/* How many have a lesson (2026-11-23: it was the line over the week), as the week is changed: from the week on screen. */}
      <FigureTile
        label="Total periods"
        value={week ? String(week.stats.total) : null}
        hint={!week ? "" : live ? `${live.filled} filled · ${Math.max(0, live.total - live.filled)} empty` : `${days.length} ${days.length === 1 ? "day" : "days"} · up to ${perDay} a day`}
        icon={CalendarDays}
        tone="primary"
      />
      <FigureTile label="Subjects" value={week ? String(subjects) : null} hint={!week ? "" : subjects === 0 ? "None set yet" : untaught === 0 ? "All have a teacher" : `${untaught} without a teacher`} icon={BookOpen} tone="success" />
      <FigureTile label="School time" value={starts.length > 0 ? `${starts[0]} – ${ends[ends.length - 1]}` : null} hint={starts.length > 0 ? dayRange : ""} icon={Clock3} tone="info" />
      <FigureTile label="Class time" value={classStart ? `${classStart} – ${ends[ends.length - 1]}` : null} hint={classStart ? between || "From when school starts" : ""} icon={UsersRound} tone="primary" />
    </section>
  );
}

/**
 * Class timetables (its own page, `/school/timetable`). 2026-11-23, the second reference picture: the class is chosen in the box on top (the list opens
 * under it, searched by the server), beside it three cards of its week; then the tabs **Class Timetable** (the week, made right there) and **Class
 * Settings** (periods & time, the class teacher, copy to other sections), with the filter of the classes (where their timetables stand) at their right;
 * the week takes the whole width. The class picked and the tab are kept in the address (`?class=&section=&tab=`); with no class, the first opens.
 * While another class's week is read, the one shown stays (faded) and is swapped when the new one is there: no empty page between two classes.
 */
export function ClassTimetables({ onGoTimings }: { onGoTimings: () => void }) {
  // A year that is over is only looked at: the school's timings are not set from there.
  const readOnly = useReadOnlyYear();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const typed = useDebouncedValue(search.trim(), 300);
  const res = useGetOverviewQuery({ ...(typed ? { search: typed } : {}), status: "all" });
  const overview = res.data?.data;
  // The departments, to put the classes of the list under their department's name (the same read as Classes & Sections: no request of its own).
  const structure = useGetStructureQuery().data?.data;

  const chosen = params.get("class");
  // With no class in the address, the first class of the list as it was first read: a search or a filter in the box does not change the class shown.
  const [firstUnit, setFirstUnit] = useState<UnitRef | null>(null);
  if (!firstUnit && overview?.units[0]) setFirstUnit({ classId: overview.units[0].classId, sectionId: overview.units[0].sectionId });
  const picked: UnitRef | null = !overview
    ? null
    : chosen
      ? { classId: chosen, sectionId: params.get("section") && params.get("section") !== "none" ? params.get("section") : null }
      : (firstUnit ?? (overview.units[0] ? { classId: overview.units[0].classId, sectionId: overview.units[0].sectionId } : null));
  // The week of the class picked. While another class's is read, the one shown stays (a little faded) and is swapped when the new one is
  // there (2026-11-23, user: "class change karte hi page load jaisa lagta hai, smooth karo").
  const gridRes = useGetGridQuery(picked ?? skipToken);
  // What the week on screen has now (ClassWeek says it), for the first card.
  const [live, setLive] = useState<ClassWeekStatus | null>(null);
  const week = gridRes.data?.data;
  const switching = !!picked && !gridRes.currentData && gridRes.isFetching && !!week;
  const shownUnit: UnitRef | null = week ? { classId: week.unit.classId, sectionId: week.unit.sectionId } : picked;
  const tab: ClassWeekTab = WEEK_TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as ClassWeekTab) : "timetable";
  const openTab = (next: ClassWeekTab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === "timetable") p.delete("tab");
      else p.set("tab", next);
      return p;
    });


  /** The page: its title and trail, then what the page has to show. */
  const frame = (body: ReactNode) => (
    <div className="space-y-5">
      <StudentFormHeader title="Class timetables" subtitle="Manage class-wise timetables, subjects and teachers" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
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
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 rounded-2xl" />
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
  }

  return frame(
    <>
      <div className={cn("transition-opacity duration-200", switching && "opacity-70")}>
        <ClassHeader week={week} live={readOnly ? null : live} />
      </div>
      {/* The tabs of the class picked, as on the Students page (not while a year that is over is open: it is only read); at the right of their line
          the box that chooses the class, a dropdown like the app's others (2026-11-23). */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border">
        {picked && !readOnly ? <PageTabs label="What to manage" tabs={WEEK_TABS} value={tab} onChange={openTab} className="border-b-0" /> : <span />}
        <div className="w-full pb-2 sm:w-72">
          <ClassPicker week={week} units={overview.units} picked={picked} search={search} onSearch={setSearch} departmentOf={departmentOf} onPick={pick} />
        </div>
      </div>

      {/* The week, the whole width (2026-11-23); a change of tab fades it in. */}
      <TabPanel tab={tab} className="min-w-0">
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
        ) : picked && shownUnit ? (
          <div aria-busy={switching || undefined} className={cn("transition-opacity duration-200", switching && "pointer-events-none opacity-60")}>
            <ClassWeek key={keyOf(shownUnit)} unit={shownUnit} tab={tab} onTab={openTab} onGoTimings={onGoTimings} onStatus={setLive} />
          </div>
        ) : (
          <Card className="px-6 py-16 text-center text-sm font-semibold text-foreground">No class matches.</Card>
        )}
      </TabPanel>
    </>
  );
}
