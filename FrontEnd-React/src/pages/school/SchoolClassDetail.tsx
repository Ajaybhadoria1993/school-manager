import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, CalendarDays, Download, FolderTree, MousePointerClick, NotebookPen, Search, SearchX, UserPlus, UserRound, UsersRound } from "lucide-react";
import { STUDENT_PAGE_SIZES } from "../../constants/students";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetClassOverviewQuery, useGetStudentsQuery } from "../../redux/api/studentsApi";
import { plural, toneOf } from "../../utils/academics";
import { getApiError } from "../../utils/apiErrors";
import { admitLink } from "../../utils/students";
import { ALL_SECTIONS, SectionPicker } from "../../components/schoolClass/SectionPicker";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentPager } from "../../components/students/StudentPager";
import { StudentTable, StudentTableSkeleton } from "../../components/students/StudentTable";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";

const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const arrowLink =
  "inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted shadow-sm transition-all hover:border-[#cbd5e1] hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * One class of School Class (`/school-class/:classId`), in the same plain look as the other pages: the name and numbers of the class, the
 * classes before and after it, a card for each section, and the students. A class split into sections **asks which section first**:
 * the students appear once a section (or All sections) is picked, so the page never lists a whole class by accident. A class without
 * sections shows its students at once. The picked section (`?section=`, "all" for everyone), the search, the page and the page size are
 * in the address. The numbers and sections of the class come from the server (`/students/class-overview?classId=`), the students from
 * `/students`, filtered by the server; picking a section or searching asks only for the students. The class teacher is named beside the
 * title (N/A when there is none); **Timetable & teachers** opens the class's own week, timing and teachers (2026-11-04: the teachers box
 * that was on this page moved there).
 */
