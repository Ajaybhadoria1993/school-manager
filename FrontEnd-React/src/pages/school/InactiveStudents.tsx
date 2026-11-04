import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, Search, UserCheck, UserX, X } from "lucide-react";
import { useGetInactiveQuery, useReactivateStudentsMutation } from "../../redux/api/studentsApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { formatMobile, formatMoment, placeLabel } from "../../utils/students";
import type { InactiveStudent } from "../../types";
import { StudentAvatar } from "../../components/students/StudentAvatar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { PlacementDialog } from "../../components/students/status/PlacementDialog";
import { StudentStatusTabs } from "../../components/students/status/StudentStatusTabs";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const TH = "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted";
const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/** The class the student was in, as the list writes it ("Class 5 - A"). */
const where = (s: InactiveStudent) => (s.className ? placeLabel({ className: s.className, sectionName: s.sectionName }) : "No class");

/**
 * Manage school > Students > Inactive students (`/school/students/inactive`): the students who left the school (or were taken out by
 * mistake), kept whole. Each row says who made the student inactive, when and why, and the name opens their page, so their details are
 * there whenever they are needed. **Make active** (one, or every ticked one) puts a student back in their class and section with one
 * click. Nothing is ever deleted. One read of the list; each action is one request, and the lists, the seats and the students' pages
 * are read again where they are on screen.
 */
