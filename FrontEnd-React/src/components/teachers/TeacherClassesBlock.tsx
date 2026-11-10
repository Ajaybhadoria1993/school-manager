import { School, X } from "lucide-react";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { TONES } from "../../constants/tones";
import { useAssignTeacherMutation, useGetTeacherClassesQuery, useSetClassTeacherMutation } from "../../redux/api/timetableApi";
import type { Teacher } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

const removeButton =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30";

/**
 * The classes a teacher has been given, on their page: the sections they are the class teacher of, and each subject of a class they
 * teach (the timetable's list). A cross takes one away in one click (the subject stays with the class, without a teacher). **Assign
 * class** opens the window that gives one (`onAssign`).
 */
export function TeacherClassesBlock({ teacher, onAssign, index = 0, canChange = true }: { teacher: Teacher; onAssign: () => void; index?: number; canChange?: boolean }) {
  const res = useGetTeacherClassesQuery(teacher.id);
  const [assign] = useAssignTeacherMutation();
  const [setClassTeacher] = useSetClassTeacherMutation();
  const { push } = useToast();
  // A year that is over is only looked at: nothing is given or taken away.
  // A person who may see the teacher but not change them (Permissions) only reads what they have been given.
  const readOnly = useReadOnlyYear() || !canChange;
  const classes = res.data?.data;
  const t = TONES.info;

  const failed = (err: unknown) => push("error", getApiError(err)?.message ?? "Could not save. Please try again.");

  return (
    <Card role="region" aria-label="Classes" className="stagger-item relative overflow-hidden p-5" style={{ "--i": index } as React.CSSProperties}>
      <div aria-hidden className={cn("pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br to-transparent blur-2xl", t.glow)} />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-section-heading flex items-center gap-2.5">
          <span aria-hidden className={cn("flex size-9 items-center justify-center rounded-xl", t.gradient)}>
            <School className="size-4.5" />
          </span>
          Classes
        </h2>
        {teacher.isActive && !readOnly && (
          <Button variant="outline" size="sm" onClick={onAssign}>
            <School className="size-4" aria-hidden />
            Assign class
          </Button>
        )}
      </div>

      {res.error && !classes ? (
        <div className="relative mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the classes."}</p>
          <Button variant="outline" size="sm" onClick={() => res.refetch()}>
            Try again
          </Button>
        </div>
      ) : !classes ? (
        <Skeleton className="relative mt-4 h-16 rounded-xl" />
      ) : (
        <div className="relative mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Class teacher of</p>
            {classes.classTeacherOf.length === 0 ? (
              <p className="text-sm text-foreground-muted">None</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {classes.classTeacherOf.map((u) => (
                  <li key={`${u.classId}:${u.sectionId}`} aria-label={`Class teacher of ${u.label}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary-soft pl-2.5 pr-1 text-sm font-semibold text-primary-deep ring-1 ring-inset ring-primary/20">
                    {u.label}
                    {!readOnly && (
                    <button
                      type="button"
                      aria-label={`${teacher.name} is no longer the class teacher of ${u.label}`}
                      title="Take away"
                      className={removeButton}
                      onClick={() =>
                        void setClassTeacher({ classId: u.classId, sectionId: u.sectionId, teacherId: null })
                          .unwrap()
                          .then(() => push("success", `${u.label} has no class teacher now`), failed)
                      }
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Teaches</p>
            {classes.subjects.length === 0 ? (
              <p className="text-sm text-foreground-muted">Nothing yet</p>
            ) : (
              <ul className="divide-y divide-border/70 rounded-xl border border-border">
                {classes.subjects.map((s) => (
                  <li key={`${s.classId}:${s.sectionId}:${s.subjectId}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 text-sm font-semibold text-foreground">{`${s.label} · ${s.subjectName} · ${s.periodsPerWeek} period${s.periodsPerWeek === 1 ? "" : "s"} a week`}</span>
                    {teacher.isActive && !readOnly && (
                      <button
                        type="button"
                        aria-label={`Take ${s.subjectName} of ${s.label} away from ${teacher.name}`}
                        title="Take away"
                        className={removeButton}
                        onClick={() =>
                          void assign({ classId: s.classId, sectionId: s.sectionId, subjectId: s.subjectId, teacherId: null })
                            .unwrap()
                            .then(() => push("success", `${s.subjectName} of ${s.label} has no teacher now`), failed)
                        }
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
