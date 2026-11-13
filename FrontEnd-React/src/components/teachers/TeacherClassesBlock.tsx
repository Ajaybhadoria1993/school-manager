import { useState } from "react";
import { ArrowRight, CalendarDays, School, TriangleAlert, UserMinus, X } from "lucide-react";
import { Link } from "react-router";
import { useCan } from "../../hooks/useCan";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { TONES } from "../../constants/tones";
import { useAssignTeacherMutation, useGetTeacherClassesQuery, useSetClassTeacherMutation } from "../../redux/api/timetableApi";
import type { Teacher, TeacherTeaching, TeacherUnit } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { missingPeriods, placementText } from "../../utils/timetablePlacement";
import { ConfirmModal } from "../classes/ConfirmModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

const removeButton =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-semibold text-foreground-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30";

/** One class or section of the teacher: its subjects (the timetable's list) and whether they are its class teacher. */
interface UnitCard {
  key: string;
  unit: TeacherUnit;
  head: boolean;
  subjects: TeacherTeaching[];
}

/** The subjects and the class teacher posts of a teacher, class by class (in teaching order: the subjects' order first, then posts with no subject). */
function byClass(subjects: TeacherTeaching[], posts: TeacherUnit[]): UnitCard[] {
  const keyOf = (u: TeacherUnit) => `${u.academicYear.id}:${u.classId}:${u.sectionId ?? "-"}`;
  const cards = new Map<string, UnitCard>();
  for (const s of subjects) {
    const card = cards.get(keyOf(s)) ?? { key: keyOf(s), unit: s, head: false, subjects: [] };
    card.subjects.push(s);
    cards.set(card.key, card);
  }
  for (const p of posts) {
    const card = cards.get(keyOf(p)) ?? { key: keyOf(p), unit: p, head: false, subjects: [] };
    card.head = true;
    cards.set(card.key, card);
  }
  return [...cards.values()];
}

const periodsText = (n: number) => `${n} period${n === 1 ? "" : "s"} a week`;

/** Where the class's own timetable is (the old address leads to the right page for a class or a section). */
const timetableOf = (u: TeacherUnit) => `/school/timetable/class/${u.classId}/${u.sectionId ?? "none"}`;

/**
 * The classes a teacher has been given, on their page, **class by class**: a card for each class or section with its subjects (each with its
 * periods a week and, in plain words, how many of them are in the class's timetable: a period has a day and time only when a person puts it
 * there, until then it is in nobody's week), a badge when they are its class teacher, and, under a card that has periods missing, one line that
 * says so with the button that leads to the class's timetable. **Remove** (a word on the button, not a bare cross) takes a subject away (the
 * cross on the badge takes the class teacher post), but only after a window says what that means and the person agrees; the subject stays with
 * the class, without a teacher. **Assign class** opens the page that gives one (`onAssign`).
 */
