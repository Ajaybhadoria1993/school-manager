import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck2, GraduationCap, Inbox, RefreshCw, UserX, UsersRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useGetSchoolDashboardQuery } from "../../redux/api/dashboardApi";
import { STUDENT_WRITERS } from "../../constants/students";
import { attentionRows } from "../../utils/dashboard";
import { comparisonLabel, percentChange, pointsChange, rangeFor, rangeLabel, type Days, type RangeTab } from "../../utils/dashboardRange";
import { todayInIndia } from "../../utils/students";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { AbsentClassesCard } from "./school/AbsentClassesCard";
import { AcademicYearSetUp } from "./school/AcademicYearStatus";
import { AdmissionsCard } from "./school/AdmissionsCard";
import { AttendanceStatusCard } from "./school/AttendanceStatusCard";
import { AttendanceTrendCard } from "./school/AttendanceTrendCard";
import { AttentionCard } from "./school/AttentionCard";
import { ClassesCard } from "./school/ClassesCard";
import { ComingUpCard } from "./school/ComingUpCard";
import { DateFilter } from "./school/DateFilter";
import { MetricCard, type Trend } from "./school/MetricCard";
import { SchoolNowStrip } from "./school/SchoolNowStrip";

/** How a change is said on a card: an arrow, the sign and the number; `badWhenUp` flips which way is good (more absences is not). */
function changeOf(change: number | "new" | null, badWhenUp = false, neutral = false): Trend | null {
  if (change === null) return null;
  if (change === "new") return { text: "New", tone: "neutral" };
  if (change === 0) return { text: "0%", tone: "neutral" };
  const up = change > 0;
  return { text: `${up ? "↑ +" : "↓ "}${change}%`, tone: neutral ? "neutral" : up === badWhenUp ? "bad" : "good" };
}

/**
 * The home page of an approved school (laid out like Infinity Medisetu's dashboard, 2026-11-10): a greeting and the days to look at (Today,
 * This Week, This Month, Custom), five figures each compared with the same number of days just before, a line about the school's day right
 * now (Today only), and cards: the attendance as a chart and a donut, the classes with the most absences, what needs attention, the students
 * by class, the admissions and what is coming up. ONE request answers the days picked (the chart asks for its own week or month), and every
 * number is what is in the school now: nothing is estimated, nothing is a sample.
 */