export default function InactiveStudentsPage() {
  const { push } = useToast();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Students who have no class in the running year (they left earlier) are asked where to put them first.
  const [placing, setPlacing] = useState<InactiveStudent[] | null>(null);

  const listRes = useGetInactiveQuery({ q: q || undefined, page, limit: 20 });
  const [reactivate] = useReactivateStudentsMutation();
  const data = listRes.data?.data;
  const items = data?.items ?? [];
  const chosen = items.filter((s) => ticked.has(s.id));

  // The search waits until typing stops, so a burst of typing is one request.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const toggle = (id: string) =>
    setTicked((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function makeActive(students: InactiveStudent[]) {
    if (students.some((s) => s.className === null)) {
      setPlacing(students);
      return;
    }
    setWorking(true);
    setProblem(null);
    try {
      const res = await reactivate({ ids: students.map((s) => s.id) }).unwrap();
      const lost = res.data.rollNumbersLost ?? 0;
      push("success", `${res.message ?? "Active again"}${lost > 0 ? `. ${lost} came back without a roll number (someone else has it now).` : ""}`);
      setTicked(new Set());
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not make them active. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Inactive students" subtitle="Students who left the school. Their record is kept: make them active again whenever they return." />
      <StudentStatusTabs />

      {problem && <p className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{problem}</p>}

      {listRes.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" aria-busy="true" />
      ) : listRes.error && !data ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(listRes.error)?.message ?? "Could not load the inactive students."}</p>
          <Button variant="outline" onClick={() => listRes.refetch()}>
            Try again
          </Button>
        </Card>
      ) : data && data.total === 0 && !q ? (
        <StudentsNotice
          icon={UserX}
          tone="navy"
          title="No inactive students"
          actions={
            <Link to="/school/students" className={outlineLink}>
              Back to the active students
            </Link>
          }
        >
          <p>When a student leaves, tick them in the Active students list and choose Make inactive. They wait here, whole, and can come back with one click.</p>
        </StudentsNotice>
      ) : (
        <section aria-label="Inactive students" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full sm:max-w-sm">
              <Input aria-label="Search the inactive students" icon={Search} placeholder="Search by name or admission number" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            {chosen.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft/60 px-3 py-2">
                <p className="text-sm font-semibold text-primary-deep">{chosen.length} selected</p>
                <Button variant="outline" size="sm" onClick={() => setTicked(new Set())}>
                  <X className="size-4" aria-hidden />
                  Clear
                </Button>
                <Button size="sm" loading={working} onClick={() => void makeActive(chosen)}>
                  <UserCheck className="size-4" aria-hidden />
                  Make selected active
                </Button>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <StudentsNotice icon={Search} tone="navy" title="Nobody matches">
              <p>No inactive student matches &quot;{q}&quot;.</p>
            </StudentsNotice>
          ) : (
            <div className={cn("overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card transition-opacity", listRes.isFetching && "opacity-70")}>
              <table className="w-full border-collapse text-sm" aria-label="Inactive students">
                <thead className="border-b border-border bg-background">
                  <tr>
                    <th scope="col" className="w-10 pl-4">
                      <input
                        type="checkbox"
                        aria-label="Select all students on this page"
                        checked={chosen.length > 0 && chosen.length === items.length}
                        ref={(el) => {
                          if (el) el.indeterminate = chosen.length > 0 && chosen.length < items.length;
                        }}
                        onChange={(e) => setTicked(e.target.checked ? new Set(items.map((s) => s.id)) : new Set())}
                        className="size-4 cursor-pointer accent-primary"
                      />
                    </th>
                    <th scope="col" className={TH}>
                      Student
                    </th>
                    <th scope="col" className={cn(TH, "hidden md:table-cell")}>
                      Was in
                    </th>
                    <th scope="col" className={cn(TH, "hidden lg:table-cell")}>
                      Parent
                    </th>
                    <th scope="col" className={cn(TH, "hidden md:table-cell")}>
                      Inactive since
                    </th>
                    <th scope="col" className={cn(TH, "text-right")}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id} className={cn("border-t border-surface-muted first:border-t-0", ticked.has(s.id) && "bg-primary-soft/40")}>
                      <td className="w-10 pl-4 align-middle">
                        <input type="checkbox" aria-label={`Select ${s.name}`} checked={ticked.has(s.id)} onChange={() => toggle(s.id)} className="size-4 cursor-pointer accent-primary" />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-3">
                          <StudentAvatar name={s.name} seed={s.admissionNumber} size="sm" />
                          <div className="min-w-0">
                            <Link to={`/school/students/${s.id}`} className="block truncate font-bold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                              {s.name}
                            </Link>
                            <span className="block truncate font-mono text-xs font-semibold text-foreground-muted">{s.admissionNumber}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 align-middle md:table-cell">
                        <span className="block text-sm font-semibold text-foreground">{where(s)}</span>
                        {s.rollNumber != null && <span className="block text-xs text-foreground-muted">Roll {s.rollNumber}</span>}
                      </td>
                      <td className="hidden max-w-[16rem] px-4 py-3 align-middle lg:table-cell">
                        {s.parentName ? (
                          <>
                            <span className="block truncate text-sm font-semibold text-foreground">{s.parentName}</span>
                            {s.parentMobile && <span className="block text-xs text-foreground-muted">{formatMobile(s.parentMobile)}</span>}
                          </>
                        ) : (
                          <span className="text-foreground-muted">No parent</span>
                        )}
                      </td>
                      <td className="hidden max-w-[16rem] px-4 py-3 align-middle md:table-cell">
                        <span className="block text-sm font-semibold text-foreground">{formatMoment(s.inactiveAt)}</span>
                        <span className="block truncate text-xs text-foreground-muted">
                          by {s.inactiveBy.name}
                          {s.reason ? ` · ${s.reason}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <Button variant="outline" size="sm" disabled={working} aria-label={`Make ${s.name} active`} onClick={() => void makeActive([s])}>
                          <UserCheck className="size-4" aria-hidden />
                          Make active
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.totalPages > 1 && (
            <nav aria-label="Pages of the inactive students" className="flex items-center justify-between gap-3 text-sm text-foreground-muted">
              <span aria-live="polite">
                Page {data.page} of {data.totalPages} · {data.total} students
              </span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" className="px-2.5" aria-label="Previous page" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <Button variant="outline" className="px-2.5" aria-label="Next page" disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)}>
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            </nav>
          )}
        </section>
      )}
      {placing && <PlacementDialog students={placing} onClose={() => setPlacing(null)} onDone={() => setTicked(new Set())} />}
    </div>
  );
}