export function TeacherClassesBlock({ teacher, onAssign, index = 0, canChange = true }: { teacher: Teacher; onAssign: () => void; index?: number; canChange?: boolean }) {
  const res = useGetTeacherClassesQuery(teacher.id);
  const [assign] = useAssignTeacherMutation();
  const [setClassTeacher] = useSetClassTeacherMutation();
  const { push } = useToast();
  const can = useCan();
  // A year that is over is only looked at: nothing is given or taken away.
  // A person who may see the teacher but not change them (Permissions) only reads what they have been given.
  const readOnly = useReadOnlyYear() || !canChange;
  const classes = res.data?.data;
  const t = TONES.info;
  const [asking, setAsking] = useState<{ kind: "subject"; row: TeacherTeaching } | { kind: "post"; unit: TeacherUnit } | null>(null);
  const cards = classes ? byClass(classes.subjects, classes.classTeacherOf) : [];
  const years = new Set(cards.map((c) => c.unit.academicYear.id)).size;

  async function takeSubjectAway(s: TeacherTeaching) {
    await assign({ classId: s.classId, sectionId: s.sectionId, subjectId: s.subjectId, teacherId: null }).unwrap();
    push("success", `${s.subjectName} of ${s.label} has no teacher now`);
  }
  async function takePostAway(u: TeacherUnit) {
    await setClassTeacher({ classId: u.classId, sectionId: u.sectionId, teacherId: null }).unwrap();
    push("success", `${u.label} has no class teacher now`);
  }

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
      ) : cards.length === 0 ? (
        <p className="relative mt-4 text-sm text-foreground-muted">No class yet.</p>
      ) : (
        <ul aria-label="Classes of the teacher" className="relative mt-4 grid gap-3 lg:grid-cols-2">
          {cards.map((c) => (
            <li key={c.key} aria-label={c.head ? `Class teacher of ${c.unit.label}` : c.unit.label} className="rounded-xl border border-border bg-surface/60">
              <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3.5 py-2.5">
                <h3 className="text-sm font-bold text-foreground">
                  {c.unit.label}
                  {years > 1 && <span className="ml-1.5 text-xs font-medium text-foreground-muted">{c.unit.academicYear.name}</span>}
                </h3>
                {c.head && (
                  <span className="inline-flex h-6 items-center gap-0.5 rounded-md bg-primary-soft pl-2 pr-0.5 text-xs font-semibold text-primary-deep ring-1 ring-inset ring-primary/20">
                    Class teacher
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label={`${teacher.name} is no longer the class teacher of ${c.unit.label}`}
                        title="Remove as class teacher"
                        className="flex size-5 cursor-pointer items-center justify-center rounded text-primary-deep/70 transition-colors hover:bg-danger-soft hover:text-danger"
                        onClick={() => setAsking({ kind: "post", unit: c.unit })}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    )}
                  </span>
                )}
                {can("timetable.edit") && missingPeriods(c.subjects) === 0 && (
                  <Link
                    to={timetableOf(c.unit)}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <CalendarDays className="size-3.5" aria-hidden />
                    Open timetable
                  </Link>
                )}
              </div>
              {c.subjects.length === 0 ? (
                <p className="px-3.5 py-2.5 text-sm text-foreground-muted">No subject of this class yet.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {c.subjects.map((s) => {
                    const done = s.placedPeriods >= s.periodsPerWeek;
                    return (
                      <li key={s.subjectId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
                        <div className="min-w-0 flex-1 basis-32">
                          <p className="truncate text-sm font-semibold text-foreground">{s.subjectName}</p>
                          <p className="text-xs text-foreground-muted">{periodsText(s.periodsPerWeek)}</p>
                        </div>
                        <Badge tone={done ? "success" : "warning"} title={done ? "Every period has a day and time in the class's timetable" : "A period that is not in the timetable has no day and time yet, so it is not in the teacher's week"}>
                          {placementText(s.placedPeriods, s.periodsPerWeek)}
                        </Badge>
                        {teacher.isActive && !readOnly && (
                          <button
                            type="button"
                            aria-label={`Take ${s.subjectName} of ${s.label} away from ${teacher.name}`}
                            className={removeButton}
                            onClick={() => setAsking({ kind: "subject", row: s })}
                          >
                            <X className="size-3.5" aria-hidden />
                            Remove
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {missingPeriods(c.subjects) > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 bg-warning-soft px-3.5 py-2.5 text-xs font-medium text-foreground">
                  <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1 basis-48">
                    {missingPeriods(c.subjects) === 1
                      ? `1 period is not in the timetable yet, so it is not in ${teacher.name}'s week.`
                      : `${missingPeriods(c.subjects)} periods are not in the timetable yet, so they are not in ${teacher.name}'s week.`}
                  </span>
                  {can("timetable.edit") && (
                    <Link
                      to={timetableOf(c.unit)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-primary-deep ring-1 ring-inset ring-primary/25 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      Put in timetable
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {asking?.kind === "subject" && (
        <ConfirmModal
          title={`Take ${asking.row.subjectName} of ${asking.row.label} away from ${teacher.name}?`}
          confirmLabel="Take away"
          icon={UserMinus}
          onClose={() => setAsking(null)}
          onConfirm={() => takeSubjectAway(asking.row)}
        >
          <p>
            {asking.row.subjectName} stays with {asking.row.label}, but it will have <strong>no teacher</strong>.
            {asking.row.placedPeriods > 0 && ` Its ${asking.row.placedPeriods} period${asking.row.placedPeriods === 1 ? "" : "s"} already placed in the class's timetable stay there, with no teacher, until you give the subject to someone.`}
          </p>
          <p className="mt-2 text-foreground-muted">You can give it to {teacher.name} or to another teacher again at any time.</p>
        </ConfirmModal>
      )}
      {asking?.kind === "post" && (
        <ConfirmModal title={`Remove ${teacher.name} as class teacher of ${asking.unit.label}?`} confirmLabel="Remove" icon={UserMinus} onClose={() => setAsking(null)} onConfirm={() => takePostAway(asking.unit)}>
          <p>
            {asking.unit.label} will have <strong>no class teacher</strong> until you choose one. The subjects {teacher.name} teaches there are not changed.
          </p>
        </ConfirmModal>
      )}
    </Card>
  );
}
