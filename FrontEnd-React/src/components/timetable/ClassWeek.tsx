import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, Link } from "react-router";
import { BookOpen, Check, CircleAlert, Clock3, Copy, ListOrdered, Printer, Save, Send, Sparkles, TriangleAlert, Undo2, UserPlus } from "lucide-react";
import { DAY_NAMES, SUBJECT_PRESETS } from "../../constants/timetable";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import {
  useAutofillGridMutation,
  useGetGridQuery,
  useGetSubjectsQuery,
  usePublishGridMutation,
  useQuickAddSubjectsMutation,
  useSaveGridMutation,
} from "../../redux/api/timetableApi";
import { useCan } from "../../hooks/useCan";
import { getApiError } from "../../utils/apiErrors";
import { PRESET_PREFIX, applyMotherTeacher, buildModel, cellAt, cellKey, changeLesson, choiceOf, clearCell, isPrePrimaryName, localProblems, placeAcrossWeek, placeHalfDay, placeWholeDay, placedCounts, sameGrid, subjectAccents, subjectChoices, subjectColors, teacherChoices, teacherOf, teacherOnRange, teacherTrouble, type Spread, type SubjectChoice } from "../../utils/timetable";
import { cn } from "../../utils/helpers";
import { Badge } from "../ui/Badge";
import type { AutofillAnswer, ClassWeekStatus, GridAllotment, GridCell, GridView, Issue, Lesson, UnitRef } from "../../types";
import { ConfirmModal } from "../classes/ConfirmModal";
import { ClassTeacherButton } from "../schoolClass/ClassTeacherButton";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { ClassTimingDialog } from "./ClassTimingDialog";
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
function Workspace({ view: saved, unit, onReload, onGoTimings, onStatus }: { view: GridView; unit: UnitRef; onReload: () => void; onGoTimings: () => void; onStatus?: (status: ClassWeekStatus | null) => void }) {
  const { push } = useToast();
  const structure = useGetStructureQuery().data?.data;
  const allSubjects = useGetSubjectsQuery("all").data?.data.items;
  const [save, { isLoading: saving }] = useSaveGridMutation();
  const [publish, { isLoading: publishing }] = usePublishGridMutation();
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
  // The class teacher chosen here (the Class teacher button), until the page
  // reads the week again (the server then says the same). The week is not read again for it: lessons not saved yet would be thrown away.
  const [headChosen, setHeadChosen] = useState<{ id: string; name: string } | null | undefined>(undefined);

  // What was saved changed (the answer to Save, Publish, a new list of subjects): the grid is that again, and a subject picked here is in
  // the class's list now (or was not kept).
  if (saved !== seen) {
    setSeen(saved);
    setCells(saved.cells);
    setExtras([]);
    setFill(null);
    setClashes(new Map());
    setPicking(null);
    // The week as the server has it says who the class teacher is again.
    setHeadChosen(undefined);
  }

  const model = useMemo(() => buildModel(view), [view]);

  // A Pre-Primary class (2026-11-10): its class teacher takes it (`mother` in here: 2026-11-17 the Mother teacher box is gone, the Class teacher button is the one), and a subject may fill a whole day.
  const klass = structure?.classes.find((c) => c.id === unit.classId);
  const prePrimary = !!structure?.departments.some((d) => d.id === klass?.departmentId && isPrePrimaryName(d.name));
  const head = headChosen !== undefined ? headChosen : (saved.classTeacher ?? null);
  const mother = prePrimary ? (head?.id ?? null) : null;
  const motherName = mother ? (model.teachers.get(mother)?.name ?? head?.name ?? null) : null;
  // A small class has one thing a day (or two): the whole day is what a picked subject fills, until the toolbar says otherwise.
  const [spread, setSpread] = useState<Spread>("day");
  const can = useCan();
  const activeTeachers = view.teachers.filter((t) => t.isActive);
  const colors = useMemo(() => subjectColors(view), [view]);
  const accents = useMemo(() => subjectAccents(view), [view]);
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
   * Puts a subject in a period and, when the period was empty, in that period of the other days that are empty too (`placeAcrossWeek`): a
   * double period takes the next one too, a choice puts all its subjects. One the class does not study yet
   * joins the grid's subjects at once (not saved until Save). A period that already has the subject is left as it is.
   */
  function put(subject: GridAllotment, day: number, period: number) {
    // A Pre-Primary class puts a subject in a whole day or half of it, in place of what was there; the usual way is that period of every day.
    const wide = prePrimary && spread !== "week";
    if (!wide && cellAt(cells, day, period)?.lessons.some((l) => l.subjectId === subject.subjectId)) return;
    const known = view.allotments.some((a) => a.subjectId === subject.subjectId);
    if (!known) setExtras((all) => [...all, subject]);
    const using = known ? model : buildModel({ ...view, allotments: [...view.allotments, subject] });
    const placing =
      prePrimary && spread === "day"
        ? placeWholeDay(using, cells, subject.subjectId, day, mother)
        : prePrimary && spread === "half"
          ? placeHalfDay(using, cells, subject.subjectId, day, period, mother)
          : placeAcrossWeek(using, cells, subject.subjectId, day, period, mother);
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
      setCells(mother ? applyMotherTeacher(model, data.cells, mother, null) : data.cells);
      setFill({ base, seed, answer: data });
      setClashes(new Map());
    } catch (err) {
      setFailure(getApiError(err)?.message ?? "Could not fill the timetable. Please try again.");
    }
  }

  /**
   * The one button at the top (2026-11-13: "save kar di to publish ho jaye, alag alag button zaruri nahi"): **Save the timetable** keeps the week and,
   * for a draft that has lessons, publishes it too (a published timetable stays published: a change is live at once). A saved draft that was never
   * published (older ones) is published by the same button, which then says **Publish the timetable**. A refusal to publish (a clash the checks found)
   * is said after "saved": the week is kept either way.
   */
  async function submit() {
    setFailure(null);
    if (dirty) {
      try {
        await save({ ...unit, cells }).unwrap();
      } catch (err) {
        const e = getApiError(err);
        const found = new Map<string, string[]>();
        for (const d of Array.isArray(e?.details) ? (e.details as { path?: string; message?: string }[]) : []) {
          const match = /^d(\d+)p(\d+)$/.exec(d.path ?? "");
          if (match && d.message) found.set(cellKey(Number(match[1]), Number(match[2])), [...(found.get(cellKey(Number(match[1]), Number(match[2]))) ?? []), d.message]);
        }
        setClashes(found);
        setFailure(e?.message ?? "Could not save. Please try again.");
        return;
      }
    }
    if (view.status === "published" || (dirty ? cells.length : view.cells.length) === 0) return void push("success", "Timetable saved");
    try {
      await publish(unit).unwrap();
      push("success", dirty ? "Timetable saved and published" : "Timetable published");
    } catch (err) {
      setFailure(`${dirty ? "The timetable is saved, but it" : "It"} could not be published: ${getApiError(err)?.message ?? "please try again."}`);
    }
  }

  /**
   * The Class teacher button of the toolbar kept someone as the class teacher, or took the class teacher away (null): the button said so to the
   * server already and to the person. The toolbar shows it at once, and in a Pre-Primary class, where the class teacher takes the whole class, a
   * new class teacher goes on the periods with no teacher (in place of the one there was), and with none the periods that had them have no teacher.
   */
  function headAssigned(teacher: { id: string; name: string } | null) {
    const before = mother;
    const beforeName = motherName;
    setHeadChosen(teacher);
    if (!prePrimary) return;
    const changed = applyMotherTeacher(model, cells, teacher?.id ?? null, before);
    if (!sameGrid(changed, cells)) {
      edit(changed);
      setNote(
        teacher
          ? `${teacher.name} is put on the periods that had no teacher. Press Save the timetable to keep them.`
          : `The periods that had ${beforeName ?? "the class teacher"} have no teacher now. Press Save the timetable to keep them.`
      );
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
    // The box goes on to the teachers (2026-11-13): it stays beside the period with the subject in it. Subjects taught side by side (a
    // choice) have a window of their own for their teachers, so the box closes for them.
    if (subject && choiceOf(model, subject.subjectId).length > 1) setPicking(null);
  }

  /** A subject the school does not have yet (a usual one from the list, or one typed): it is added to the school's subjects, then put in the period. */
  async function createSubject(name: string) {
    const at = picking;
    const clean = name.trim().replace(/\s+/g, " ");
    if (!at || !clean) return;
    const known = allSubjects?.find((s) => s.name.toLowerCase() === clean.toLowerCase());
    if (known) {
      if (known.isActive) put(view.allotments.find((a) => a.subjectId === known.id) ?? asAllotment(known), at.day, at.period);
      else {
        setNote(`${known.name} is archived. Bring it back on the Subjects page to use it.`);
        setPicking(null);
      }
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
      setPicking(null);
    }
  }

  const openCell = open ? cells.find((c) => c.day === open.day && c.period === open.period) : undefined;
  const noTiming = view.days.length === 0;
  // The one Save button: changes to keep, or a saved draft with lessons that was never published.
  const publishSaved = !dirty && view.exists && view.status !== "published" && view.cells.length > 0;
  const saveLabel = publishSaved ? "Publish the timetable" : "Save the timetable";
  // What the box of a period offers: the class's subjects first, then the school's other subjects, then the usual ones the school does not
  // have yet (added when picked).
  const choices = useMemo(() => subjectChoices({ allotments: view.allotments, school: allSubjects ?? [], presets: SUBJECT_PRESETS, placed: counts }), [view.allotments, allSubjects, counts]);
  const pickingSlot = picking ? view.days.find((d) => d.day === picking.day)?.slots.find((x) => x.period === picking.period) : undefined;
  const pickingCell = picking ? cellAt(cells, picking.day, picking.period) : undefined;
  // The lessons nobody teaches yet (no teacher of their own, none usual for the subject).
  const untaught = cells.reduce((n, c) => n + c.lessons.filter((l) => !teacherOf(model, l)).length, 0);
  // One lesson: its teacher is picked in the box. Several (a choice): each has a teacher, so that stays in the window.
  const pickingLesson = pickingCell?.lessons.length === 1 ? pickingCell.lessons[0] : undefined;
  // No teacher in the school at all: said under the count of periods.
  const noTeacher = activeTeachers.length === 0 && !mother;
  // The subjects of "Subjects this week": those given periods a week, and any other that has a lesson in the week.
  const subjectRows = view.allotments.filter((a) => a.periodsPerWeek > 0 || (counts.get(a.subjectId) ?? 0) > 0);
  useEffect(() => {
    onStatus?.({ dirty, filled, total, noTeacher });
  }, [onStatus, dirty, filled, total, noTeacher]);
  useEffect(() => () => onStatus?.(null), [onStatus]);

  return (
    <div className="space-y-4">
      {/* The class's name, its year and where its timetable stands are the page's title (ClassTimetables); its buttons are in the line of the toolbar below. */}
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
              Set periods & time
            </Button>
            <Button variant="outline" onClick={onGoTimings}>
              Set the school timings
            </Button>
          </div>
        </Card>
      ) : editingSubjects ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden />
        Print
      </Button>
      {/* The teachers of the school are the ones the box of a period lists: this is the way to add one (2026-11-13). */}
      {can("teachers.add") && (
        <Link
          to="/teachers/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-primary/30 hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
        >
          <UserPlus className="size-4" aria-hidden />
          Add a teacher
        </Link>
      )}
      {siblings.length > 0 && (
        <Button variant="outline" onClick={() => setCopying(true)} disabled={dirty || !view.exists || view.cells.length === 0} title={dirty ? "Save first" : undefined}>
          <Copy className="size-4" aria-hidden />
          Copy to other sections
        </Button>
      )}

          </div>
        <Card className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <BookOpen className="size-5" />
            </span>
            <div>
              <h3 className="text-section-heading">{view.unit.label}: periods a week and teachers</h3>
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
        </>
      ) : (
        <div className="min-w-0 space-y-4">
          {/* The week's progress and its tools (2026-11-22, the reference pictures): how many periods have a lesson (a bar), Not saved, then Fill, Periods &
              time, the class teacher and Copy. Save is under the week, with Empty the whole week. */}
          <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4 print:hidden">
            <div className="min-w-[14rem] flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span role="status" aria-label="Periods with a lesson" className="font-bold text-foreground">
                    {filled} of {total} periods filled
                  </span>
                  {dirty && <Badge tone="warning">Not saved</Badge>}
                </span>
                <span className="text-xs font-semibold text-foreground-muted">{Math.max(0, total - filled)} empty</span>
              </div>
              <div aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-orange transition-[width]" style={{ width: `${total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0}%` }} />
              </div>
              {noTeacher && <p className="text-xs font-medium text-warning">No teacher available in your school</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={fillOrAsk} loading={filling} variant="outline">
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
                <Clock3 className="size-4" aria-hidden />
                Periods & time
              </Button>
              {/* Who the class teacher is (2026-11-17, in place of Add a teacher): with none it says Add class teacher, with one it says who, and a click
                  changes them (the list, then a window that asks first). In a Pre-Primary class they also take the periods that have no teacher. */}
              <ClassTeacherButton classId={unit.classId} sectionId={unit.sectionId} label={view.unit.label} current={head} look="button" onAssigned={headAssigned} />
              {prePrimary && mother && motherName && untaught > 0 && (
                <Button variant="ghost" onClick={() => edit(applyMotherTeacher(model, cells, mother, null))}>
                  Put {motherName} on {untaught} period{untaught === 1 ? "" : "s"} with no teacher
                </Button>
              )}
              {siblings.length > 0 && (
                <Button variant="outline" onClick={() => setCopying(true)} disabled={dirty || !view.exists || view.cells.length === 0} title={dirty ? "Save first" : undefined}>
                  <Copy className="size-4" aria-hidden />
                  Copy to other sections
                </Button>
              )}
            </div>
          </Card>

          {/* Subjects this week: each subject the class has with how many periods it has in the week and how many it was given. */}
          {subjectRows.length > 0 && (
            <Card className="p-4 print:hidden">
              <p className="mb-2.5 flex items-baseline gap-2 text-sm font-bold text-foreground">
                Subjects this week <span className="text-xs font-normal text-foreground-muted">placed / needed</span>
              </p>
              <ul aria-label="Subjects this week" className="flex flex-wrap gap-2">
                {subjectRows.map((a) => {
                  const placed = counts.get(a.subjectId) ?? 0;
                  const need = a.periodsPerWeek;
                  const tone = need === 0 ? "text-foreground-muted" : placed === need ? "text-success" : placed > need ? "text-danger" : "text-warning";
                  return (
                    <li key={a.subjectId} aria-label={`${a.subjectName}: ${placed} placed of ${need || "no"} needed`} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm font-semibold text-foreground">
                      <span aria-hidden className={cn("size-2 rounded-full", accents.get(a.subjectId)?.dot ?? "bg-primary")} />
                      {a.subjectName}
                      <span aria-hidden className={cn("text-xs font-bold tabular-nums", tone)}>
                        {placed}/{need || "–"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

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

          <GridTable view={view} model={model} cells={cells} colors={colors} accents={accents} problems={problems} looks={looks} openKey={picking ? cellKey(picking.day, picking.period) : null} onCell={openPeriod} />

          {/* Under the week: who sees it, Empty the whole week, and the one Save (it publishes a draft too: user, 2026-11-13). */}
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <p className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <Check className="size-3.5 shrink-0 text-success" aria-hidden />
              {view.status === "published" ? "Published: students and teachers see a change once you save it." : "Students and teachers see the timetable once you save it."}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {cells.length > 0 && (
                <Button variant="ghost" onClick={() => setClearing(true)}>
                  Empty the whole week
                </Button>
              )}
              <Button variant="accent" onClick={() => void submit()} loading={saving || publishing} disabled={!dirty && !publishSaved} title={!dirty && !publishSaved ? "Everything is saved" : undefined}>
                {!(saving || publishing) && (publishSaved ? <Send className="size-4" aria-hidden /> : <Save className="size-4" aria-hidden />)}
                {saveLabel}
              </Button>
            </div>
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
          dotOf={(subjectId) => accents.get(subjectId)?.dot}
          current={pickingCell?.lessons.map((l) => l.subjectId) ?? []}
          teacherName={(id) => (id ? (model.teachers.get(id)?.name ?? null) : null)}
          trouble={(choice) => teacherTrouble(model, choice.teacherId, picking.day, picking.period)}
          onChoose={choose}
          onCreate={createSubject}
          spread={prePrimary ? { value: spread, dayName: DAY_NAMES[picking.day], onChange: setSpread } : undefined}
          teachers={pickingLesson ? { subjectName: model.allotments.get(pickingLesson.subjectId)?.subjectName ?? "this subject", choices: teacherChoices(model, pickingLesson.subjectId, picking.day, picking.period, pickingLesson.teacherId, mother) } : undefined}
          onTeacher={(teacherId) => {
            if (!pickingLesson) return;
            // A Pre-Primary class has one teacher for what a day (or half of it) is: the one chosen takes all of it.
            const range = prePrimary && spread !== "week" ? spread : "period";
            edit(teacherOnRange(model, cells, picking.day, picking.period, pickingLesson.subjectId, teacherId, range));
            setPicking(null);
          }}
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
        <ClassTimingDialog
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
 * subjects to put in it, the program's help in filling it, the checks, Save (which publishes a draft too, one button at the top). Everything done in the grid stays on the screen
 * until "Save the timetable" (one request); the server checks it again and refuses a clash.
 */
export function ClassWeek({ unit, onGoTimings, onStatus }: { unit: UnitRef; onGoTimings: () => void; onStatus?: (status: ClassWeekStatus | null) => void }) {
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
  return <Workspace view={view} unit={unit} onReload={() => void res.refetch()} onGoTimings={onGoTimings} onStatus={onStatus} />;
}
