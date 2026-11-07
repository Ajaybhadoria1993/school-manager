import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BookX, FileUp, FilterX, ListPlus, Pencil, Plus, Search, SearchX, UserRoundCheck, UserRoundMinus, UsersRound } from "lucide-react";
import { DESIGNATIONS } from "../../constants/teachers";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetSubjectsQuery, useGetTeacherSummaryQuery, useGetTeachersQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { formatMobile } from "../../utils/students";
import type { Teacher, TeacherQuery } from "../../types";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { ExportTeachersButton } from "../../components/teachers/ExportTeachersButton";
import { StudentAvatar } from "../../components/students/StudentAvatar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { FilterBar, FilterSearch, FilterSelect } from "../../components/ui/FilterBar";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";

const STATUSES = [
  { value: "active", label: "Teaching" },
  { value: "inactive", label: "Have left" },
  { value: "all", label: "All teachers" },
] as const;

/** The words of the address for each filter, in the order of the dropdowns (the user kept these three on 2026-11-03). */
const FILTER_KEYS = ["subject", "class", "designation"] as const;

const TH = "whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted";
const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined => (value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined);

/** Teaching (green) or Left (grey), as a pill with a dot. */
function StatusPill({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "success" : "neutral"} className="gap-1.5">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {active ? "Teaching" : "Left"}
    </Badge>
  );
}

