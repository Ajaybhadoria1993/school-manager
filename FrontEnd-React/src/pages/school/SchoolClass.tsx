import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router";
import { Building2, CalendarX2, FilterX, FolderTree, GraduationCap, LayoutGrid, Search, SearchX, UserPlus, UsersRound } from "lucide-react";
import { STUDENT_PAGE_SIZES } from "../../constants/students";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetCapacityQuery, useGetClassOverviewQuery, useGetStudentsQuery } from "../../redux/api/studentsApi";
import { departmentTone } from "../../utils/academics";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { admitLink } from "../../utils/students";
import type { ClassOverview, ClassOverviewPage, Gender, StudentSort } from "../../types";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { DepartmentPanel } from "../../components/schoolClass/DepartmentPanel";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentPager } from "../../components/students/StudentPager";
import { StudentTable, StudentTableSkeleton } from "../../components/students/StudentTable";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { FilterBar, FilterSearch, FilterSelect } from "../../components/ui/FilterBar";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";

/** The two lists of this page, each on its own address and with its own menu entry: Classes (`/school-class`) and Students (`/school-class/students`). */
type View = "classes" | "students";
const STUDENTS_PATH = "/school-class/students";

/** The orders the students can be listed in: the word in the address, what the person reads, and what the server is asked. */
const SORTS: Record<string, { label: string; sort: StudentSort; dir: "asc" | "desc" }> = {
  class: { label: "Class and section", sort: "class", dir: "asc" },
  name: { label: "Name, A to Z", sort: "name", dir: "asc" },
  "name-desc": { label: "Name, Z to A", sort: "name", dir: "desc" },
  admission: { label: "Admission number", sort: "admissionNumber", dir: "asc" },
  newest: { label: "Newest admission first", sort: "admissionDate", dir: "desc" },
};
const GENDERS: Gender[] = ["Male", "Female", "Other"];

const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * School Class, laid out like the Teacher page (2026-11-03): the plain header (title with the year, the breadcrumb, Manage classes and
 * Add student), four numbers of the school (departments, classes and sections from the class layout, students from the seat counts:
 * reads the app already has), and a row of search and filters (no labels: each dropdown shows its name until something is picked).
 *
 * Two addresses, two menu entries (2026-11-04; they were two tabs of one page, now there are none): **Classes** (`/school-class`): a
 * card for each class that matches (its students, sections and seats; a class opens its own page, a section on a card opens that
 * section's students); filters: department, class, part of a class name. **Students** (`/school-class/students`): every student that
 * matches, class by class; filters: department, class, section, gender, a search and the order. Each has ONE button in the primary colour (Manage
 * classes on Classes, Add student on Students). Every filter is a request to the server
 * (the class cards from `/students/class-overview`, the students from `/students`): nothing is filtered in the browser. The filters, the
 * page and the page size are in the address. Add student opens the admission form with the chosen class and section in. The old address
 * `/school-class?view=students&...` goes to the new one with its filters.
 */
export default function SchoolClassPage() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  if (pathname !== STUDENTS_PATH && params.get("view") === "students") {
    const rest = new URLSearchParams(params);
    rest.delete("view");
    return <Navigate to={{ pathname: STUDENTS_PATH, search: rest.toString() ? `?${rest.toString()}` : "" }} replace />;
  }
  return <SchoolClassView view={pathname === STUDENTS_PATH ? "students" : "classes"} />;
}

