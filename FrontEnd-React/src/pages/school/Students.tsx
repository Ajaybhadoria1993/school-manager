import { useState } from "react";
import { Link } from "react-router";
import {
  Armchair,
  CalendarX2,
  Download,
  FileUp,
  FolderTree,
  GraduationCap,
  HelpCircle,
  SearchX,
  ShieldAlert,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useStudentFilters } from "../../hooks/useStudentFilters";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetCapacityQuery, useGetStudentsQuery } from "../../redux/api/studentsApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { KpiCard } from "../../components/dashboard/school/KpiCard";
import { StudentCard } from "../../components/students/StudentCard";
import { StudentPager } from "../../components/students/StudentPager";
import { StudentTable, StudentTableSkeleton } from "../../components/students/StudentTable";
import { StudentToolbar } from "../../components/students/StudentToolbar";
import { StudentsGuide } from "../../components/students/StudentsGuide";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InfoTip, WithTip } from "../../components/ui/Hint";
import { Skeleton } from "../../components/ui/Skeleton";

const GUIDE_KEY = "edushiksha.students.guide-closed";

function readGuideClosed(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberGuideClosed(closed: boolean) {
  try {
    if (closed) localStorage.setItem(GUIDE_KEY, "1");
    else localStorage.removeItem(GUIDE_KEY);
  } catch {
    // No storage (a private window): the guide simply shows again next time.
  }
}

/** The main button of the page: a link that looks like the app's primary button. */
const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
/** A second button of the page as a link, in the outline look of `Button variant="outline"`. */
const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * Manage school > Students (`/school/students`): this academic year's students, as a table or as colourful cards (the List / Grid
 * switch), searched, filtered by class and section, sorted and paged by the server. A plain header (the title and the page's two
 * buttons), the tiles, one row of filters, the students, and the pages. Three reads, each once: the page of students, how full each
 * section is (the tiles and the counts in the dropdowns), and the class layout (the dropdowns' names, shared with Classes & Sections).
 * The search, the class, the section, the sort, the page and the view are kept in the address.
 */
export default function StudentsPage() {
  const { filters, query, active, change, clear } = useStudentFilters();
  const structureRes = useGetStructureQuery();
  const capacityRes = useGetCapacityQuery();
  const listRes = useGetStudentsQuery(query);
  const [guideChoice, setGuideChoice] = useState<boolean | null>(null);

  const structure = structureRes.data?.data;
  const capacity = capacityRes.data?.data;
  const page = listRes.data?.data;
  const firstLoad = !structure || !capacity || !page;
  const failed = structureRes.error ?? capacityRes.error ?? listRes.error;

  const noYear = (capacity && !capacity.academicYear) || (page && !page.academicYear);
  const total = capacity?.totals.students ?? 0;
  const guideOpen = guideChoice ?? (!readGuideClosed() && total === 0);
  const toggleGuide = () => {
    rememberGuideClosed(guideOpen);
    setGuideChoice(!guideOpen);
  };

  /** The Export page gets the students the list shows (its search, class and section; every page). */
  const exportSearch = new URLSearchParams(
    Object.entries({ q: query.q, class: query.classId, section: query.sectionId }).filter((e): e is [string, string] => !!e[1])
  ).toString();

  const classesWithStudents = capacity?.classes.filter((c) => c.enrolled > 0).length ?? 0;
  const year = capacity?.academicYear?.name ?? page?.academicYear?.name ?? null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-foreground sm:text-3xl">Students</h1>
            <InfoTip label="What does this page show?">
              The students of the current academic year, with the class and section they sit in this year. Last year's class stays in the student's own page.
            </InfoTip>
          </div>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {year ? `View and manage every student of ${year}.` : "View and manage the students of your school."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WithTip tip="A short explanation of how students, parents and classes fit together.">
            <Button variant="outline" onClick={toggleGuide} aria-pressed={guideOpen}>
              <HelpCircle className="size-4" aria-hidden />
              Guide
            </Button>
          </WithTip>
          {/* The same buttons whether the school has students or not: with nobody yet, Export is where its fields are chosen. */}
          {!noYear && (
            <WithTip
              tip={
                total === 0
                  ? "Choose your school's fields (on / off, mandatory), their headings and order, and see the Excel before it has any students."
                  : active
                    ? "The students this search and class show, as an Excel file. Choose your school's fields (on / off, mandatory), their headings and order, and see it first."
                    : "Every student of this year as an Excel file. Choose your school's fields (on / off, mandatory), their headings and order, and see it first."
              }
            >
              <Link to={{ pathname: "/school/students/export", search: exportSearch }} className={outlineLink}>
                <Download className="size-4" aria-hidden />
                Export
              </Link>
            </WithTip>
          )}
          {!noYear && (
            <WithTip tip="Bring in many students at once from Excel: the sample file or your school's own sheet.">
              <Link to="/school/students/import" className={outlineLink}>
                <FileUp className="size-4" aria-hidden />
                Bulk upload
              </Link>
            </WithTip>
          )}
          {!noYear && (
            <WithTip tip="Opens the admission form: the student, the class and section, a parent and the address, on one page.">
              <Link to="/school/students/new" className={plainLink}>
                <UserPlus className="size-4" aria-hidden />
                Add student
              </Link>
            </WithTip>
          )}
        </div>
      </header>

      {guideOpen && <StudentsGuide onClose={toggleGuide} />}

      {failed && firstLoad ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(failed)?.message ?? "Could not load the students."}</p>
          <Button
            variant="outline"
            onClick={() => {
              void structureRes.refetch();
              void capacityRes.refetch();
              void listRes.refetch();
            }}
          >
            Try again
          </Button>
        </Card>
      ) : firstLoad ? (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-10 rounded-lg" />
          <StudentTableSkeleton />
        </div>
      ) : noYear ? (
        <StudentsNotice
          icon={CalendarX2}
          tone="warning"
          title="Your school has no current academic year yet"
          actions={
            <Link to="/dashboard" className={plainLink}>
              Go to the dashboard
            </Link>
          }
        >
          <p>Students are admitted into a class and section of an academic year, so the year comes first.</p>
          <p>Set it up once on the dashboard (the "Set up your current academic year" card); then come back here.</p>
        </StudentsNotice>
      ) : (
        <>
          <section aria-label="Students at a glance" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard index={0} label="Students" value={total} hint={year ? `In ${year}` : "This year"} icon={GraduationCap} tone="primary" />
            <KpiCard
              index={1}
              label="Classes with students"
              value={classesWithStudents}
              hint={`Of ${structure.classes.length} class${structure.classes.length === 1 ? "" : "es"}`}
              icon={FolderTree}
              tone="success"
            />
            <KpiCard
              index={2}
              label="Seats left"
              value={capacity.totals.seatsLeft}
              hint={capacity.totals.seats > 0 ? `Of ${capacity.totals.seats} seats in sections` : "Set seats on your sections"}
              icon={Armchair}
              tone="warning"
            />
            <KpiCard index={3} label="Full sections" value={capacity.totals.fullSections} hint="One more asks first" icon={ShieldAlert} tone="danger" />
          </section>

          {structure.classes.length === 0 ? (
            <StudentsNotice
              icon={FolderTree}
              tone="success"
              title="Add your classes first"
              actions={
                <Link to="/school/classes" className={plainLink}>
                  Open Classes & Sections
                </Link>
              }
            >
              <p>A student is admitted into a class (and a section, if the class is split into sections).</p>
              <p>Your school has no classes yet: create them in Classes & Sections, then Add your first student here.</p>
            </StudentsNotice>
          ) : total === 0 ? (
            <StudentsNotice
              icon={UsersRound}
              tone="primary"
              title="No students yet"
              actions={
                <>
                  <Link to="/school/students/new" className={plainLink}>
                    <UserPlus className="size-4" aria-hidden />
                    Add your first student
                  </Link>
                  <Link to="/school/classes" className={outlineLink}>
                    <FolderTree className="size-4" aria-hidden />
                    Check your classes and sections
                  </Link>
                </>
              }
            />
          ) : (
            <section aria-label="Find and read the students" className="space-y-4">
              <StudentToolbar filters={filters} active={active} structure={structure} capacity={capacity} onChange={change} onClear={clear} />

              {page.items.length === 0 ? (
                <StudentsNotice
                  icon={SearchX}
                  tone="navy"
                  title="Nobody matches"
                  actions={
                    <Button variant="outline" onClick={clear}>
                      Clear the search and the class
                    </Button>
                  }
                >
                  <p>No student of this year matches {filters.q ? `"${filters.q}"` : "these filters"}.</p>
                </StudentsNotice>
              ) : filters.view === "table" ? (
                <StudentTable students={page.items} loading={listRes.isFetching} />
              ) : (
                <ul
                  aria-label="Students"
                  aria-busy={listRes.isFetching || undefined}
                  className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", listRes.isFetching && "opacity-70 transition-opacity")}
                >
                  {page.items.map((student, index) => (
                    <StudentCard key={student.id} student={student} index={index} />
                  ))}
                </ul>
              )}

              <StudentPager page={page} limit={filters.limit} onPage={(p) => change({ page: p })} onLimit={(limit) => change({ limit })} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