export function SchoolDashboard() {
  const { user, tenant } = useAuth();
  // The day in India, fixed for this visit: the arrows and the tabs count from it.
  const today = useMemo(() => todayInIndia(), []);
  const [tab, setTab] = useState<RangeTab>("today");
  const [days, setDays] = useState<Days>(() => rangeFor("today", today));
  const { data, isLoading, isError, isFetching, refetch } = useGetSchoolDashboardQuery(days);
  if (!user) return null;

  const manages = STUDENT_WRITERS.includes(user.role);
  const d = data?.data;
  const rows = d ? attentionRows(d.attention, { students: d.students.total, teachers: d.people.teachers, manages }) : [];
  const isToday = days.from === today && days.to === today;
  // What the figures are compared with: a day stepped away from today is "the day before", not "yesterday".
  const versus = tab === "today" && !isToday ? "day before" : comparisonLabel(tab);

  const choose = (next: Exclude<RangeTab, "custom">) => {
    setTab(next);
    setDays(rangeFor(next, today));
  };

  const p = d?.period;
  const people = d ? d.people.teachers + d.people.staff : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-page-heading">
              Hello {user.name.split(" ")[0]} <span aria-hidden>👋</span>
            </h1>
            {d?.academicYear && <Badge tone="primary">{d.academicYear.name}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-foreground-muted">{isToday ? `Here's what's happening at ${tenant?.name ?? "your school"} today.` : `School performance · ${rangeLabel(days)}`}</p>
        </div>
        <DateFilter
          tab={tab}
          days={days}
          today={today}
          onTab={choose}
          onDays={(next, nextTab) => {
            setTab(nextTab);
            setDays(next);
          }}
        />
      </header>

      <AcademicYearSetUp />

      {isLoading && <p role="status" className="sr-only">Loading the dashboard</p>}

      {isError && !d && (
        <Card role="alert" className="flex flex-wrap items-center gap-3 border-danger-line bg-danger-soft px-5 py-4">
          <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
          <p className="flex-1 text-sm font-semibold text-danger">Could not load the dashboard</p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger-line bg-surface px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
            Retry
          </button>
        </Card>
      )}

      {isLoading && (
        <div aria-hidden className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="h-24 animate-pulse" />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="h-72 animate-pulse lg:col-span-2" />
            <Card className="h-72 animate-pulse" />
          </div>
        </div>
      )}

      {d && p && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 ${isFetching ? "opacity-80 transition-opacity" : ""}`}>
            <MetricCard
              icon={<GraduationCap className="size-[18px]" />}
              iconClass="bg-success-soft text-success"
              label="Students"
              value={d.students.total.toLocaleString("en-IN")}
              trend={p.students.admitted > 0 || p.students.admittedBefore > 0 ? { text: p.students.admitted > 0 ? `↑ ${p.students.admitted} admitted` : "0 admitted", tone: p.students.admitted > 0 ? "good" : "neutral" } : null}
              versus={`vs ${p.students.admittedBefore} ${versus}`}
              href={manages ? "/school/students" : null}
            />
            <MetricCard
              icon={<UsersRound className="size-[18px]" />}
              iconClass="bg-info-soft text-info"
              label="Teachers and Staff"
              value={people === null ? null : people.toLocaleString("en-IN")}
              hint={`${d.people.teachers} ${d.people.teachers === 1 ? "teacher" : "teachers"} · ${d.people.staff} staff`}
              href={manages ? "/teachers" : null}
            />
            <MetricCard
              icon={<CalendarCheck2 className="size-[18px]" />}
              iconClass="bg-primary-soft text-primary"
              label="Attendance"
              value={p.attendance.percent === null ? null : `${p.attendance.percent}%`}
              trend={(() => {
                const points = pointsChange(p.attendance.percent, p.attendance.before.percent);
                return points === null ? null : changeOf(points);
              })()}
              versus={`vs ${versus}`}
              href={manages ? "/attendance/students" : null}
            />
            <MetricCard
              icon={<UserX className="size-[18px]" />}
              iconClass="bg-danger-soft text-danger"
              label="Absent"
              value={String(p.attendance.absent)}
              trend={changeOf(percentChange(p.attendance.absent, p.attendance.before.absent), true)}
              versus={`vs ${versus}`}
              href={manages ? "/attendance/students" : null}
            />
            <MetricCard
              icon={<Inbox className="size-[18px]" />}
              iconClass="bg-warning-soft text-warning"
              label="Leave Requests"
              value={String(p.leaves.asked)}
              trend={changeOf(percentChange(p.leaves.asked, p.leaves.askedBefore), false, true)}
              versus={`vs ${versus}`}
              href="/leaves"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          {isToday && <SchoolNowStrip data={d} />}

          <div className="grid items-stretch gap-5 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <AttendanceTrendCard />
            </div>
            <div className="min-w-0">
              <AttendanceStatusCard period={p} comparison={versus} manages={manages} />
            </div>
            <div className="min-w-0">
              <AttentionCard rows={rows} />
            </div>
            <div className="min-w-0">
              <AbsentClassesCard period={p} />
            </div>
            <div className="min-w-0">
              <ClassesCard students={d.students} classes={d.classes} />
            </div>
            <div className="min-w-0">
              <AdmissionsCard admissions={d.admissions} />
            </div>
            <div className="min-w-0 lg:col-span-2">
              <ComingUpCard upcoming={d.upcoming} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
