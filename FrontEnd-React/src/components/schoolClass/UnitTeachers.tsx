import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { Plus, UsersRound, X } from "lucide-react";
import { MAX_BACKUP_TEACHERS, MAX_PERIODS_PER_WEEK } from "../../constants/timetable";
import { useAssignTeacherMutation, useGetAllotmentsQuery, useGetSubjectsQuery, useGetTeachersQuery, useSaveUnitTeachersMutation } from "../../redux/api/timetableApi";
import type { AllotmentRow, SaveUnitTeachersInput } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { onlyDigits } from "../../utils/teachers";
import { ConfirmModal } from "../classes/ConfirmModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useResultModal } from "../ui/ResultModal";
import { MultiSelect, Select, type SelectOption } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";

/** "Nobody" in a teacher dropdown (a dropdown cannot show an empty value as picked). */
const NONE = "none";
const twoDigits = onlyDigits(2);

/** One subject as it is being edited: its main teacher (priority 1) and its other teachers in order of priority (2, 3...). */
interface Draft {
  main: string | null;
  backups: string[];
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const savedOf = (r: AllotmentRow): Draft => ({ main: r.teacherId, backups: r.backups.map((b) => b.id) });

/** A tile of the grid: the class teacher, or one subject. Tinted while it holds a change that is not saved. */
const tile = (changed: boolean) =>
  cn("flex min-w-0 flex-col gap-2.5 rounded-xl border p-3 transition-colors", changed ? "border-primary/30 bg-primary-soft/70" : "border-border bg-surface");

/**
 * The teachers of one section (or of a class without sections), on its Timetable & teachers page, in tiles that run across the page (the
 * class teacher first, then a tile per subject; 2 to 4 to a line by the width of the box). A subject's tile has its main teacher (priority 1:
 * the one the timetable puts in the periods) and, optional, a dropdown of **other teachers** where several can be ticked: the order they are
 * ticked in is their priority (2, 3...), shown on their chips, and they manage the subject when the main teacher cannot come.
 *
 * Nothing is sent when a teacher is picked: it stays on the screen until **Save** (one request for everything changed, all or nothing; the
 * server checks it again and may refuse), **Cancel** puts it all back, and leaving with changes not saved asks first. **Add subject** is its
 * own action (it is saved at once). It is the timetable's own list: the main teacher picked here is who teaches those periods there.
 */
export function UnitTeachers({ classId, sectionId, label, classTeacher }: { classId: string; sectionId: string | null; label: string; classTeacher: { id: string; name: string } | null }) {
  const teachers = useGetTeachersQuery({ status: "active" }).data?.data.items ?? [];
  const allotments = useGetAllotmentsQuery({ classId, sectionId });
  const subjects = useGetSubjectsQuery("active").data?.data.items ?? [];
  const [saveTeachers, { isLoading: saving }] = useSaveUnitTeachersMutation();
  const [assign] = useAssignTeacherMutation();
  const result = useResultModal();
  const rows = allotments.data?.data.rows ?? [];
  const key = `${classId}-${sectionId ?? "class"}`;

  // ---- What is changed and not saved yet -----------------------------------------------------------------------------------------
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [headEdit, setHeadEdit] = useState<string | null | undefined>(undefined);
  // The class teacher just saved, until the page's own read of it catches up (so it never flashes back to the old one).
  const [headSaved, setHeadSaved] = useState<{ id: string | null; base: string | null } | null>(null);
  const shownHead = classTeacher?.id ?? null;
  const savedHead = headSaved && headSaved.base === shownHead ? headSaved.id : shownHead;
  const head = headEdit === undefined ? savedHead : headEdit;
  const headChanged = headEdit !== undefined && headEdit !== savedHead;

  const draftOf = (r: AllotmentRow): Draft => edits[r.subjectId] ?? savedOf(r);
  const rowChanged = (r: AllotmentRow) => {
    const edit = edits[r.subjectId];
    return !!edit && (edit.main !== r.teacherId || !same(edit.backups, savedOf(r).backups));
  };
  const dirty = headChanged || rows.some(rowChanged);

  function setDraft(r: AllotmentRow, next: Draft) {
    const before = savedOf(r);
    setEdits((current) => {
      const updated = { ...current, [r.subjectId]: next };
      // Back to what is saved: nothing is changed for this subject any more.
      if (next.main === before.main && same(next.backups, before.backups)) delete updated[r.subjectId];
      return updated;
    });
  }
  const pickMain = (r: AllotmentRow, id: string) =>
    setDraft(r, id === NONE ? { main: null, backups: [] } : { main: id, backups: draftOf(r).backups.filter((b) => b !== id) });
  /** The dropdown answers with the ticked names in the order of its list; the priority is the order they were ticked in (new ones last). */
  const pickOthers = (r: AllotmentRow, ticked: string[]) => {
    const before = draftOf(r);
    setDraft(r, { ...before, backups: [...before.backups.filter((id) => ticked.includes(id)), ...ticked.filter((id) => !before.backups.includes(id))].slice(0, MAX_BACKUP_TEACHERS) });
  };
  const dropOther = (r: AllotmentRow, id: string) => setDraft(r, { ...draftOf(r), backups: draftOf(r).backups.filter((b) => b !== id) });

  function cancel() {
    setEdits({});
    setHeadEdit(undefined);
  }

  const busy = useRef(false);
  async function save() {
    if (!dirty || busy.current) return;
    busy.current = true;
    const body: SaveUnitTeachersInput = {
      classId,
      sectionId,
      ...(headChanged ? { classTeacherId: head } : {}),
      subjects: rows.filter(rowChanged).map((r) => ({ subjectId: r.subjectId, teacherId: draftOf(r).main, backupTeacherIds: draftOf(r).backups })),
    };
    try {
      await saveTeachers(body).unwrap();
      if (headChanged) setHeadSaved({ id: head, base: shownHead });
      cancel();
      result.done("Teachers saved", `Teachers of ${label} are saved.`);
    } catch (err) {
      result.failed("Teachers not saved", getApiError(err)?.message ?? "Could not save. Please try again.");
    } finally {
      busy.current = false;
    }
  }

  // Leaving with changes not saved: another page or another section of this one asks first; closing the tab asks too.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---- The teachers to pick from -------------------------------------------------------------------------------------------------
  /** The school's teachers (the ones who can teach `subjectId` first); `known` stay in the list before it comes, or if they were made inactive. */
  const pool = (subjectId: string | undefined, known: ({ id: string; name: string } | null)[]): SelectOption[] => {
    const list = [...teachers]
      .sort((a, b) => (subjectId ? Number(b.subjectIds.includes(subjectId)) - Number(a.subjectIds.includes(subjectId)) : 0))
      .map((t) => ({ value: t.id, label: t.name }));
    const missing = known.filter((k): k is { id: string; name: string } => !!k && !list.some((o) => o.value === k.id)).map((k) => ({ value: k.id, label: k.name }));
    return [...missing, ...list];
  };

  // ---- A new subject for the section: which one, how many periods a week, and its teacher (optional) ---------------------------------
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
      .then(
        () => {
          closeAdding();
          result.done("Subject added", `${name} is added to ${label}.`);
        },
        (err) => result.failed("Subject not added", getApiError(err)?.message ?? "Could not save. Please try again.")
      );
  }

