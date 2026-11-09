import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { BookOpen, CircleAlert, Clock3, Copy, ListOrdered, Printer, Send, Sparkles, TriangleAlert, Undo2 } from "lucide-react";
import { DAY_NAMES, SUBJECT_PRESETS } from "../../constants/timetable";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import {
  useAutofillGridMutation,
  useGetGridQuery,
  useGetSubjectsQuery,
  usePublishGridMutation,
  useQuickAddSubjectsMutation,
  useSaveGridMutation,
  useUnpublishGridMutation,
} from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import {
  PRESET_PREFIX,
  buildModel,
  cellAt,
  cellKey,
  changeLesson,
  clearCell,
  localProblems,
  placeSubject,
  placedCounts,
  sameGrid,
  subjectChoices,
  subjectColors,
  teacherTrouble,
  type SubjectChoice,
} from "../../utils/timetable";
import type { AutofillAnswer, GridAllotment, GridCell, GridView, Issue, Lesson, UnitRef } from "../../types";
import { ConfirmModal } from "../classes/ConfirmModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { ClassPeriodsDialog } from "./ClassPeriodsDialog";
import { ClassSubjectsEditor } from "./ClassSubjectsEditor";
import { CopyDialog, LessonDialog } from "./GridDialogs";
import { GridTable } from "./GridTable";
import { PeriodPicker } from "./PeriodPicker";

/** Where an issue is, in words: "Monday period 3", or nothing for one about the whole week. */
const placeOf = (i: Issue) => (i.day && i.period ? `${DAY_NAMES[i.day]} period ${i.period}` : i.day ? DAY_NAMES[i.day] : "");

interface Fill {
  /** The lessons there before the first fill: every new try starts from them. */
  base: GridCell[];
  seed: number;
  answer: AutofillAnswer;
}

