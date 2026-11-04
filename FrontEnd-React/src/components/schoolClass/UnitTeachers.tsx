import { useState } from "react";
import { Plus, UsersRound, X } from "lucide-react";
import { MAX_PERIODS_PER_WEEK } from "../../constants/timetable";
import { useAssignTeacherMutation, useGetAllotmentsQuery, useGetSubjectsQuery, useGetTeachersQuery, useSetClassTeacherMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { onlyDigits } from "../../utils/teachers";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

/** "Nobody" in a teacher dropdown (a dropdown cannot show an empty value as picked). */
const NONE = "none";
const twoDigits = onlyDigits(2);

/**
 * The teachers of one section (or of a class without sections), on its School Class page: its class teacher, and each subject it studies
 * with its teacher, each picked from the school's teachers (a pick is saved at once). **Add subject** gives the section another subject,
 * with its periods a week and its teacher. It is the timetable's list: what is picked here is who teaches those periods there.
 */
export function UnitTeachers({ classId, sectionId, label, classTeacher }: { classId: string; sectionId: string | null; label: string; classTeacher: { id: string; name: string } | null }) {
  const teachers = useGetTeachersQuery({ status: "active" }).data?.data.items ?? [];
  const allotments = useGetAllotmentsQuery({ classId, sectionId });
  const subjects = useGetSubjectsQuery("active").data?.data.items ?? [];
  const [setClassTeacher] = useSetClassTeacherMutation();
  const [assign] = useAssignTeacherMutation();
  const { push } = useToast();
  const rows = allotments.data?.data.rows ?? [];
  const nameOf = (id: string) => teachers.find((t) => t.id === id)?.name ?? "The teacher";
  const failed = (err: unknown) => push("error", getApiError(err)?.message ?? "Could not save. Please try again.");
  const key = `${classId}-${sectionId ?? "class"}`;

  // A new subject for the section: which one, how many periods a week, and its teacher (optional).
  const [adding, setAdding] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newPeriods, setNewPeriods] = useState("");
  const [newTeacher, setNewTeacher] = useState(NONE);
  const [tried, setTried] = useState(false);
  const periodCount = Number(newPeriods);
  const newProblems = {
    subject: newSubject === "" ? "Choose a subject" : undefined,
    periods: !Number.isInteger(periodCount) || periodCount < 1 || periodCount > MAX_PERIODS_PER_WEEK ? `1 to ${MAX_PERIODS_PER_WEEK}` : undefined,
  };
  const studied = new Set(rows.map((r) => r.subjectId));

  function closeAdding() {
    setAdding(false);
    setNewSubject("");
    setNewPeriods("");
    setNewTeacher(NONE);
    setTried(false);
  }

  function addSubject() {
    setTried(true);
    if (newProblems.subject || newProblems.periods) return;
    const name = subjects.find((s) => s.id === newSubject)?.name ?? "The subject";
    void assign({ classId, sectionId, subjectId: newSubject, teacherId: newTeacher === NONE ? null : newTeacher, periodsPerWeek: periodCount })
      .unwrap()
      .then(() => {
        push("success", `${name} is added to ${label}`);
        closeAdding();
      }, failed);
  }

  /** "Nobody", then the teachers (the ones who can teach `subjectId` first). The one already picked is always there, even before the list comes. */
  const teacherOptions = (empty: string, subjectId?: string, current?: { id: string; name: string } | null) => [
    { value: NONE, label: empty },
    ...(current && !teachers.some((t) => t.id === current.id) ? [{ value: current.id, label: current.name }] : []),
    ...[...teachers].sort((a, b) => (subjectId ? Number(b.subjectIds.includes(subjectId)) - Number(a.subjectIds.includes(subjectId)) : 0)).map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <Card role="region" aria-label={`Teachers of ${label}`} className="space-y-4 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
        <UsersRound className="size-5 text-primary" aria-hidden />
        Teachers of {label}
      </h2>

      <div className="max-w-sm">
        <Field id={`${key}-class-teacher`} label="Class teacher" quiet>
          <Select
            id={`${key}-class-teacher`}
            value={classTeacher?.id ?? NONE}
            options={teacherOptions("No class teacher", undefined, classTeacher)}
            onChange={(id) =>
              void setClassTeacher({ classId, sectionId, teacherId: id === NONE ? null : id })
                .unwrap()
                .then(() => push("success", id === NONE ? `${label} has no class teacher now` : `${nameOf(id)} is the class teacher of ${label}`), failed)
            }
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground-muted">Subjects</p>
        {allotments.isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-foreground-muted">No subjects yet</p>
        ) : (
          <ul className="divide-y divide-border/70 rounded-xl border border-border">
            {rows.map((r) => {
              const id = `${key}-${r.subjectId}-teacher`;
              return (
                <li key={r.subjectId} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,16rem)] sm:gap-4">
                  <span className="text-sm font-semibold text-foreground">{r.subjectName}</span>
                  <span className="text-xs text-foreground-muted">{`${r.periodsPerWeek} period${r.periodsPerWeek === 1 ? "" : "s"} a week`}</span>
                  <span>
                    <span id={`${id}-label`} className="sr-only">
                      {r.subjectName} teacher
                    </span>
                    <Select
                      id={id}
                      value={r.teacherId ?? NONE}
                      options={teacherOptions("No teacher", r.subjectId, r.teacherId ? { id: r.teacherId, name: r.teacherName ?? "A teacher" } : null)}
                      onChange={(teacherId) =>
                        void assign({ classId, sectionId, subjectId: r.subjectId, teacherId: teacherId === NONE ? null : teacherId })
                          .unwrap()
                          .then(() => push("success", teacherId === NONE ? `${r.subjectName} of ${label} has no teacher now` : `${nameOf(teacherId)} teaches ${r.subjectName} in ${label}`), failed)
                      }
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {adding ? (
        <div className="grid items-start gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/20 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_auto]">
          <Field id={`${key}-new-subject`} label="New subject" error={tried ? newProblems.subject : undefined}>
            <Select
              id={`${key}-new-subject`}
              value={newSubject}
              placeholder="Select a subject"
              invalid={tried && !!newProblems.subject}
              options={subjects.filter((s) => !studied.has(s.id)).map((s) => ({ value: s.id, label: s.name }))}
              onChange={setNewSubject}
            />
          </Field>
          <Field id={`${key}-new-periods`} label="Periods a week" error={tried ? newProblems.periods : undefined}>
            <Input id={`${key}-new-periods`} inputMode="numeric" autoComplete="off" placeholder="5" value={newPeriods} onChange={(e) => setNewPeriods(twoDigits(e.target.value))} />
          </Field>
          <Field id={`${key}-new-teacher`} label="Teacher" quiet>
            <Select id={`${key}-new-teacher`} value={newTeacher} options={teacherOptions("No teacher yet", newSubject || undefined)} onChange={setNewTeacher} />
          </Field>
          <div className="flex gap-2 sm:pt-6">
            <Button size="sm" onClick={addSubject}>
              Add
            </Button>
            <Button variant="ghost" size="sm" aria-label="Cancel" onClick={closeAdding}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          Add subject
        </Button>
      )}
    </Card>
  );
}