function SchoolClassView({ view }: { view: View }) {
  const [params, setParams] = useSearchParams();
  const structureRes = useGetStructureQuery();
  const structure = structureRes.data?.data;

  const departmentId = params.get("department") ?? "";
  const classId = params.get("class") ?? "";
  const klass = structure?.classes.find((c) => c.id === classId);
  const sectionId = klass?.sections.some((s) => s.id === params.get("section")) ? (params.get("section") ?? "") : "";
  const gender = GENDERS.find((g) => g === params.get("gender"));
  const sortKey = params.get("sort") && SORTS[params.get("sort")!] ? params.get("sort")! : "class";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limitParam = Number(params.get("limit"));
  const limit = (STUDENT_PAGE_SIZES as readonly number[]).includes(limitParam) ? limitParam : STUDENT_PAGE_SIZES[0];

  const overviewRes = useGetClassOverviewQuery(
    { ...(departmentId ? { departmentId } : {}), ...(classId ? { classId } : {}), ...(q.trim() ? { q: q.trim() } : {}) },
    { skip: view !== "classes" }
  );
  const listRes = useGetStudentsQuery(
    {
      ...(departmentId ? { departmentId } : {}),
      ...(classId ? { classId } : {}),
      ...(classId && sectionId ? { sectionId } : {}),
      ...(gender ? { gender } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(sortKey !== "class" ? { sort: SORTS[sortKey].sort, dir: SORTS[sortKey].dir } : {}),
      page,
      limit,
    },
    { skip: view !== "students" }
  );
  const overview = overviewRes.data?.data;
  const list = listRes.data?.data;
  const ready = !!structure && !!structure.academicYear && structure.classes.length > 0;
  // The school's seat counts (the tiles): the same read Students and Add student share.
  const capacity = useGetCapacityQuery(undefined, { skip: !ready }).data?.data;

  // The search box waits until typing stops (300 ms), so a burst of typing is one request; a link or Back shows what the address says.
  const [text, setText] = useState(q);
  const typing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!typing.current) setText(q);
  }, [q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Changes some words of the address (an empty one is taken out); a change to what is listed goes back to the first page. */
  function change(patch: Record<string, string>, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === "" || (key === "sort" && value === "class") || (key === "limit" && Number(value) === STUDENT_PAGE_SIZES[0]) || (key === "page" && value === "1")) next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage && !("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  }
  // The search's timer goes off 300 ms after the last key: it calls the newest `change` (the address as it is then), so a dropdown
  // picked meanwhile stays.
  const latestChange = useRef(change);
  useEffect(() => {
    latestChange.current = change;
  });
  const clearAll = () => {
    window.clearTimeout(timer.current);
    setText("");
    change({ department: "", class: "", section: "", gender: "", q: "", sort: "" });
  };
  const filtersSet = (departmentId ? 1 : 0) + (classId ? 1 : 0) + (view === "students" && sectionId ? 1 : 0) + (view === "students" && gender ? 1 : 0) + (q.trim() ? 1 : 0) + (view === "students" && sortKey !== "class" ? 1 : 0);

  const departments = structure?.departments ?? [];
  const hasLoose = structure?.classes.some((c) => !c.departmentId) ?? false;
  const classesToPick = (structure?.classes ?? []).filter((c) => (!departmentId ? true : departmentId === "none" ? !c.departmentId : c.departmentId === departmentId));
  const year = structure?.academicYear?.name ?? null;
  const noYear = !!structure && !structure.academicYear;

  const failed = structureRes.error;
  if (failed && !structure) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">{getApiError(failed)?.message ?? "Could not load your classes."}</p>
        <Button variant="outline" onClick={() => structureRes.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title={view === "students" ? "Students" : "Classes"}
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        info={year ? <Badge tone="primary">{year}</Badge> : undefined}
        actions={
          // One button, in the primary colour: Manage classes on Classes, Add student on Students (it carries the chosen class and section).
          ready ? (
            view === "students" ? (
              <Link to={admitLink({ classId, sectionId })} className={plainLink}>
                <UserPlus className="size-4" aria-hidden />
                Add student
              </Link>
            ) : (
              <Link to="/school/classes" className={plainLink}>
                <FolderTree className="size-4" aria-hidden />
                Manage classes
              </Link>
            )
          ) : undefined
        }
      />

      {!structure ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-28 rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : noYear ? (
        <StudentsNotice
          icon={CalendarX2}
          tone="warning"
          title="Your school has no current academic year yet"
          actions={
            <Link to="/dashboard" className={outlineLink}>
              Go to the dashboard
            </Link>
          }
        >
          <p>Classes are counted for an academic year. Set it up once on the dashboard, then come back here.</p>
        </StudentsNotice>
      ) : structure.classes.length === 0 ? (
        <StudentsNotice
          icon={FolderTree}
          tone="success"
          title="Add your classes first"
          actions={
            <Link to="/school/classes" className={outlineLink}>
              Open Classes & Sections
            </Link>
          }
        >
          <p>This page shows every class with its sections and students. Your school has no classes yet: create them in Classes & Sections.</p>
        </StudentsNotice>
      ) : (
        <>
          <section aria-label="School counts" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/* (Not "seats left": the seat counts know only the seats of sections, so a school whose classes have no sections would read a dash.) */}
            <StatTile label="Departments" value={structure.totals.departments} icon={Building2} tone="navy" />
            <StatTile label="Classes" value={structure.totals.classes} icon={FolderTree} tone="primary" />
            <StatTile label="Sections" value={structure.totals.sections} icon={LayoutGrid} tone="info" />
            <StatTile label="Students" value={capacity?.totals.students ?? null} icon={GraduationCap} tone="success" />
          </section>

          <div className="space-y-4">
            <FilterBar label={view === "students" ? "Find students" : "Find classes"}>
              <FilterSearch>
                <Input
                  id="school-class-search"
                  aria-label={view === "students" ? "Search students by name or admission number" : "Search a class by its name"}
                  icon={Search}
                  value={text}
                  maxLength={view === "students" ? 60 : 40}
                  placeholder={view === "students" ? "Search students" : "Search classes"}
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
              {(departments.length > 0 || hasLoose) && (
                <FilterSelect
                  id="school-class-department"
                  name="Department"
                  all="All departments"
                  value={departmentId}
                  options={[...departments.map((d) => ({ value: d.id, label: d.name })), ...(departments.length > 0 && hasLoose ? [{ value: "none", label: "Other classes" }] : [])]}
                  // A new department forgets the class and the section (they may not be in it).
                  onChange={(id) => change({ department: id, class: "", section: "" })}
                />
              )}
              <FilterSelect
                id="school-class-class"
                name="Class"
                all="All classes"
                value={classId}
                options={classesToPick.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(id) => change({ class: id, section: "" })}
              />
              {view === "students" && (
                <>
                  {/* Waits for a class that has sections. */}
                  <FilterSelect
                    id="school-class-section"
                    name="Section"
                    all="All sections"
                    value={sectionId}
                    options={(klass?.sections ?? []).map((s) => ({ value: s.id, label: `Section ${s.name}` }))}
                    disabled={!klass || klass.sections.length === 0}
                    onChange={(id) => change({ section: id })}
                  />
                  <FilterSelect
                    id="school-class-gender"
                    name="Gender"
                    all="Boys and girls"
                    value={gender ?? ""}
                    options={GENDERS.map((g) => ({ value: g, label: g === "Male" ? "Boys (Male)" : g === "Female" ? "Girls (Female)" : "Other" }))}
                    onChange={(id) => change({ gender: id })}
                  />
                  {/* The usual order (class and section) is the list's first row; another one is tinted like a filter. */}
                  <FilterSelect
                    id="school-class-order"
                    name="Order"
                    all={SORTS.class.label}
                    value={sortKey === "class" ? "" : sortKey}
                    options={Object.entries(SORTS)
                      .filter(([value]) => value !== "class")
                      .map(([value, s]) => ({ value, label: s.label }))}
                    onChange={(value) => change({ sort: value })}
                  />
                </>
              )}
            </FilterBar>

            {/* Clear filters when a filter is on and something is shown (the count is the pager's, under the table; when nothing matches,
                the notice has its own Clear filters). */}
            {filtersSet > 0 && (view === "students" ? !!list && list.items.length > 0 : !!overview && overview.classes.length > 0) && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <FilterX className="size-4" aria-hidden />
                  Clear filters
                </Button>
              </div>
            )}

          {view === "classes" ? (
            <ClassCards
              loading={overviewRes.isFetching}
              error={overviewRes.error && !overview ? (getApiError(overviewRes.error)?.message ?? "Could not load the classes.") : null}
              retry={() => overviewRes.refetch()}
              overview={overview}
              departments={departments}
              onClear={clearAll}
            />
          ) : listRes.error && !list ? (
            <Card className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-danger">{getApiError(listRes.error)?.message ?? "Could not load the students."}</p>
              <Button variant="outline" onClick={() => listRes.refetch()}>
                Try again
              </Button>
            </Card>
          ) : !list ? (
            <StudentTableSkeleton />
          ) : list.items.length === 0 ? (
            <StudentsNotice
              icon={filtersSet > 0 ? SearchX : UsersRound}
              tone="navy"
              title={filtersSet > 0 ? "Nobody matches" : "No students yet"}
              actions={
                filtersSet > 0 ? (
                  <Button variant="outline" onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : (
                  <Link to="/school/students/new" className={plainLink}>
                    <UserPlus className="size-4" aria-hidden />
                    Add the first student
                  </Link>
                )
              }
            >
              {filtersSet > 0 && <p>No student of this year matches these filters.</p>}
            </StudentsNotice>
          ) : (
            <div className="space-y-4">
              <StudentTable students={list.items} loading={listRes.isFetching} />
              <StudentPager page={list} limit={limit} onPage={(p) => change({ page: String(p) }, true)} onLimit={(l) => change({ limit: String(l) })} />
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}

/** The classes of the "Classes" view, wing by wing (the order of the departments): a panel of rows for each wing. */
function ClassCards({
  overview,
  loading,
  error,
  retry,
  departments,
  onClear,
}: {
  overview: ClassOverviewPage | undefined;
  loading: boolean;
  error: string | null;
  retry: () => void;
  departments: { id: string; name: string }[];
  onClear: () => void;
}) {
  const groups = useMemo(() => {
    if (!overview) return [];
    const rows: { key: string; name: string | null; position: number; classes: ClassOverview[] }[] = departments.map((d, position) => ({
      key: d.id,
      name: d.name,
      position,
      classes: overview.classes.filter((c) => c.departmentId === d.id),
    }));
    rows.push({ key: "none", name: departments.length > 0 ? "Other classes" : null, position: -1, classes: overview.classes.filter((c) => !c.departmentId || !departments.some((d) => d.id === c.departmentId)) });
    return rows.filter((g) => g.classes.length > 0);
  }, [overview, departments]);

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!overview) {
    return (
      <div className="space-y-5" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (overview.classes.length === 0) {
    return (
      <StudentsNotice
        icon={SearchX}
        tone="navy"
        title="No class matches"
        actions={
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        }
      >
        <p>Choose another department or class, or search another name.</p>
      </StudentsNotice>
    );
  }

  return (
    <div className={cn("space-y-5 transition-opacity", loading && "opacity-70")}>
      {groups.map((group) => (
        <DepartmentPanel
          key={group.key}
          name={group.name}
          departmentId={group.key}
          tone={group.position >= 0 ? departmentTone(group.position) : "navy"}
          classes={group.classes}
        />
      ))}
    </div>
  );
}
