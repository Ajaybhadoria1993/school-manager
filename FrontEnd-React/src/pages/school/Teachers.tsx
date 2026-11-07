import { useState } from "react";
import { Link } from "react-router";
import { CalendarDays, FileUp, ListPlus, LogOut, Pencil, Plus, Repeat2, RotateCcw, Search, UsersRound } from "lucide-react";
import { DAY_SHORT } from "../../constants/timetable";
import { useGetSubjectsQuery, useGetTeachersQuery, useUpdateTeacherMutation } from "../../redux/api/timetableApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import type { Teacher } from "../../types";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { ExportTeachersButton } from "../../components/teachers/ExportTeachersButton";
import { LeaveTeacherModal } from "../../components/teachers/LeaveTeacherModal";
import { ReplaceTeacherDialog } from "../../components/teachers/ReplaceTeacherDialog";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const linkClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * Manage school > Manage Teacher (`/school/teachers`): the people who teach, what they can teach, what they were given this year, the days
 * they do not come and who can sign in. A teacher is added on a page of its own (`/school/teachers/new`) and opened from the name. A
 * teacher who has left is made inactive (never deleted: old timetables say who taught) and their login closes with it; their classes
 * can be given to another teacher in one step.
 */
export default function TeachersPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const typed = useDebouncedValue(search.trim(), 300);
  const res = useGetTeachersQuery({ status, ...(typed ? { search: typed } : {}) });
  const subjectNames = new Map((useGetSubjectsQuery("all").data?.data.items ?? []).map((s) => [s.id, s.name]));
  const [update] = useUpdateTeacherMutation();
  const [replacing, setReplacing] = useState<Teacher | null>(null);
  const [leaving, setLeaving] = useState<Teacher | null>(null);

  const teachers = res.data?.data.items ?? [];
  // The teachers a school already has can come in from Excel (the students' Bulk upload, for teachers).
  const bulkLink = (
    <Link to="/school/teachers/import" className={cn(linkClass, "h-10 gap-2 px-4")}>
      <FileUp className="size-4" aria-hidden />
      Bulk upload
    </Link>
  );
  const addLink = (
    <Link to="/school/teachers/new" className={primaryLink}>
      <Plus className="size-4" aria-hidden />
      Add teacher
    </Link>
  );

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Manage Teacher" crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        actions={
          <>
            <Link to="/school/teachers/fields" className={cn(linkClass, "h-10 gap-2 px-4")}>
              <ListPlus className="size-4" aria-hidden />
              Fields
            </Link>
            <ExportTeachersButton query={{ status, ...(typed ? { search: typed } : {}) }} empty={teachers.length === 0} />
            {bulkLink}
            {addLink}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Which teachers to show" className="flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
          {(["active", "inactive"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={status === v}
              onClick={() => setStatus(v)}
              className={cn("h-8 cursor-pointer rounded-lg px-3 text-sm font-semibold transition-colors", status === v ? "bg-primary-soft text-primary-deep" : "text-foreground-muted hover:text-foreground")}
            >
              {v === "active" ? "Teaching" : "Left"}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
          <Input aria-label="Search teachers" placeholder="Search by name, mobile or code" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {res.isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : res.error && !res.data ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the teachers."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>
            Try again
          </Button>
        </Card>
      ) : teachers.length === 0 ? (
        typed || status === "inactive" ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-sm text-foreground-muted">{typed ? "No teacher matches." : "No teacher has left."}</p>
        ) : (
          <StudentsNotice
            icon={UsersRound}
            tone="primary"
            title="No teachers yet"
            actions={
              <>
                {bulkLink}
                {addLink}
              </>
            }
          >
            <p>With your teachers added, no teacher is put in two classes at the same time, and each teacher can sign in.</p>
          </StudentsNotice>
        )
      ) : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                <th scope="col" className="px-4 py-3">Teacher</th>
                <th scope="col" className="px-4 py-3">Can teach</th>
                <th scope="col" className="px-4 py-3">Given this year</th>
                <th scope="col" className="px-4 py-3">Does not come</th>
                <th scope="col" className="px-4 py-3">Login</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <Link to={`/school/teachers/${t.id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                      {t.name}
                    </Link>
                    <p className="text-xs text-foreground-muted">{[t.employeeCode, t.mobile].filter(Boolean).join(" · ") || "No code or mobile"}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground-muted">{t.subjectIds.length === 0 ? "Not said" : t.subjectIds.map((id) => subjectNames.get(id) ?? "A subject").join(", ")}</td>
                  <td className="px-4 py-3 text-foreground-muted">
                    {t.load.sections === 0 ? "Nothing yet" : `${t.load.sections} class${t.load.sections === 1 ? "" : "es"} · ${t.load.periodsAllotted} periods a week`}
                    {t.maxPeriodsPerWeek !== null && t.load.periodsAllotted > t.maxPeriodsPerWeek && <span className="block text-xs font-semibold text-warning">Over their {t.maxPeriodsPerWeek}</span>}
                  </td>
                  <td className="px-4 py-3">{t.offDays.length === 0 ? <span className="text-foreground-muted">Comes every day</span> : <span className="flex flex-wrap gap-1">{t.offDays.map((d) => <Badge key={d}>{DAY_SHORT[d]}</Badge>)}</span>}</td>
                  <td className="px-4 py-3">
                    {t.login ? (
                      <span className={cn("font-mono text-xs", t.login.isActive ? "text-foreground" : "text-foreground-muted line-through")}>{t.login.username}</span>
                    ) : (
                      <span className="text-foreground-muted">No login</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {t.isActive ? (
                        <>
                          <Link to={`/school/timetable/teacher/${t.id}`} className={linkClass} aria-label={`${t.name}'s week`}>
                            <CalendarDays className="size-4" aria-hidden />
                            Week
                          </Link>
                          <Link to={`/school/teachers/${t.id}/edit`} className={linkClass} aria-label={`Change ${t.name}`}>
                            <Pencil className="size-4" aria-hidden />
                            Change
                          </Link>
                          {t.load.sections > 0 ? (
                            <Button variant="ghost" size="sm" onClick={() => setReplacing(t)} aria-label={`Give ${t.name}'s classes to another teacher`}>
                              <Repeat2 className="size-4" aria-hidden />
                              Give classes
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setLeaving(t)} aria-label={`${t.name} has left`}>
                              <LogOut className="size-4" aria-hidden />
                              Has left
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Bring back ${t.name}`}
                          onClick={() => void update({ id: t.id, isActive: true }).unwrap().then(() => push("success", `${t.name} is teaching again`), (err) => push("error", getApiError(err)?.message ?? "Could not bring them back."))}
                        >
                          <RotateCcw className="size-4" aria-hidden />
                          Bring back
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {replacing && <ReplaceTeacherDialog teacher={replacing} onClose={() => setReplacing(null)} />}
      {leaving && <LeaveTeacherModal teacher={leaving} onClose={() => setLeaving(null)} />}
    </div>
  );
}