  const classTeacherId = `${key}-class-teacher`;

  return (
    <Card role="region" aria-label={`Teachers of ${label}`} className="@container space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
          <UsersRound className="size-5 text-primary" aria-hidden />
          Teachers of {label}
        </h2>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={() => void save()} disabled={!dirty} loading={saving}>
            Save
          </Button>
        </div>
      </div>

      <ul aria-label="Class teacher and subjects" className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4">
        <li className={tile(headChanged)}>
          <p id={`${classTeacherId}-label`} className="text-sm font-bold text-foreground">
            Class teacher
          </p>
          <Select
            id={classTeacherId}
            value={head ?? NONE}
            options={[{ value: NONE, label: "No class teacher" }, ...pool(undefined, [classTeacher])]}
            onChange={(id) => {
              const next = id === NONE ? null : id;
              setHeadEdit(next === savedHead ? undefined : next);
            }}
          />
        </li>

        {allotments.isLoading ? (
          <li className="col-span-full">
            <Skeleton className="h-24 rounded-xl" />
          </li>
        ) : rows.length === 0 ? (
          <li className="col-span-full flex items-center text-sm text-foreground-muted">No subjects yet</li>
        ) : (
          rows.map((r) => {
            const draft = draftOf(r);
            const id = `${key}-${r.subjectId}`;
            const options = pool(r.subjectId, [r.teacherId ? { id: r.teacherId, name: r.teacherName ?? "A teacher" } : null, ...r.backups]);
            const nameOf = (teacherId: string) => options.find((o) => o.value === teacherId)?.label ?? "A teacher";
            const full = draft.backups.length >= MAX_BACKUP_TEACHERS;
            return (
              <li key={r.subjectId} className={tile(rowChanged(r))}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-bold text-foreground">{r.subjectName}</p>
                  <p className="shrink-0 text-xs text-foreground-muted">{`${r.periodsPerWeek} period${r.periodsPerWeek === 1 ? "" : "s"} a week`}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                  <span id={`${id}-teacher-label`} className="sr-only">
                    {r.subjectName} teacher
                  </span>
                  <div className="min-w-0 flex-1">
                    <Select id={`${id}-teacher`} value={draft.main ?? NONE} options={[{ value: NONE, label: "No teacher" }, ...options]} onChange={(next) => pickMain(r, next)} />
                  </div>
                </div>

                <span id={`${id}-others-label`} className="sr-only">
                  {r.subjectName} other teachers
                </span>
                <MultiSelect
                  id={`${id}-others`}
                  value={draft.backups}
                  placeholder="Other teachers (optional)"
                  disabled={draft.main === null}
                  options={options.filter((o) => o.value !== draft.main)}
                  disabledValues={full ? options.filter((o) => !draft.backups.includes(o.value)).map((o) => o.value) : undefined}
                  renderValue={(ids) => `${ids.length} other teacher${ids.length === 1 ? "" : "s"}`}
                  onChange={(ticked) => pickOthers(r, ticked)}
                />

                {draft.backups.length > 0 && (
                  <ul aria-label={`Other teachers of ${r.subjectName}`} className="flex flex-wrap gap-1.5">
                    {draft.backups.map((teacherId, at) => (
                      <li key={teacherId} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-muted py-0.5 pl-0.5 pr-1 text-xs font-semibold text-foreground ring-1 ring-inset ring-border">
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary-deep">{at + 2}</span>
                        <span className="truncate">{nameOf(teacherId)}</span>
                        <button
                          type="button"
                          aria-label={`Take off ${nameOf(teacherId)} from ${r.subjectName}`}
                          onClick={() => dropOther(r, teacherId)}
                          className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })
        )}
      </ul>

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
            <Select id={`${key}-new-teacher`} value={newTeacher} options={[{ value: NONE, label: "No teacher yet" }, ...pool(newSubject || undefined, [])]} onChange={setNewTeacher} />
          </Field>
          <div className="flex gap-2 sm:pt-6">
            <Button size="sm" onClick={addSubject}>
              Add
            </Button>
            <Button variant="ghost" size="sm" aria-label="Close new subject" onClick={closeAdding}>
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

      {result.modal}
      {blocker.state === "blocked" && (
        <ConfirmModal title="Leave without saving?" confirmLabel="Leave without saving" onClose={() => blocker.reset()} onConfirm={async () => blocker.proceed()}>
          <p>{`You have changed the teachers of ${label} and not saved them. If you leave now, the changes are lost.`}</p>
        </ConfirmModal>
      )}
    </Card>
  );
}
