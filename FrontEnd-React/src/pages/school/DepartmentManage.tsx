import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Archive, ArrowLeft, MousePointerClick, Plus, X } from "lucide-react";
import { TONES } from "../../constants/tones";
import { useClassFilters } from "../../hooks/useClassFilters";
import { useDeactivateDepartmentMutation, useGetClassesQuery, useGetStructureQuery } from "../../redux/api/academicsApi";
import { getApiError } from "../../utils/apiErrors";
import { NO_DEPARTMENT, plural, toneOf } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import { AddClassBar } from "../../components/classes/department/AddClassBar";
import { ClassDetail } from "../../components/classes/department/ClassDetail";
import { ClassFilters } from "../../components/classes/department/ClassFilters";
import { DepartmentHeader } from "../../components/classes/department/DepartmentHeader";
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
 * Top to bottom: a plain header (as on the Students page) with the department's name (a small pencil beside it renames it or makes it inactive),
 * what is in it (classes, sections, seats) and the neighbouring departments; one bar
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
  const [deactivateDepartment] = useDeactivateDepartmentMutation();
  const [deactivating, setDeactivating] = useState(false);
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
        <h1 className="text-page-heading">This department is not in your school</h1>
        <p className="max-w-md text-sm text-foreground-muted">It may be inactive (you can make it active again on the Classes &amp; Sections page), or the address is not right.</p>
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
  // The same colour as this department's heading on the list page (the class list's header keeps it), and what is in it.
  const t = TONES[toneOf(structure, department?.id ?? null)];
  const inHere = structure.classes.filter((c) => (loose ? !c.departmentId : c.departmentId === department?.id));
  const sectionCount = inHere.reduce((sum, c) => sum + c.sections.length, 0);
  const seatCount = inHere.reduce((sum, c) => sum + (c.capacity ?? 0), 0);
  // The classes made inactive stay in the list below; the header counts the active ones and says how many are inactive.
  const inactiveHere = (structure.inactiveClasses ?? []).filter((c) => (loose ? !c.departmentId : c.departmentId === department?.id)).length;
  const facts = [plural(inHere.length, "class"), plural(sectionCount, "section"), ...(seatCount > 0 ? [plural(seatCount, "seat")] : []), ...(inactiveHere > 0 ? [`${inactiveHere} inactive`] : [])];

  return (
    <div className="space-y-5">
      <DepartmentHeader
        title={title}
        facts={facts}
        backTo="/school/classes"
        backLabel="Classes & Sections"
        previous={previous && { name: previous.name, to: pathTo(previous)! }}
        next={next && { name: next.name, to: pathTo(next)! }}
        action={department && <DepartmentSettings key={department.id} department={department} structure={structure} onDeactivate={() => setDeactivating(true)} />}
      />

      <ClassFilters filters={filters} active={active} onChange={change} onClear={clear} />

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
                onMoved={() => change({ selected: selectedId })}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <MousePointerClick className="size-6" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-foreground">Pick a class from the list</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {deactivating && department && (
        <ConfirmModal
          title={`Make ${department.name} inactive?`}
          confirmLabel="Make inactive"
          icon={Archive}
          tone="primary"
          onClose={() => setDeactivating(false)}
          onConfirm={async () => {
            await deactivateDepartment(department.id).unwrap();
            push("success", `${department.name} is inactive`);
            navigate("/school/classes");
          }}
        >
          <p>It will no longer be offered when you add a class. Nothing is deleted, and you can make it active again from the Inactive list on the Classes &amp; Sections page.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
