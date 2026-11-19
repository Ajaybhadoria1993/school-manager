import { useState } from "react";
import { ArrowLeft, TriangleAlert, UserRoundCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { DAY_SHORT, MAX_PERIODS_PER_WEEK } from "../../constants/timetable";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useCan } from "../../hooks/useCan";
import { useAssignTeacherMutation, useCreateSubjectMutation, useGetAllotmentsQuery, useGetGridQuery, useGetSubjectsQuery, usePlaceTeacherPeriodsMutation, useSetClassTeacherMutation } from "../../redux/api/timetableApi";
import type { Subject, Teacher } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { subjectFitsClass } from "../../utils/subjectLevels";
import { describeChosen, describeSlots, slotTable } from "../../utils/teacherSlots";
import { assignWindow } from "../../utils/assignWindow";
import { shortDate } from "../../utils/weekDates";
import { onlyDigits } from "../../utils/teachers";
import { useSave } from "../classes/useSave";
import { FormActionBar } from "../students/form/FormActionBar";
import { ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { SearchSelect } from "../ui/SearchSelect";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { ClassTimetablePanel } from "./ClassTimetablePanel";
import { TeacherLessonsPanel } from "./TeacherLessonsPanel";
import { TeacherPeriodGrid } from "./TeacherPeriodGrid";

/** "No subject" in the subject box (the class teacher post alone). */
const NONE = "none";
/** The server's limit on a subject's name (backend/src/main/subjects/constants.ts). */
const MAX_SUBJECT_NAME = 40;
const twoDigits = onlyDigits(2);
const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

/**
 * Assign class, a page of its own (`/teachers/:id/assign-class`, 2026-11-13: it was a window; the user wanted a page). Gives a teacher a class: a class, its section (when it has sections), a subject of it and/or the class teacher post
 * of that section. It works class by class, as a school does: the **Subject** box offers what *that class studies* (and can be searched);
 * **Other subject…** at the end opens the school's other subjects that fit the class (a pre-school class is not offered Physics; "Show all
 * subjects" lists the rest), also searchable; and a name that is not a subject of the school yet is added with one click ("Add “Rhymes” as
 * a new subject") and chosen. A subject the class does not study yet is added to it with its periods a week. The same list the timetable
 * uses: the subject's periods are then the teacher's in the timetable. A subject that has another teacher says so under its box, and Assign
 * then asks first (a step of the same window: the other teacher is replaced, nothing is taken away unasked). The class teacher post is the
 * same: when the class already has one, the tick says who ("Class 5 - A already has a class teacher: Dev Patel") and Assign asks first, in
 * the same step as the subject's (one question for both); a teacher who already is it has nothing to tick.
 *
 * **What the teacher can teach (2026-11-13):** the Subject box offers the subjects chosen for this teacher when they were added (those the class
 * studies first); **Other subject…** opens every other subject of the school, so anything can still be given, and "Only Meena's subjects" goes back.
 * A teacher with none set starts on the Other list. Once the class is chosen, **the class's timetable as it is now** shows beside the form
 * (`ClassTimetablePanel`: who teaches what in the class and its week with each period's subject and teacher; the periods being chosen appear
 * in it dashed), so the person sees the class before giving it one more teacher; under it, **where the teacher already teaches** by day and hour
 * (`TeacherLessonsPanel`), since each class has its own timing (period 1 of one class is not the hour of period 1 of another).
 *
 * **Days and periods (2026-11-13):** once a subject is chosen, the class's week appears (the days down the side, its periods across): the
 * person chooses the periods the teacher teaches it in (a period the class uses for another subject, one where the teacher is in another class
 * and a day they do not come are greyed with the reason; the number at the top of a column chooses that period on every day). Assign then
 * gives the subject to the teacher AND puts those periods in the class's timetable in one request (`PUT /timetable/teacher-periods`, all or
 * nothing). Choosing none sends only the subject, as before. Only for a person who may change the timetable. The server checks the rest (a
 * teacher busy at a period the subject is taught is refused, with the reason).
 */
export function AssignClassForm({ teacher, backTo }: { teacher: Teacher; backTo: string }) {
  const navigate = useNavigate();
  const classes = useGetStructureQuery().data?.data.classes ?? [];
  const schoolSubjects = useGetSubjectsQuery("active").data?.data.items ?? [];
  const [assign] = useAssignTeacherMutation();
  const [placePeriods] = usePlaceTeacherPeriodsMutation();
  const can = useCan();
  const [setClassTeacher] = useSetClassTeacherMutation();
  const [createSubject, { isLoading: adding }] = useCreateSubjectMutation();
  const { push } = useToast();
  // A success goes back to the teacher's page (the message there says what was given); Cancel goes back too.
  const { busy, error, run } = useSave(() => navigate(backTo));

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState(NONE);
  // The subject box shows the other subjects of the school instead of the ones this teacher can teach (asked, or they have none set).
  const [other, setOther] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Subjects made in this window: the school's list may not have caught up when one is chosen.
  const [made, setMade] = useState<Subject[]>([]);
  const [newName, setNewName] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [periods, setPeriods] = useState("");
  const [head, setHead] = useState(false);
  const [tried, setTried] = useState(false);
  // The periods chosen in the class's week ("day:period"), for the class, section and subject they were chosen for (another subject starts again).
  const [chosen, setChosen] = useState<{ scope: string; keys: string[] }>({ scope: "", keys: [] });
  // Assigning a subject that has another teacher asks first: the window then shows that question in place of the boxes.
  const [confirming, setConfirming] = useState(false);

  const klass = classes.find((c) => c.id === classId);
  const hasSections = (klass?.sections.length ?? 0) > 0;
  const section = klass?.sections.find((s) => s.id === sectionId);
  const unitReady = !!klass && (!hasSections || !!section);
  const label = klass ? (section ? `${klass.name} - ${section.name}` : klass.name) : "";
  const allotment = useGetAllotmentsQuery({ classId, sectionId: section?.id ?? null }, { skip: !unitReady });
  const studies = allotment.data?.data.rows ?? [];
  const studied = new Set(studies.map((r) => r.subjectId));
  // The class teacher of the unit today: someone else is replaced by the tick (said under it, asked again before it is saved); the teacher
  // themselves already being it leaves nothing to tick.
  const sitting = unitReady ? (allotment.data?.data.classTeacher ?? null) : null;
  const alreadyHead = sitting?.id === teacher.id;
  const otherHead = sitting && !alreadyHead ? sitting : null;
  const wantsHead = head && !alreadyHead;
  const replacesHead = wantsHead ? otherHead : null;
  const known = [...schoolSubjects, ...made.filter((m) => !schoolSubjects.some((s) => s.id === m.id))];
  const subject = known.find((s) => s.id === subjectId);
  const isNew = subjectId !== NONE && unitReady && !studied.has(subjectId);
  const periodCount = Number(periods);
  const periodsValid = Number.isInteger(periodCount) && periodCount >= 1 && periodCount <= MAX_PERIODS_PER_WEEK;
  // The subject's teacher today, when it is somebody else: they are replaced by this assignment.
  const now = studies.find((r) => r.subjectId === subjectId);
  const replaces = now?.teacherId && now.teacherId !== teacher.id ? now : null;
  // Somebody is replaced by this assignment (the subject's teacher, the class teacher, or both): Assign asks first.
  const asks = !!replaces || !!replacesHead;

  // The class's week, read once the class is chosen (a person who may see timetables gets the panel of who teaches what beside the form; one who
  // may change it also gets the days and periods to choose once a subject is chosen).
  const canSee = can("timetable.view", "timetable.edit");
  const wantsGrid = canSee && unitReady;
  const wantsWeek = wantsGrid && can("timetable.edit") && subjectId !== NONE;
  const weekRes = useGetGridQuery({ classId, sectionId: section?.id ?? null }, { skip: !wantsGrid });
  const grid = wantsGrid ? weekRes.data?.data : undefined;
  const showPanel = wantsGrid && !weekRes.isError;
  const offDays = grid?.teachers.find((t) => t.id === teacher.id)?.offDays ?? teacher.offDays ?? [];
  const table = grid && wantsWeek ? slotTable(grid, subjectId, { id: teacher.id, offDays }) : null;
  // The seven days offered, from today (while the class has a period to come) or tomorrow: a period that is gone cannot be given.
  const moment = new Date();
  const columns = grid ? assignWindow(grid, moment) : [];
  const startNote = columns.length === 0 ? "" : `From ${columns[0].today ? "today" : "tomorrow"}, ${DAY_SHORT[columns[0].day]} ${shortDate(columns[0].date)}${columns[0].today ? "" : " (today's school is over)"} · then every week`;
  const showWeek = !!table && table.periods > 0;
  const placedNow = table ? table.rows.reduce((sum, r) => sum + r.cells.filter((c) => c?.state === "here").length, 0) : 0;
  const hasBlocked = !!table && table.rows.some((r) => r.cells.some((c) => c && (c.state === "taken" || c.state === "busy" || c.state === "off")));
  const scope = `${classId}|${section?.id ?? ""}|${subjectId}`;
  const slots = chosen.scope === scope && showWeek ? chosen.keys : [];
  // The periods that can still be chosen: what the subject has a week (the ones typed for a new subject), less those already in the timetable.
  const weekly = isNew ? (periodsValid ? periodCount : null) : (now?.periodsPerWeek ?? null);
  const capacity = weekly === null ? MAX_PERIODS_PER_WEEK : Math.max(0, weekly - placedNow);

  // What the box offers: the subjects this teacher can teach (the ones chosen when they were added), those the class studies first; or, with
  // "Other subject…", every other subject of the school (a pre-school class is not offered Physics unless asked: "Show all subjects"). A subject the
  // class already studies, and the chosen one, are always in that list.
  const mine = known.filter((s) => teacher.subjectIds.includes(s.id));
  const isMine = (id: string) => mine.some((s) => s.id === id);
  const mineFirst = [...mine.filter((s) => studied.has(s.id)), ...mine.filter((s) => !studied.has(s.id))];
  const showOther = unitReady && (other || mine.length === 0);
  const others = known.filter((s) => !isMine(s.id));
  const fitting = others.filter((s) => showAll || studied.has(s.id) || s.id === subjectId || subjectFitsClass(s.name, klass?.name ?? ""));
  const hidden = others.length - fitting.length;
  const subjectOptions = showOther
    ? fitting.map((s) => ({ value: s.id, label: s.name }))
    : [{ value: NONE, label: "No subject (class teacher only)" }, ...mineFirst.map((s) => ({ value: s.id, label: s.name }))];

  const problems = {
    classId: !klass ? "Choose a class" : undefined,
    sectionId: klass && hasSections && !section ? "Choose the section" : undefined,
    subjectId: unitReady && subjectId === NONE && !wantsHead ? (alreadyHead ? "Choose a subject" : "Choose a subject, or make them the class teacher") : undefined,
    // The periods chosen in the week are the subject's periods a week when the box is left empty.
    periods:
      isNew && slots.length === 0 && !periodsValid
        ? `Enter the periods a week (1 to ${MAX_PERIODS_PER_WEEK})`
        : isNew && periods !== "" && periodsValid && slots.length > periodCount
          ? `You chose ${slots.length} periods below: enter at least ${slots.length}, or take some off`
          : undefined,
  };
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);
  const serverSays = (path: string) => (Array.isArray(error?.details) ? (error.details as { path?: string; message?: string }[]).find((d) => d.path === path)?.message : undefined);

  /** A subject of the school with this name (whatever the capitals), if there is one. */
  const sameName = (text: string) => known.find((s) => s.name.toLowerCase() === tidy(text).toLowerCase());

  function choose(id: string) {
    setSubjectId(id);
    setSubjectError(null);
    setNewName(null);
  }

  /** A word typed that is not in the list: the school's subject of that name is chosen, else it is made (and chosen). */
  async function addSubject(text: string) {
    const wanted = tidy(text);
    if (wanted === "" || adding) return;
    if (wanted.length > MAX_SUBJECT_NAME) return setSubjectError(`Keep the subject name under ${MAX_SUBJECT_NAME} characters`);
    const same = sameName(wanted);
    if (same) {
      setOther(!isMine(same.id));
      return choose(same.id);
    }
    try {
      const response = await createSubject({ name: wanted }).unwrap();
      setMade((now) => [...now, response.data]);
      setOther(true);
      choose(response.data.id);
    } catch (err) {
      const problem = getApiError(err);
      const about = Array.isArray(problem?.details) ? (problem.details as { path?: string; message?: string }[]).find((d) => d.path === "name")?.message : undefined;
      setSubjectError(about ?? problem?.message ?? "Could not add the subject. Please try again.");
    }
  }

  function save() {
    setTried(true);
    if (Object.values(problems).some(Boolean) || !klass) return;
    if (asks && !confirming) return setConfirming(true);
    const unit = { classId: klass.id, sectionId: section?.id ?? null };
    const placing = !!subject && slots.length > 0 && !!table;
    void run(async () => {
      if (placing && subject) {
        // The subject and its periods go together: one request, all or nothing.
        const cells = slots
          .map((k) => k.split(":").map(Number))
          .sort((a, b) => a[0] - b[0] || a[1] - b[1])
          .map(([day, period]) => ({ day, period }));
        await placePeriods({ ...unit, subjectId: subject.id, teacherId: teacher.id, ...(isNew && periodsValid ? { periodsPerWeek: periodCount } : {}), slots: cells }).unwrap();
      } else if (subject) await assign({ ...unit, subjectId: subject.id, teacherId: teacher.id, ...(isNew ? { periodsPerWeek: periodCount } : {}) }).unwrap();
      if (wantsHead) await setClassTeacher({ ...unit, teacherId: teacher.id }).unwrap();
      const what = [subject ? `${subject.name} of ${label}` : null, wantsHead ? `the class teacher post of ${label}` : null].filter(Boolean).join(" and ");
      const when = placing && table ? ` (${describeSlots(slots, table)})` : isNew ? ". Place its periods in the class's timetable." : "";
      push("success", `${teacher.name} is given ${what}${when}`);
    });
  }

  const addRow = (text: string) => {
    const same = sameName(text);
    return same ? `Use “${same.name}”` : `Add “${tidy(text)}” as a new subject`;
  };

  const confirmingNow = confirming && asks;

  return (
    <div role="form" aria-label={`Assign a class to ${teacher.name}`} className="space-y-6">
      <div className={cn("grid gap-6", showPanel ? "lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:items-start" : "max-w-xl")}>
        <Card className="min-w-0 space-y-4 p-5">
      {confirmingNow ? (
        <div className="space-y-3 text-sm">
          {replaces && (
            <>
              <p className="flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 font-semibold text-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  {replaces.subjectName} of {label} is taught by {replaces.teacherName} now.
                </span>
              </p>
              <p>
                If you go on, {teacher.name} teaches it instead and {replaces.teacherName} no longer does. The periods already placed in the timetable go to {teacher.name}.
              </p>
            </>
          )}
          {replacesHead && (
            <>
              <p className="flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 font-semibold text-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  {label} already has a class teacher: {replacesHead.name}.
                </span>
              </p>
              <p>
                If you go on, {teacher.name} becomes the class teacher instead and {replacesHead.name} no longer is.
              </p>
            </>
          )}
          <ModalError message={error && !serverSays("subjectId") && !serverSays("teacherId") && !serverSays("periodsPerWeek") && !serverSays("slots") ? error.message : (serverSays("teacherId") ?? serverSays("subjectId") ?? null)} />
        </div>
      ) : (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="assign-class" label="Class" error={shown("classId")}>
            <Select
              id="assign-class"
              value={classId}
              placeholder="Select a class"
              invalid={!!shown("classId")}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(id) => {
                setClassId(id);
                // A class with one section has nothing to choose: that section is taken (the box shows it).
                const only = classes.find((c) => c.id === id)?.sections;
                setSectionId(only?.length === 1 ? only[0].id : "");
                setSubjectId(NONE);
                setOther(false);
                setShowAll(false);
                setNewName(null);
                setSubjectError(null);
              }}
            />
          </Field>
          {hasSections && (
            <Field id="assign-section" label="Section" error={shown("sectionId")}>
              <Select
                id="assign-section"
                value={sectionId}
                placeholder="Select the section"
                invalid={!!shown("sectionId")}
                options={(klass?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))}
                onChange={(id) => {
                  setSectionId(id);
                  setSubjectId(NONE);
                  setOther(false);
                  setNewName(null);
                  setSubjectError(null);
                }}
              />
            </Field>
          )}
        </div>

        <div className="space-y-2">
          <Field id="assign-subject" label={showOther ? "Other subject" : "Subject"} quiet error={shown("subjectId") ?? serverSays("subjectId") ?? serverSays("teacherId") ?? subjectError ?? undefined}>
            <SearchSelect
              id="assign-subject"
              value={subjectId === NONE ? "" : subjectId}
              disabled={!unitReady}
              placeholder={!unitReady ? "Choose the class first" : showOther ? "Search or type a subject" : "Search a subject they teach"}
              options={subjectOptions}
              onChange={choose}
              create={{
                // In the class's own list the last row opens the school's other subjects; in that list it is for typing a new one.
                idle: showOther ? "Add a new subject…" : "Other subject…",
                typed: addRow,
                onCreate: (text) => {
                  if (text) void addSubject(text);
                  else if (showOther) setNewName("");
                  else {
                    // The class's own subject that was chosen is let go: the box now shows the school's other subjects.
                    setOther(true);
                    setSubjectId(NONE);
                  }
                },
              }}
            />
          </Field>

          {unitReady && showOther && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {mine.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setOther(false);
                    if (!isMine(subjectId)) setSubjectId(NONE);
                    setNewName(null);
                    setSubjectError(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary-deep hover:underline"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Only {teacher.name}'s subjects
                </button>
              )}
              {hidden > 0 && (
                <button type="button" onClick={() => setShowAll(true)} className="cursor-pointer text-xs font-semibold text-foreground-muted hover:text-primary-deep hover:underline">
                  Show all subjects ({hidden} more)
                </button>
              )}
            </div>
          )}

          {newName !== null && (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field id="assign-new-subject" label="New subject" quiet>
                  <Input
                    id="assign-new-subject"
                    autoFocus
                    autoComplete="off"
                    maxLength={MAX_SUBJECT_NAME + 10}
                    placeholder="For example Rhymes"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addSubject(newName);
                      }
                    }}
                  />
                </Field>
              </div>
              <Button variant="secondary" loading={adding} onClick={() => void addSubject(newName)}>
                Add subject
              </Button>
            </div>
          )}

          {replaces && !showOther && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <span>
                {replaces.subjectName} of {label} is taught by {replaces.teacherName} now. Assigning it to {teacher.name} replaces them.
              </span>
            </p>
          )}

          {isNew && (
            <Field id="assign-periods" label="Periods a week" error={shown("periods") ?? serverSays("periodsPerWeek")}>
              <Input id="assign-periods" inputMode="numeric" autoComplete="off" placeholder="5" value={periods} onChange={(e) => setPeriods(twoDigits(e.target.value))} />
            </Field>
          )}
        </div>

        {wantsWeek && weekRes.isFetching && !grid && <Skeleton className="h-40 rounded-xl" />}
        {unitReady && subject && table && showWeek && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-bold text-foreground">Which days and periods?</p>
              {!(capacity === 0 && placedNow > 0) && (
                <p className="text-xs font-semibold text-foreground-muted">{`${slots.length} of ${capacity} chosen${placedNow > 0 ? ` · ${placedNow} already in the timetable` : ""}`}</p>
              )}
            </div>
            {capacity === 0 && placedNow > 0 ? (
              <p className="rounded-lg bg-success-soft px-3 py-2 text-xs font-medium text-foreground">
                All {placedNow} periods of {subject.name} are in the timetable of {label} already.
              </p>
            ) : (
              <TeacherPeriodGrid table={table} columns={columns} now={moment} label={label} teacherName={teacher.name} chosen={slots} capacity={capacity} onChange={(keys) => setChosen({ scope, keys })} />
            )}
            <p className="text-xs text-foreground-muted">{startNote}</p>
            {slots.length > 0 && (
              <ul aria-label="Chosen periods" className="space-y-0.5 rounded-lg bg-primary-soft/50 px-3 py-2 text-xs font-semibold text-primary-deep">
                {describeChosen(slots, table, new Map(columns.map((c) => [c.day, c.date]))).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {hasBlocked && capacity > 0 && <p className="text-xs text-foreground-muted">Grey: another subject of {label}. Amber: {teacher.name} teaches that subject in another class at that hour.</p>}
            {serverSays("slots") && (
              <p role="alert" className="text-xs font-medium text-danger">
                {serverSays("slots")}
              </p>
            )}
          </div>
        )}

        {unitReady && alreadyHead && (
          <p className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-3.5 py-3 text-sm font-semibold text-foreground">
            <UserRoundCheck className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              {teacher.name} is the class teacher of {label} already.
            </span>
          </p>
        )}
        {unitReady && !alreadyHead && (
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary-soft/50">
              <input type="checkbox" className="size-4 accent-primary" checked={head} onChange={(e) => setHead(e.target.checked)} />
              Class teacher of {label}
            </label>
            {otherHead && (
              <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                  {label} already has a class teacher: {otherHead.name}. Ticking this makes {teacher.name} the class teacher instead.
                </span>
              </p>
            )}
          </div>
        )}

        <ModalError message={error && !serverSays("subjectId") && !serverSays("teacherId") && !serverSays("periodsPerWeek") && !serverSays("slots") ? error.message : null} />
      </>
      )}
        </Card>
        {showPanel && (
          <div className="min-w-0 space-y-4">
            {grid ? (
              <ClassTimetablePanel grid={grid} now={moment} label={label} pending={slots.length > 0 && subject ? { keys: slots, subject: subject.name, teacher: teacher.name } : undefined} />
            ) : (
              <Skeleton className="h-72 rounded-xl" />
            )}
            {grid && <TeacherLessonsPanel teacher={teacher} columns={columns} />}
          </div>
        )}
      </div>

      <FormActionBar>
        {confirmingNow ? (
          <>
            <Button variant="outline" size="lg" onClick={() => setConfirming(false)} disabled={busy}>
              Back
            </Button>
            <Button size="lg" loading={busy} onClick={save}>
              Replace and assign
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="lg" onClick={() => navigate(backTo)} disabled={busy}>
              Cancel
            </Button>
            {/* While the class's list (and its class teacher) is still being read, Assign waits: it must know who is replaced to ask. */}
            <Button size="lg" loading={busy} disabled={unitReady && allotment.isFetching} onClick={save}>
              Assign
            </Button>
          </>
        )}
      </FormActionBar>
    </div>
  );
}
