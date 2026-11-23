import { CalendarOff } from "lucide-react";
import { useGetStudentsDayQuery } from "../../redux/api/attendanceApi";
import { getApiError } from "../../utils/apiErrors";
import { shortDay } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import type { StudentsDayGroup, StudentsDayLine } from "../../types";
import { StudentAvatar } from "../students/StudentAvatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { AttendanceDonut } from "./AttendanceDonut";
import { MARKS, SUMMARY_LINES, isSunday } from "./marks";

/** One child of a class: roll number, photo, name and admission number, the four marks (fixed; lit only when the class took the day) and the note. */
function ChildLine({ child: s, taken }: { child: StudentsDayLine; taken: boolean }) {
  const status = taken ? s.status : null;
  const note =
    status === "leave" ? (
      <span className="inline-flex items-center gap-2 text-sm text-foreground">
        <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-bold text-info">On leave</span>
        {s.reason && <span className="min-w-0 truncate">{s.reason}</span>}
      </span>
    ) : status === "absent" || status === "late" ? (
      <span className={cn("min-w-0 truncate text-sm", s.reason ? "text-foreground" : "text-foreground-muted")}>{s.reason || "Not informed"}</span>
    ) : null;
  return (
    <li aria-label={s.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 transition-colors hover:bg-background/70">
      {/* A child with no roll number is shown under the place in the class (the server says it), never renumbered by a search. */}
      <span className="w-7 shrink-0 text-sm font-semibold text-foreground-muted">{String(s.rollNumber ?? s.position).padStart(2, "0")}</span>
      <StudentAvatar name={s.name} seed={s.admissionNumber} size="sm" />
      <span className="min-w-0 flex-1 basis-36 sm:w-52 sm:flex-none">
        <span className="block truncate font-semibold text-foreground">{s.name}</span>
        <span className="text-xs text-foreground-muted">{s.admissionNumber}</span>
      </span>
      <span role="radiogroup" aria-label={`Mark of ${s.name}`} className="flex gap-1.5">
        {MARKS.map((m) => (
          <label
            key={m.value}
            title={m.label}
            className={cn("inline-flex h-9 min-w-9 cursor-default items-center justify-center rounded-lg border px-2 text-xs font-bold", status === m.value ? m.on : "border-border bg-surface text-foreground-muted")}
          >
            <input type="radio" className="sr-only" name={`mark-${s.id}`} disabled checked={status === m.value} readOnly />
            <span aria-hidden>{m.letter}</span>
            <span className="sr-only">{m.label}</span>
          </label>
        ))}
      </span>
      <span className={cn("min-w-0 basis-full items-center sm:flex sm:min-h-9 sm:flex-1 sm:basis-40", note ? "flex" : "hidden")}>{note}</span>
    </li>
  );
}

/** One class (or section) of the day: its name and number of children on top (always the whole class), Not taken when nobody took it, its children under it. */
function ClassDay({ group: g, searching, noSchool }: { group: StudentsDayGroup; searching: boolean; noSchool: boolean }) {
  return (
    <section aria-label={g.label} className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border bg-background/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-foreground">
            {g.label} · {g.total} {g.total === 1 ? "student" : "students"}
          </h2>
          {g.classTeacher && <p className="mt-0.5 text-xs text-foreground-muted">Class teacher: {g.classTeacher.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          {searching && <span className="text-xs font-semibold text-foreground-muted">{g.students.length} found</span>}
          {/* A day without school (a Sunday, a holiday) has nothing to take: it says so once, on top, not on every class. */}
          {!g.saved && !noSchool && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">Not taken</span>}
        </div>
      </div>
      <ul aria-label={`Attendance of ${g.label}`} className="divide-y divide-border">
        {g.students.map((s) => (
          <ChildLine key={s.id} child={s} taken={g.saved} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The day of every class for the school (2026-11-22, Attendance > Student): one read of `GET /attendance/students/day` for the classes picked
 * (all of them to start with). Each class is a card in teaching order, its children under it; at the side the summary of the day (the classes
 * that were taken, and how many of them were). A search is the server's: only the classes with a child found come back, each with those children,
 * and the numbers stay whole. While the next answer comes the last one stays on screen, dimmed (no flash of an empty page at every word).
 */
export function StudentDayList({
  date,
  classId,
  sectionId,
  search,
  onClearSearch,
}: {
  date: string;
  /** "" = every class. */
  classId: string;
  /** "" = every section of the class. */
  sectionId: string;
  search: string;
  onClearSearch: () => void;
}) {
  const today = todayInIndia();
  const res = useGetStudentsDayQuery({ date, classId, sectionId, search });
  const day = res.currentData?.data ?? res.data?.data;
  const refreshing = res.isFetching && res.currentData === undefined;

  if (!day) {
    if (res.isError)
      return (
        <Card className="flex flex-col items-center gap-3 px-5 py-8 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the attendance."}</p>
          <Button variant="outline" onClick={() => void res.refetch()}>
            Try again
          </Button>
        </Card>
      );
    return <Skeleton className="h-64 rounded-2xl" />;
  }
  const { summary } = day;
  const taken = summary.taken > 0;
  // A day without school: a holiday, or a Sunday nobody took. It says so on top; the classes stay under it, to look through and search (2026-11-22:
  // it used to take the whole page, so on a Sunday the school saw no class at all).
  const noSchool = day.holiday ? `Holiday: ${day.holiday.title}` : !taken && isSunday(day.date) ? "Sunday: no school" : null;
  if (summary.students === 0) return <Card className="px-5 py-8 text-center text-sm text-foreground-muted">{classId ? "No child is in this class yet" : "No students yet"}</Card>;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div aria-busy={refreshing || undefined} className={cn("min-w-0 space-y-4 transition-opacity", refreshing && "opacity-60")}>
        {noSchool && (
          <Card
            className={cn(
              "flex items-center gap-3 px-5 py-3.5 text-sm font-semibold",
              day.holiday ? "border-danger-line bg-danger-soft/50 text-danger" : "text-foreground-muted"
            )}
          >
            <CalendarOff className="size-5" aria-hidden />
            {noSchool}
          </Card>
        )}
        {day.groups.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-5 py-8 text-center">
            <p className="text-sm text-foreground-muted">Nobody matches</p>
            <Button variant="outline" size="sm" onClick={onClearSearch}>
              Clear search
            </Button>
          </Card>
        ) : (
          day.groups.map((g) => <ClassDay key={`${g.classId}:${g.sectionId ?? "-"}`} group={g} searching={!!search} noSchool={!!noSchool} />)
        )}
      </div>

      <section aria-label="Summary of the day" className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-card lg:sticky lg:top-20">
        <h3 className="text-base font-semibold text-foreground">{day.date === today ? "Today's summary" : `Summary of ${shortDay(day.date)}`}</h3>
        <p className="mt-0.5 text-xs text-foreground-muted">
          {summary.students} {summary.students === 1 ? "student" : "students"} · taken in {summary.taken} of {summary.classes} {summary.classes === 1 ? "class" : "classes"}
        </p>
        <div className="mt-4">
          <AttendanceDonut counts={summary.counts} taken={taken} />
        </div>
        <dl className="mt-5 space-y-2.5">
          {SUMMARY_LINES.map((l) => (
            <div key={l.value} className="flex items-center justify-between gap-3 text-sm">
              <dt className="flex items-center gap-2 text-foreground-muted">
                <span aria-hidden className={cn("size-2.5 rounded-full", MARKS.find((m) => m.value === l.value)?.dot)} />
                {l.label}
              </dt>
              <dd className="font-bold text-foreground">{taken ? summary.counts[l.value] : "–"}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
