import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Armchair, ArrowLeft, FolderTree, Layers, MousePointerClick, Plus, Rows3, X } from "lucide-react";
import { TONES } from "../../constants/tones";
import { useClassFilters } from "../../hooks/useClassFilters";
import { useDeleteDepartmentMutation, useGetClassesQuery, useGetStructureQuery } from "../../redux/api/academicsApi";
import { getApiError } from "../../utils/apiErrors";
import { NO_DEPARTMENT, departmentIcon, plural, toneOf } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import { AddClassBar } from "../../components/classes/department/AddClassBar";
import { ClassDetail } from "../../components/classes/department/ClassDetail";
import { ClassFilters } from "../../components/classes/department/ClassFilters";
import { DepartmentHero } from "../../components/classes/department/DepartmentHero";
import { ClassList } from "../../components/classes/department/ClassList";
import { DepartmentSettings } from "../../components/classes/department/DepartmentSettings";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const pathTo = (d: { id: string } | undefined) => (d ? `/school/classes/departments/${d.id}` : null);

/**
 * Manage school > Classes & Sections > one department (`/school/classes/departments/:departmentId`), or, with `none` in the
 * address, the classes that are in no department. It is for changing what exists; a new department is made on the list page.
 * Top to bottom: a heading in the department's own colour with its name (a small pencil beside it renames or deletes it), what is in
 * it (classes, sections, seats) and the neighbouring departments; one bar
 * with the search and the sort; then the classes of this department on the left, a page at a time (the server does the searching,
 * sorting and paging, see `GET /academics/classes`), and the class that is picked on the right, with its name, its department and
 * its sections, all editable and none of it needing Save. A class is added with the small button above the list. The search and
 * the picked class live in the address.
 */
export default function DepartmentManagePage() {
  const { departmentId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const detail = useRef<HTMLDivElement>(null);
  const { data: res, error, isFetching, refetch } = useGetStructureQuery();
  const [deleteDepartment] = useDeleteDepartmentMutation();
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);

  const structure = res?.data;
  const loose = departmentId === NO_DEPARTMENT;
  const index = structure?.departments.findIndex((d) => d.id === departmentId) ?? -1;
  const department = structure && index >= 0 ? structure.departments[index] : null;
  const known = !!structure && (loose || !!department);

  const { filters, query, active, change, clear } = useClassFilters(departmentId ?? NO_DEPARTMENT);
  const { data: classes, isFetching: loadingClasses, error: classesError } = useGetClassesQuery(query, { skip: !known });
  const pageOfClasses = classes?.data;

  const loading = !res && (isFetching || !error);
  const loadError = error ? (getApiError(error)?.message ?? "Could not load your classes.") : null;
  // The class on the right: the one picked, else the first of the list (like opening the first patient).
  const selectedId = filters.selected ?? pageOfClasses?.items[0]?.id ?? null;

  function select(id: string) {
    change({ selected: id });
    // On a phone the class opens below the list: bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-12 w-1/2 rounded-xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (loadError || !structure) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">{loadError}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!known) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <h1 className="text-lg font-bold text-foreground">This department is not in your school</h1>
        <p className="max-w-md text-sm text-foreground-muted">It may have been deleted, or the address is not right.</p>
        <Link
          to="/school/classes"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to Classes &amp; Sections
        </Link>
      </Card>
    );
  }

  const title = department?.name ?? "Other classes";
  const previous = loose ? undefined : structure.departments[index - 1];
  const next = loose ? undefined : structure.departments[index + 1];
  // The same colour and icon as this department's heading on the list page, and what is in it.
  const t = TONES[toneOf(structure, department?.id ?? null)];
  const HeadingIcon = department ? departmentIcon(department.name) : Layers;
  const inHere = structure.classes.filter((c) => (loose ? !c.departmentId : c.departmentId === department?.id));
  const sectionCount = inHere.reduce((sum, c) => sum + c.sections.length, 0);
  const seatCount = inHere.reduce((sum, c) => sum + c.sections.reduce((seats, s) => seats + (s.capacity ?? 0), 0), 0);
  const facts = [
    { icon: FolderTree, text: plural(inHere.length, "class") },
    { icon: Rows3, text: plural(sectionCount, "section") },
    ...(seatCount > 0 ? [{ icon: Armchair, text: `${seatCount} seats` }] : []),
  ];

  return (
    <div className="space-y-5">
      <DepartmentHero
        title={title}
        icon={HeadingIcon}
        tone={toneOf(structure, department?.id ?? null)}
        facts={facts}
        backTo="/school/classes"
        backLabel="Classes & Sections"
        previous={previous && { name: previous.name, to: pathTo(previous)! }}
        next={next && { name: next.name, to: pathTo(next)! }}
        action={department && <DepartmentSettings key={department.id} department={department} structure={structure} onDark onDelete={() => setDeleting(true)} />}
      />

      <Card className="p-4">
        <ClassFilters filters={filters} active={active} onChange={change} onClear={clear} />
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[23rem_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className={cn("flex items-center justify-between gap-3 bg-gradient-to-r to-transparent px-4 py-3", t.wash)}>
            <h2 className="text-sm font-bold text-foreground" aria-live="polite">
              {pageOfClasses ? plural(pageOfClasses.total, "class") : "Classes"}
            </h2>
            <Button size="sm" variant={adding ? "ghost" : "outline"} aria-expanded={adding} onClick={() => setAdding((open) => !open)}>
              {adding ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              {adding ? "Done" : "Add class"}
            </Button>
          </div>
          {adding && (
            <div className="fade-in border-t border-border bg-background/60 px-4 py-3">
              <AddClassBar key={department?.id ?? NO_DEPARTMENT} department={department} structure={structure} autoFocus />
            </div>
          )}
          {classesError && !pageOfClasses ? (
            <p className="border-t border-border px-5 py-8 text-center text-sm text-danger">
              {getApiError(classesError)?.message ?? "Could not load the classes."}
            </p>
          ) : (
            <div className={loadingClasses && pageOfClasses ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <ClassList
                page={pageOfClasses}
                loading={loadingClasses}
                structure={structure}
                selectedId={selectedId}
                limit={filters.limit}
                onSelect={select}
                onPage={(page) => change({ page })}
                onLimit={(limit) => change({ limit })}
              />
            </div>
          )}
        </Card>

        <div ref={detail} className="scroll-mt-4">
          <Card className="min-h-[24rem] overflow-hidden">
            {selectedId ? (
              <ClassDetail
                key={selectedId}
                classId={selectedId}
                structure={structure}
                onGone={() => change({ selected: null })}
                onMoved={() => change({ selected: selectedId })}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <MousePointerClick className="size-6" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-foreground">Pick a class to see and change it</p>
                <p className="max-w-xs text-sm text-foreground-muted">
                  Its name, its department and every section with its seats and room open here.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {deleting && department && (
        <ConfirmModal
          title={`Delete ${department.name}?`}
          confirmLabel="Delete department"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await deleteDepartment(department.id).unwrap();
            push("success", `${department.name} deleted`);
            navigate("/school/classes");
          }}
        >
          <p>
            Only the heading is deleted.{" "}
            {department.classCount > 0
              ? `Its ${plural(department.classCount, "class")} stay${department.classCount === 1 ? "s" : ""} in your school, in no department.`
              : "It has no classes."}
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