/** The grid of one class, with its tools. Mounted again for every class (`key`), so nothing of one class is ever shown under another. */
function Workspace({ view: saved, unit, onReload, onGoTimings }: { view: GridView; unit: UnitRef; onReload: () => void; onGoTimings: () => void }) {
  const { push } = useToast();
  const structure = useGetStructureQuery().data?.data;
  const allSubjects = useGetSubjectsQuery("all").data?.data.items;
  const [save, { isLoading: saving }] = useSaveGridMutation();
  const [publish, { isLoading: publishing }] = usePublishGridMutation();
  const [unpublish, { isLoading: unpublishing }] = useUnpublishGridMutation();
  const [autofill, { isLoading: filling }] = useAutofillGridMutation();
  const [quickAdd] = useQuickAddSubjectsMutation();

  // Subjects picked here that the class does not study yet: they work in the grid at once, and the server adds them to the class's list
  // when the timetable is saved (with the periods they were given).
  const [extras, setExtras] = useState<GridAllotment[]>([]);
  const view = useMemo(
    () => ({ ...saved, allotments: [...saved.allotments, ...extras.filter((e) => !saved.allotments.some((a) => a.subjectId === e.subjectId))] }),
    [saved, extras]
  );

  const [cells, setCells] = useState<GridCell[]>(saved.cells);
  const [seen, setSeen] = useState(saved);
  // The period whose subject box is open (and the button it opens beside), and the period whose lesson window (teacher, room) is open.
  const [picking, setPicking] = useState<{ day: number; period: number } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<{ day: number; period: number } | null>(null);
  const [copying, setCopying] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [editingSubjects, setEditingSubjects] = useState(false);
  const [editingPeriods, setEditingPeriods] = useState(false);
  const [fill, setFill] = useState<Fill | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [clashes, setClashes] = useState<Map<string, string[]>>(new Map());
  const [failure, setFailure] = useState<string | null>(null);

  // What was saved changed (the answer to Save, Publish, a new list of subjects): the grid is that again, and a subject picked here is in
  // the class's list now (or was not kept).
  if (saved !== seen) {
    setSeen(saved);
    setCells(saved.cells);
    setExtras([]);
    setFill(null);
    setClashes(new Map());
    setPicking(null);
  }

  const model = useMemo(() => buildModel(view), [view]);
  const colors = useMemo(() => subjectColors(view), [view]);
  const dirty = !sameGrid(cells, view.cells);
  const counts = useMemo(() => placedCounts(cells), [cells]);
  const total = view.stats.total;
  const filled = cells.length;
  const mine = useMemo(() => localProblems(model, cells), [model, cells]);
  const siblings = (structure?.classes.find((c) => c.id === unit.classId)?.sections ?? []).filter((s) => s.id !== unit.sectionId).map((s) => ({ id: s.id, name: s.name }));

  // Problems by period: what the screen can see at once, and what the server refused at the last Save.
  const problems = useMemo(() => {
    const all = new Map(mine);
    for (const [key, messages] of clashes) all.set(key, [...new Set([...(all.get(key) ?? []), ...messages])]);
    return all;
  }, [mine, clashes]);
  // The server's full check is of what was saved: it stands for the grid while nothing has been changed since.
  const issues = dirty ? [] : view.issues;
  const looks = new Set(issues.filter((i) => i.level === "warning" && i.day && i.period).map((i) => cellKey(i.day!, i.period!)));
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  // Leaving with changes that were not saved asks first: another page, another class, the other tab.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** A change by hand: it is the new grid, and what was said before about the old one is no longer true. */
  function edit(next: GridCell[]) {
    setCells(next);
    setFill(null);
    setClashes(new Map());
    setFailure(null);
  }

  /** A period was clicked: its subject box opens beside it. */
  function openPeriod(day: number, period: number, button: HTMLButtonElement) {
    setNote(null);
    anchor.current = button;
    setPicking({ day, period });
  }

  /**
   * Puts a subject in a period: a double period takes the next one too, a choice puts all its subjects. One the class does not study yet
   * joins the grid's subjects at once (not saved until Save). A period that already has the subject is left as it is.
   */
  function put(subject: GridAllotment, day: number, period: number) {
    if (cellAt(cells, day, period)?.lessons.some((l) => l.subjectId === subject.subjectId)) return;
    const known = view.allotments.some((a) => a.subjectId === subject.subjectId);
    if (!known) setExtras((all) => [...all, subject]);
    const placing = placeSubject(known ? model : buildModel({ ...view, allotments: [...view.allotments, subject] }), cells, subject.subjectId, day, period);
    setNote(placing.note);
    edit(placing.cells);
  }

  /** Fill the empty periods. It needs each subject's periods a week: when no subject has any yet, that is asked first (not for a grid with unsaved changes). */
  function fillOrAsk() {
    if (saved.allotments.length > 0) return void runFill(fill);
    if (dirty) return setNote("Save the timetable first, then say how many periods a week each subject gets: the fill needs that.");
    setNote(null);
    setEditingSubjects(true);
  }

  async function runFill(next: Fill | null) {
    setFailure(null);
    const base = next?.base ?? cells;
    const seed = (next?.seed ?? 0) + 1;
    try {
      const { data } = await autofill({ ...unit, cells: base, seed }).unwrap();
      setCells(data.cells);
      setFill({ base, seed, answer: data });
      setClashes(new Map());
    } catch (err) {
      setFailure(getApiError(err)?.message ?? "Could not fill the timetable. Please try again.");
    }
  }

  async function submit() {
    setFailure(null);
    try {
      await save({ ...unit, cells }).unwrap();
      push("success", "Timetable saved");
    } catch (err) {
      const e = getApiError(err);
      const found = new Map<string, string[]>();
      for (const d of Array.isArray(e?.details) ? (e.details as { path?: string; message?: string }[]) : []) {
        const match = /^d(\d+)p(\d+)$/.exec(d.path ?? "");
        if (match && d.message) found.set(cellKey(Number(match[1]), Number(match[2])), [...(found.get(cellKey(Number(match[1]), Number(match[2]))) ?? []), d.message]);
      }
      setClashes(found);
      setFailure(e?.message ?? "Could not save. Please try again.");
    }
  }

  async function toggle() {
    setFailure(null);
    try {
      if (view.status === "published") {
        await unpublish(unit).unwrap();
        push("success", "Taken back to a draft");
      } else {
        await publish(unit).unwrap();
        push("success", "Published");
      }
    } catch (err) {
      setFailure(getApiError(err)?.message ?? "Could not do that. Please try again.");
    }
  }

  /** A subject of the school as the grid knows it: with no periods a week and no teacher, until the class's list says so. */
  const asAllotment = (subject: { id: string; name: string; code: string | null; category: GridAllotment["category"] }): GridAllotment => ({
    subjectId: subject.id,
    subjectName: subject.name,
    subjectCode: subject.code,
    category: subject.category,
    periodsPerWeek: 0,
    blockSize: 1,
    teacherId: null,
    group: null,
  });

  /** A subject picked in the box of a period: a usual one the school does not have yet is added to the school first. */
  async function choose(choice: SubjectChoice) {
    const at = picking;
    if (!at) return;
    if (choice.value.startsWith(PRESET_PREFIX)) return createSubject(choice.label);
    const inClass = view.allotments.find((a) => a.subjectId === choice.value);
    const school = allSubjects?.find((s) => s.id === choice.value);
    const subject = inClass ?? (school ? asAllotment(school) : undefined);
    if (subject) put(subject, at.day, at.period);
    setPicking(null);
  }

  /** A subject the school does not have yet (a usual one from the list, or one typed): it is added to the school's subjects, then put in the period. */
  async function createSubject(name: string) {
    const at = picking;
    const clean = name.trim().replace(/\s+/g, " ");
    if (!at || !clean) return;
    const known = allSubjects?.find((s) => s.name.toLowerCase() === clean.toLowerCase());
    if (known) {
      if (known.isActive) put(view.allotments.find((a) => a.subjectId === known.id) ?? asAllotment(known), at.day, at.period);
      else setNote(`${known.name} is archived. Bring it back on the Subjects page to use it.`);
      setPicking(null);
      return;
    }
    try {
      const { data } = await quickAdd([clean]).unwrap();
      const made = data.created[0];
      if (!made) setNote(`${clean} could not be added. Please try again.`);
      else {
        put(asAllotment(made), at.day, at.period);
        push("success", `${made.name} is added to your school's subjects`);
      }
    } catch (err) {
      setFailure(getApiError(err)?.message ?? "Could not add the subject. Please try again.");
    }
    setPicking(null);
  }

  const openCell = open ? cells.find((c) => c.day === open.day && c.period === open.period) : undefined;
  const noTiming = view.days.length === 0;
  // What the box of a period offers: the class's subjects first, then the school's other subjects, then the usual ones the school does not
  // have yet (added when picked).
  const choices = useMemo(() => subjectChoices({ allotments: view.allotments, school: allSubjects ?? [], presets: SUBJECT_PRESETS, placed: counts }), [view.allotments, allSubjects, counts]);
  const pickingSlot = picking ? view.days.find((d) => d.day === picking.day)?.slots.find((x) => x.period === picking.period) : undefined;
  const pickingCell = picking ? cellAt(cells, picking.day, picking.period) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">{view.unit.label}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
            {view.unit.academicYear.name}
            {view.status === "published" ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>}
            {dirty && <Badge tone="warning">Not saved</Badge>}
          </p>
        </div>
        {!noTiming && (
          <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              Print
            </Button>
            {siblings.length > 0 && (
              <Button variant="outline" onClick={() => setCopying(true)} disabled={dirty || !view.exists || view.cells.length === 0} title={dirty ? "Save first" : undefined}>
                <Copy className="size-4" aria-hidden />
                Copy to other sections
              </Button>
            )}
            {view.status === "published" ? (
              <Button variant="outline" onClick={() => void toggle()} loading={unpublishing} disabled={dirty}>
                <Undo2 className="size-4" aria-hidden />
                Take back to a draft
              </Button>
            ) : (
              <Button onClick={() => void toggle()} loading={publishing} disabled={dirty || view.cells.length === 0} title={dirty ? "Save first" : view.cells.length === 0 ? "Put some lessons in first" : undefined}>
                <Send className="size-4" aria-hidden />
                Publish
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="hidden text-lg font-bold print:block">
        {view.unit.label} · {view.unit.academicYear.name}
      </p>

      {noTiming ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span aria-hidden className="flex size-11 items-center justify-center rounded-2xl bg-warning-soft text-warning">
            <Clock3 className="size-5" />
          </span>
          <p className="text-sm font-semibold text-foreground">This class has no school timing yet, so it has no periods.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => setEditingPeriods(true)}>
              <ListOrdered className="size-4" aria-hidden />
              Set the periods of this class
            </Button>
            <Button variant="outline" onClick={onGoTimings}>
              Set the school timings
            </Button>
          </div>
        </Card>
      ) : editingSubjects ? (
        <Card className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <BookOpen className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-foreground">{view.unit.label}: periods a week and teachers</h3>
              <p className="text-sm text-foreground-muted">How many periods a week each subject gets (the program fills the week from these) and who teaches it.</p>
            </div>
          </div>
          <ClassSubjectsEditor
            unit={unit}
            onCancel={() => setEditingSubjects(false)}
            onSaved={() => {
              setEditingSubjects(false);
              onReload();
            }}
          />
        </Card>
      ) : (
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button onClick={fillOrAsk} loading={filling} variant="secondary">
              <Sparkles className="size-4" aria-hidden />
              {fill ? "Try another arrangement" : "Fill the empty periods"}
            </Button>
            {fill && (
              <Button variant="ghost" onClick={() => edit(fill.base)}>
                <Undo2 className="size-4" aria-hidden />
                Undo the fill
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditingPeriods(true)} disabled={dirty} title={dirty ? "Save the timetable first" : undefined}>
              <ListOrdered className="size-4" aria-hidden />
              Periods per day
            </Button>
            {cells.length > 0 && (
              <Button variant="ghost" onClick={() => setClearing(true)}>
                Empty the whole week
              </Button>
            )}
            <span className="ml-auto text-sm text-foreground-muted" role="status" aria-label="Periods with a lesson">
              {filled} of {total} periods have a lesson
            </span>
          </div>

          {fill && (
            <div role="status" aria-label="The fill" className="rounded-xl border border-primary/25 bg-primary-soft/60 px-4 py-3 text-sm text-foreground print:hidden">
              <p className="font-semibold">The empty periods are filled. Look at it, change what you like, then press Save.</p>
              {fill.answer.unplaced.length > 0 && (
                <p className="mt-1 text-warning">
                  Not all could be placed: {fill.answer.unplaced.map((u) => `${u.subjectName} (${u.missing} missing)`).join(", ")}. A teacher may be busy in other classes at those times.
                </p>
              )}
              {fill.answer.dropped > 0 && (
                <p className="mt-1 text-foreground-muted">
                  {fill.answer.dropped} lesson{fill.answer.dropped === 1 ? "" : "s"} you had put in {fill.answer.dropped === 1 ? "was" : "were"} left out because of a clash.
                </p>
              )}
            </div>
          )}
          {note && (
            <p role="status" aria-label="A note" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning print:hidden">
              {note}
            </p>
          )}
          {failure && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {failure}
            </p>
          )}

          <GridTable view={view} model={model} cells={cells} colors={colors} problems={problems} looks={looks} openKey={picking ? cellKey(picking.day, picking.period) : null} onCell={openPeriod} />

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Button onClick={() => void submit()} loading={saving} disabled={!dirty}>
              Save the timetable
            </Button>
            {!dirty && view.exists && <span className="text-sm text-foreground-muted">Everything is saved.</span>}
            {dirty && (
              <Button variant="ghost" onClick={() => edit(view.cells)}>
                Throw away my changes
              </Button>
            )}
          </div>

          {(dirty || errors.length > 0 || warnings.length > 0) && (
            <Card className="space-y-2 p-4 print:hidden" aria-label="Checks">
              <h3 className="text-sm font-bold text-foreground">Checks</h3>
              {dirty && <p className="text-xs text-foreground-muted">Save the timetable to see all the checks. Anything wrong that can be seen now has a red edge.</p>}
              {errors.length > 0 && (
                <ul className="space-y-1.5" aria-label="To fix">
                  {errors.map((i, n) => (
                    <li key={`e${n}`} className="flex items-start gap-1.5 text-sm text-danger">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        {placeOf(i) && <strong>{placeOf(i)}: </strong>}
                        {i.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {warnings.length > 0 && (
                <ul className="space-y-1.5" aria-label="Worth a look">
                  {warnings.map((i, n) => (
                    <li key={`w${n}`} className="flex items-start gap-1.5 text-sm text-warning">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        {placeOf(i) && <strong>{placeOf(i)}: </strong>}
                        {i.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {!dirty && view.exists && errors.length === 0 && warnings.length === 0 && <p className="text-sm font-semibold text-success print:hidden">Checks: nothing to fix.</p>}
        </div>
      )}

      {picking && pickingSlot && (
        <PeriodPicker
          key={cellKey(picking.day, picking.period)}
          anchor={anchor}
          title={`${DAY_NAMES[picking.day]}, ${pickingSlot.label}`}
          times={`${pickingSlot.start} to ${pickingSlot.end}`}
          choices={choices}
          current={pickingCell?.lessons.map((l) => l.subjectId) ?? []}
          teacherName={(id) => (id ? (model.teachers.get(id)?.name ?? null) : null)}
          trouble={(choice) => teacherTrouble(model, choice.teacherId, picking.day, picking.period)}
          onChoose={choose}
          onCreate={createSubject}
          onEditLesson={
            pickingCell
              ? () => {
                  setOpen(picking);
                  setPicking(null);
                }
              : undefined
          }
          onTakeOut={
            pickingCell
              ? () => {
                  edit(clearCell(cells, picking.day, picking.period));
                  setPicking(null);
                }
              : undefined
          }
          // Only closes this period's box: when another period is clicked, the box beside the old one reports its going away (the browser
          // sends it a blur) after the new one was asked for, and that must not close the new one.
          onClose={() => setPicking((now) => (now?.day === picking.day && now.period === picking.period ? null : now))}
        />
      )}
      {open && openCell && (
        <LessonDialog
          view={view}
          model={model}
          cell={openCell}
          onClose={() => setOpen(null)}
          onTakeOut={() => {
            edit(clearCell(cells, open.day, open.period));
            setOpen(null);
          }}
          onDone={(lessons: Lesson[]) => {
            let next = cells;
            for (const l of lessons) next = changeLesson(next, open.day, open.period, l.subjectId, { teacherId: l.teacherId, room: l.room });
            edit(next);
            setOpen(null);
          }}
        />
      )}
      {editingPeriods && (
        <ClassPeriodsDialog
          classId={unit.classId}
          className={view.unit.className}
          allSections={unit.sectionId !== null}
          onClose={() => setEditingPeriods(false)}
          onSaved={onReload}
          onGoTimings={() => {
            setEditingPeriods(false);
            onGoTimings();
          }}
        />
      )}
      {copying && <CopyDialog unit={unit} siblings={siblings} onClose={() => setCopying(false)} />}
      {clearing && (
        <ConfirmModal title="Empty the whole week?" confirmLabel="Empty it" onClose={() => setClearing(false)} onConfirm={async () => edit([])}>
          <p>Every lesson is taken out of the grid. Nothing is saved until you press Save, so you can still throw this away.</p>
        </ConfirmModal>
      )}
      {blocker.state === "blocked" && (
        <ConfirmModal title="Leave without saving?" confirmLabel="Leave without saving" onClose={() => blocker.reset()} onConfirm={async () => blocker.proceed()}>
          <p>You have changed this timetable and not saved it. If you leave now, the changes are lost.</p>
        </ConfirmModal>
      )}
    </div>
  );
}

/**
 * One class's (or section's) week inside Timetable > Class timetables: what it studies (edited here), the week as a table with the
 * subjects to put in it, the program's help in filling it, the checks, Save and Publish. Everything done in the grid stays on the screen
 * until "Save the timetable" (one request); the server checks it again and refuses a clash.
 */
export function ClassWeek({ unit, onGoTimings }: { unit: UnitRef; onGoTimings: () => void }) {
  const res = useGetGridQuery(unit);
  const view = res.currentData?.data;

  if (res.error && !view) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load this timetable."}</p>
        <Button variant="outline" onClick={() => res.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!view) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  return <Workspace view={view} unit={unit} onReload={() => void res.refetch()} onGoTimings={onGoTimings} />;
}