/** What they can teach: the first three, then "+N" (the whole list on hover). */
function CanTeach({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-foreground-muted">—</span>;
  const shown = names.slice(0, 3).join(", ");
  return (
    <span title={names.join(", ")} className="text-foreground">
      {shown}
      {names.length > 3 && <span className="font-semibold text-foreground-muted"> +{names.length - 3}</span>}
    </span>
  );
}

/** The classes they were given: the ones they are the class teacher of, then their subjects of classes this year. */
function Classes({ teacher: t }: { teacher: Teacher }) {
  const heads = t.classTeacherOf;
  const given =
    t.load.sections > 0 ? `${t.load.sections} class${t.load.sections === 1 ? "" : "es"} · ${t.load.periodsAllotted} periods a week` : heads.length > 0 ? "No subjects yet" : "Nothing yet";
  return (
    <span className="block">
      {heads.length > 0 && (
        <span className="mb-1 flex flex-wrap items-center gap-1">
          <span className="text-xs text-foreground-muted">Class teacher</span>
          {heads.map((l) => (
            <Badge key={l} tone="primary">
              {l}
            </Badge>
          ))}
        </span>
      )}
      <span className={cn("block whitespace-nowrap", t.load.sections > 0 ? "text-foreground" : "text-foreground-muted")}>{given}</span>
    </span>
  );
}

/**
 * One teacher. The columns give way as the screen narrows (Can teach below 1536px, Contact below 1280px: the mobile then goes under the
 * name, Classes below 1024px, Login below 768px; on a phone the status and the pencil too: a row still opens the teacher, and a teacher
 * who has left says so under the name).
 */
function TeacherRow({ teacher: t, subjectName }: { teacher: Teacher; subjectName: Map<string, string> }) {
  const navigate = useNavigate();
  const about = [t.designation, t.employeeCode].filter(Boolean).join(" · ");
  return (
    <tr
      onClick={(e) => {
        // The name and the pencil are links: let them do their own work instead of going twice.
        if (!(e.target as HTMLElement).closest("a, button")) navigate(`/teachers/${t.id}`);
      }}
      className="group cursor-pointer border-t border-surface-muted transition-colors first:border-t-0 hover:bg-background"
    >
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-3">
          <StudentAvatar name={t.name} seed={t.id} size="sm" className={cn("transition-transform duration-200 group-hover:scale-105", !t.isActive && "opacity-60 grayscale")} />
          <div className="min-w-0 max-w-[13rem] sm:max-w-[18rem]">
            <Link
              to={`/teachers/${t.id}`}
              className="block truncate font-bold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              {t.name}
            </Link>
            {about && <span className="block truncate text-xs text-foreground-muted">{about}</span>}
            {t.mobile && <span className="block text-xs text-foreground-muted xl:hidden">{formatMobile(t.mobile)}</span>}
            {!t.isActive && (
              <span className="mt-1 block sm:hidden">
                <StatusPill active={false} />
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 align-middle xl:table-cell">
        {t.mobile || t.email ? (
          <span className="block min-w-0">
            {t.mobile && <span className="block font-semibold text-foreground">{formatMobile(t.mobile)}</span>}
            {t.email && <span className="block max-w-[14rem] truncate text-xs text-foreground-muted">{t.email}</span>}
          </span>
        ) : (
          <span className="text-foreground-muted">—</span>
        )}
      </td>
      <td className="hidden max-w-[16rem] px-4 py-3 align-middle 2xl:table-cell">
        <CanTeach names={t.subjectIds.map((id) => subjectName.get(id) ?? "A subject")} />
      </td>
      <td className="hidden px-4 py-3 align-middle lg:table-cell">
        <Classes teacher={t} />
      </td>
      <td className="hidden px-4 py-3 align-middle md:table-cell">
        {t.login ? (
          <span className={cn("font-mono text-xs", t.login.isActive ? "text-foreground" : "text-foreground-muted line-through")}>{t.login.username}</span>
        ) : (
          <span className="text-foreground-muted">No login</span>
        )}
      </td>
      <td className="hidden px-4 py-3 align-middle sm:table-cell">
        <StatusPill active={t.isActive} />
      </td>
      <td className="hidden py-3 pl-2 pr-4 text-right align-middle sm:table-cell">
        <Link
          to={`/teachers/${t.id}/edit`}
          aria-label={`Edit ${t.name}`}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted shadow-sm transition-colors hover:border-primary/40 hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
        >
          <Pencil className="size-4" aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

/**
 * Teacher (the menu entry on top, `/teachers`), laid out like Infinity Medisetu's patient list: the title with Add teacher, four numbers
 * of the school (one request, not repeated by the filters), one line with the search and four dropdowns (Status, Subject, Class,
 * Designation; no labels: each shows its name until something is picked), and the table (a row opens the teacher, the pencil changes
 * them; Clear filters sits under it, by the count). The search (name, mobile, code, email, username) and every filter are a question to
 * the server, kept in the address. (Employment, gender, login and class-teacher filters were taken off at the user's request; the API
 * still takes them.)
 */
export default function TeacherDirectoryPage() {
  const [params, setParams] = useSearchParams();
  const status = oneOf(params.get("status"), ["active", "inactive", "all"] as const) ?? "active";
  const q = params.get("q") ?? "";
  const subject = params.get("subject") ?? "";
  const klass = params.get("class") ?? "";
  const designation = params.get("designation") ?? "";

  const query: TeacherQuery = {
    status,
    ...(q.trim() ? { search: q.trim() } : {}),
    ...(subject ? { subjectId: subject } : {}),
    ...(klass ? { classId: klass } : {}),
    ...(designation ? { designation } : {}),
  };
  const res = useGetTeachersQuery(query);
  const summary = useGetTeacherSummaryQuery().data?.data;
  const subjects = useGetSubjectsQuery("active").data?.data.items ?? [];
  const classes = useGetStructureQuery().data?.data.classes ?? [];
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  // The search box waits until typing stops (300 ms), so a burst of typing is one request; Back shows what the address says.
  const [text, setText] = useState(q);
  const typing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!typing.current) setText(q);
  }, [q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function change(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === "" || (key === "status" && value === "active")) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }
  // The search's timer goes off 300 ms after the last key: it calls the newest `change` (the address as it is then), so a dropdown
  // picked meanwhile stays.
  const latestChange = useRef(change);
  useEffect(() => {
    latestChange.current = change;
  });
  const filtered = FILTER_KEYS.some((k) => params.get(k));
  const clearFilters = () => change(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])));

  const teachers = res.data?.data.items ?? [];
  const searching = filtered || q.trim() !== "" || status !== "active";
  const designations = [...new Set([...(designation ? [designation] : []), ...DESIGNATIONS])];

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title="All Teachers"
        current="Teacher"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        actions={
          <>
            {/* Like the students' header: Export (the list as Excel), Bulk upload (the teachers a school already has, from Excel), Add teacher. */}
            <Link to="/teachers/fields" className={outlineLink}>
              <ListPlus className="size-4" aria-hidden />
              Fields
            </Link>
            <ExportTeachersButton query={query} empty={teachers.length === 0} />
            <Link to="/teachers/import" className={outlineLink}>
              <FileUp className="size-4" aria-hidden />
              Bulk upload
            </Link>
            <Link to="/teachers/new" className={primaryLink}>
              <Plus className="size-4" aria-hidden />
              Add teacher
            </Link>
          </>
        }
      />

      <section aria-label="Teacher counts" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Teachers" value={summary?.teaching ?? null} icon={UsersRound} tone="primary" />
        <StatTile label="Class teachers" value={summary?.classTeachers ?? null} icon={UserRoundCheck} tone="success" />
        <StatTile label="Without classes" value={summary?.withoutClasses ?? null} icon={BookX} tone="warning" />
        <StatTile label="Have left" value={summary?.left ?? null} icon={UserRoundMinus} tone="navy" />
      </section>

      {/* The search and four dropdowns on one line from 1280px (a laptop too); narrower, the search on its own line above them. */}
      <FilterBar label="Find teachers">
        <FilterSearch>
          <Input
            aria-label="Search teachers"
            icon={Search}
            maxLength={40}
            placeholder="Search teachers"
            value={text}
            onFocus={() => (typing.current = true)}
            onBlur={() => (typing.current = false)}
            onChange={(e) => {
              setText(e.target.value);
              window.clearTimeout(timer.current);
              const value = e.target.value;
              timer.current = window.setTimeout(() => latestChange.current({ q: value }), 300);
            }}
          />
        </FilterSearch>
        <div className="min-w-0">
          <label id="teacher-filter-status-label" htmlFor="teacher-filter-status" className="sr-only">
            Status
          </label>
          <Select id="teacher-filter-status" value={status} options={STATUSES} onChange={(v) => change({ status: v })} triggerClassName="font-semibold" />
        </div>
        <FilterSelect id="teacher-filter-subject" name="Subject" all="All subjects" value={subject} options={subjects.map((s) => ({ value: s.id, label: s.name }))} onChange={(v) => change({ subject: v })} />
        <FilterSelect id="teacher-filter-class" name="Class" all="All classes" value={klass} options={classes.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => change({ class: v })} />
        <FilterSelect id="teacher-filter-designation" name="Designation" all="All designations" value={designation} options={designations.map((d) => ({ value: d, label: d }))} onChange={(v) => change({ designation: v })} />
      </FilterBar>

      {res.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : res.error && !res.data ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the teachers."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>
            Try again
          </Button>
        </Card>
      ) : teachers.length === 0 ? (
        searching ? (
          <StudentsNotice
            icon={SearchX}
            tone="navy"
            title="No teacher matches"
            actions={
              filtered ? (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <StudentsNotice icon={UsersRound} tone="primary" title="No teachers yet" />
        )
      ) : (
        <div className={cn("overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card transition-opacity", res.isFetching && "opacity-70")}>
          <div className="overflow-x-auto">
            <table aria-label="Teachers" aria-busy={res.isFetching || undefined} className="w-full border-collapse text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th scope="col" className={TH}>
                    Teacher
                  </th>
                  <th scope="col" className={cn(TH, "hidden xl:table-cell")}>
                    Contact
                  </th>
                  <th scope="col" className={cn(TH, "hidden 2xl:table-cell")}>
                    Can teach
                  </th>
                  <th scope="col" className={cn(TH, "hidden lg:table-cell")}>
                    Classes
                  </th>
                  <th scope="col" className={cn(TH, "hidden md:table-cell")}>
                    Login
                  </th>
                  <th scope="col" className={cn(TH, "hidden sm:table-cell")}>
                    Status
                  </th>
                  <th scope="col" className={cn(TH, "hidden pr-4 text-right sm:table-cell")}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <TeacherRow key={t.id} teacher={t} subjectName={subjectName} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex min-h-14 items-center justify-between gap-3 border-t border-border px-4 py-2">
            <p className="text-sm font-semibold text-foreground-muted">
              {teachers.length} {teachers.length === 1 ? "teacher" : "teachers"}
            </p>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <FilterX className="size-4" aria-hidden />
                Clear filters
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