export default function SchoolClassDetailPage() {
  // A year that is over is only looked at: no Add student (the server refuses it too).
  const readOnly = useReadOnlyYear();
  const { classId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const structureRes = useGetStructureQuery();
  const overviewRes = useGetClassOverviewQuery({ classId });
  const structure = structureRes.data?.data;
  const overview = overviewRes.data?.data.classes[0];

  const hasSections = (overview?.sections.length ?? 0) > 0;
  // "" while nothing is chosen, "all" for the whole class, or one of this class's sections (a wrong id in the address is nothing chosen).
  const wanted = params.get("section") ?? "";
  const picked = wanted === ALL_SECTIONS ? ALL_SECTIONS : (overview?.sections.find((s) => s.id === wanted)?.id ?? "");
  const section = overview?.sections.find((s) => s.id === picked);
  const showStudents = !!overview && (!hasSections || picked !== "");
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limitParam = Number(params.get("limit"));
  const limit = (STUDENT_PAGE_SIZES as readonly number[]).includes(limitParam) ? limitParam : STUDENT_PAGE_SIZES[0];

  const listRes = useGetStudentsQuery(
    { classId, ...(section ? { sectionId: section.id } : {}), ...(q.trim() ? { q: q.trim() } : {}), page, limit },
    { skip: !showStudents }
  );
  const list = listRes.data?.data;

  // The search box waits until typing stops (300 ms), so a burst of typing is one request; a link or Back shows what the address says.
  const [text, setText] = useState(q);
  const typing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!typing.current) setText(q);
  }, [q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Changes some words of the address; a change to what is listed goes back to the first page. */
  function change(patch: Record<string, string>, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === "" || (key === "limit" && Number(value) === STUDENT_PAGE_SIZES[0]) || (key === "page" && value === "1")) next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage && !("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  }
  const sectionTo = (value: string) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    next.set("section", value);
    return `/school-class/${classId}?${next.toString()}`;
  };

  const failed = overviewRes.error ?? structureRes.error;
  if (failed && !overview) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">{getApiError(failed)?.message ?? "Could not load the class."}</p>
        <Button
          variant="outline"
          onClick={() => {
            void overviewRes.refetch();
            void structureRes.refetch();
          }}
        >
          Try again
        </Button>
      </Card>
    );
  }
  if (!overview || !structure) {
    // The server answered with no such class: it is not this school's (or was removed).
    if (overviewRes.data && !overviewRes.data.data.classes[0]) {
      return (
        <StudentsNotice
          icon={FolderTree}
          tone="navy"
          title="This class is not in your school"
          actions={
            <Link to="/school-class" className={outlineLink}>
              Back to Classes
            </Link>
          }
        >
          <p>The link may be old, or the class was removed. Pick a class from the list.</p>
        </StudentsNotice>
      );
    }
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const tone = toneOf(structure, overview.departmentId);
  const at = structure.classes.findIndex((c) => c.id === classId);
  const before = at > 0 ? structure.classes[at - 1] : undefined;
  const after = at >= 0 && at < structure.classes.length - 1 ? structure.classes[at + 1] : undefined;
  const where = section ? `${overview.name} - ${section.name}` : overview.name;
  const exportSearch = new URLSearchParams({ class: classId, ...(section ? { section: section.id } : {}) }).toString();
  const headTeacher = section ? section.classTeacher : overview.classTeacher;
  // Only this class's timetable, timing and teachers (on the picked section; a class with sections opens on its first one).
  const timetableTo = `/school-class/${classId}/timetable${section ? `?section=${section.id}` : ""}`;

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title={overview.name}
        subtitle={[
          plural(overview.students, "student"),
          hasSections ? plural(overview.sections.length, "section") : "no sections",
          overview.seats > 0 ? `${overview.seatsLeft} of ${overview.seats} seats left` : null,
          overview.departmentName,
        ]
          .filter(Boolean)
          .join(" · ")}
        crumbs={[{ label: "Classes", to: "/school-class" }]}
        info={
          // The class teacher of the class (no sections) or of the picked section; with no section picked each section's card says its own.
          !hasSections || section ? (
            <Badge tone={headTeacher ? "primary" : "neutral"} className="gap-1.5">
              <UserRound className="size-3.5" aria-hidden />
              Class teacher: {headTeacher?.name ?? "N/A"}
            </Badge>
          ) : undefined
        }
        actions={
          <>
            {before && (
              <Link to={`/school-class/${before.id}`} aria-label={`Previous class: ${before.name}`} title={before.name} className={arrowLink}>
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            )}
            {after && (
              <Link to={`/school-class/${after.id}`} aria-label={`Next class: ${after.name}`} title={after.name} className={arrowLink}>
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
            <Link to={timetableTo} className={outlineLink}>
              <CalendarDays className="size-4" aria-hidden />
              Timetable &amp; teachers
            </Link>
            {(!hasSections || section) && (
              // The class's attendance, diary and tests (docs/parent-teacher-flow.md), for the people who run the school.
              <Link to={`/class-work/${classId}${section ? `?section=${section.id}` : ""}`} className={outlineLink}>
                <NotebookPen className="size-4" aria-hidden />
                Class work
              </Link>
            )}
            <Link to={{ pathname: "/school/students/export", search: exportSearch }} className={outlineLink}>
              <Download className="size-4" aria-hidden />
              Export
            </Link>
            {!readOnly && (
              <Link to={admitLink({ classId, sectionId: section?.id })} className={plainLink}>
                <UserPlus className="size-4" aria-hidden />
                Add student
              </Link>
            )}
          </>
        }
      />

      {hasSections && <SectionPicker overview={overview} tone={tone} picked={picked} to={sectionTo} />}

      {!showStudents ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
          <MousePointerClick className="size-6 text-foreground-muted" aria-hidden />
          <h2 className="text-base font-bold text-foreground">Which section&apos;s students?</h2>
          <p className="max-w-md text-sm text-foreground-muted">
            {overview.name} has {plural(overview.sections.length, "section")}. Pick one above to see its students, or All sections to see the whole class.
          </p>
        </div>
      ) : (
        <section aria-label={`Students of ${where}`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Students of {where}
              {list && <span className="ml-2 text-sm font-semibold text-foreground-muted">{list.total}</span>}
            </h2>
            <div className="w-full sm:max-w-xs">
              <Input
                aria-label={`Search the students of ${where}`}
                icon={Search}
                maxLength={60}
                placeholder="Search by name or admission number"
                value={text}
                onFocus={() => (typing.current = true)}
                onBlur={() => (typing.current = false)}
                onChange={(e) => {
                  setText(e.target.value);
                  window.clearTimeout(timer.current);
                  timer.current = window.setTimeout(() => change({ q: e.target.value }), 300);
                }}
              />
            </div>
          </div>

          {listRes.error && !list ? (
            <Card className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-danger">{getApiError(listRes.error)?.message ?? "Could not load the students."}</p>
              <Button variant="outline" onClick={() => listRes.refetch()}>
                Try again
              </Button>
            </Card>
          ) : !list ? (
            <StudentTableSkeleton />
          ) : list.items.length === 0 ? (
            q.trim() ? (
              <StudentsNotice
                icon={SearchX}
                tone="navy"
                title="Nobody matches"
                actions={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setText("");
                      change({ q: "" });
                    }}
                  >
                    Clear the search
                  </Button>
                }
              >
                <p>
                  No student of {where} matches &quot;{q.trim()}&quot;.
                </p>
              </StudentsNotice>
            ) : (
              <StudentsNotice
                icon={UsersRound}
                tone={tone}
                title={`No students in ${where} yet`}
                actions={
                  readOnly ? undefined : (
                    <Link to={admitLink({ classId, sectionId: section?.id })} className={plainLink}>
                      <UserPlus className="size-4" aria-hidden />
                      Add a student
                    </Link>
                  )
                }
              >
                <p>Admit a student into this {section ? "section" : "class"} and they will be listed here.</p>
              </StudentsNotice>
            )
          ) : (
            <>
              <StudentTable students={list.items} loading={listRes.isFetching} />
              <StudentPager page={list} limit={limit} onPage={(p) => change({ page: String(p) }, true)} onLimit={(l) => change({ limit: String(l) })} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
