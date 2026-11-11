import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useBlocker } from "react-router";
import { ArrowRight, Baby, CalendarDays, Clock3, Save, TriangleAlert, Undo2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { DAY_NAMES } from "../../constants/timetable";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetSchedulesQuery, useRemoveDepartmentDayMutation, useSaveSchoolDayMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { WEEK_DAYS, dayProblem, daySummary, departmentDayBody, readWeek, setupOf, weekBody, weekProblems, type DayMode, type WeekPlan } from "../../utils/schoolWeek";
import { isPrePrimaryName } from "../../utils/timetable";
import type { DaySetup } from "../../utils/timings";
import type { DepartmentItem, Schedule } from "../../types";
import { ConfirmModal } from "../classes/ConfirmModal";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { DayFields, DayPreview } from "./DayFields";

const MODES: { value: DayMode; label: string }[] = [
  { value: "usual", label: "Usual" },
  { value: "own", label: "Different" },
  { value: "off", label: "Holiday" },
];

/**
 * What the tab can ask of the week being edited (it is the editor's own state, so the editor says it): whether it was changed, what is
 * wrong with it, and to save it (answers why it could not, or null when it was saved).
 */
interface Draft {
  changed: boolean;
  problem: string | null;
  save: () => Promise<string | null>;
}

/** What the server refused, by day: "days.5.slots.0.end" is the sixth day sent. */
function refusedByDay(details: unknown, sent: { day: number }[]): string[] {
  return (Array.isArray(details) ? (details as { path?: string; message?: string }[]) : []).flatMap((d) => {
    const match = /^days\.(\d+)\./.exec(d.path ?? "");
    const day = match ? sent[Number(match[1])]?.day : undefined;
    return d.message ? [day ? `${DAY_NAMES[day]}: ${d.message}` : d.message] : [];
  });
}

/**
 * The school's week being changed: the usual day as a few numbers with the day drawn under them, then each day of the week Usual /
 * Different / Holiday. One Save sends the week (`PUT /timetable/school-day`). It starts from what the server has (`read`) and again after
 * every save.
 */
function WeekEditor({
  read,
  schedules,
  onNext,
  draft,
}: {
  read: ReturnType<typeof readWeek>;
  schedules: Schedule[];
  onNext: () => void;
  /** Where this editor tells the tab about its changes (see `Draft`). */
  draft: MutableRefObject<Draft | null>;
}) {
  const { push } = useToast();
  const [saveWeek, { isLoading: saving }] = useSaveSchoolDayMutation();
  const [plan, setPlan] = useState<WeekPlan>(read.plan);
  const [readFrom, setReadFrom] = useState(schedules);
  const [failure, setFailure] = useState<{ message: string; lines: string[] } | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // What the server has is the starting point, again after every save (the save's answer is put into the read).
  if (readFrom !== schedules) {
    setReadFrom(schedules);
    setPlan(read.plan);
    setFailure(null);
  }

  const dirty = read.isNew || JSON.stringify(weekBody(plan)) !== JSON.stringify(weekBody(read.plan));
  const problems = weekProblems(plan);
  const problemOf = (where: "usual" | "week" | number) => problems.find((p) => p.where === where)?.message;

  const edit = (next: WeekPlan) => {
    setPlan(next);
    setJustSaved(false);
    setFailure(null);
  };
  const setMode = (day: number, mode: DayMode) => {
    const before = plan.days[day];
    // A day that becomes different starts from the usual day, so only what differs has to be changed.
    const setup = mode === "own" && before.mode !== "own" ? { ...plan.usual } : before.setup;
    edit({ ...plan, days: { ...plan.days, [day]: { mode, setup } } });
  };

  /** Sends the week. Answers why it could not be saved (in words), or null when it was. */
  async function save(): Promise<string | null> {
    if (problems.length > 0) return problems[0].message;
    setFailure(null);
    const body = weekBody(plan);
    try {
      await saveWeek(body).unwrap();
      push("success", "School timings saved");
      setJustSaved(true);
      return null;
    } catch (err) {
      const e = getApiError(err);
      const message = e?.message ?? "Could not save the timings. Please try again.";
      const lines = refusedByDay(e?.details, body.days);
      setFailure({ message, lines });
      return [message, ...lines].join(" ");
    }
  }

  // The tab asks this editor, when another tab or page is about to be opened, whether anything was changed. A week nobody has touched
  // is not a change (a school with no timing yet starts at the usual numbers, and that is not "unsaved work").
  const changed = JSON.stringify(plan) !== JSON.stringify(read.plan);
  useEffect(() => {
    draft.current = { changed, problem: problems[0]?.message ?? null, save };
    return () => {
      draft.current = null;
    };
  });

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Clock3 className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-heading">Usual school day</h2>
            <p className="text-sm text-foreground-muted">{daySummary(plan.usual)}</p>
          </div>
        </div>
        <DayFields idPrefix="usual" name="Usual day" value={plan.usual} onChange={(usual) => edit({ ...plan, usual })} />
        <DayPreview name="Usual day" value={plan.usual} />
        {problemOf("usual") && (
          <p role="alert" className="text-sm font-medium text-danger">
            {problemOf("usual")}
          </p>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-3 px-5 pt-5">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CalendarDays className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-heading">Days of the week</h2>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-border border-t border-border" aria-label="Days of the week">
          {WEEK_DAYS.map((d) => {
            const day = plan.days[d];
            const name = DAY_NAMES[d];
            const setup = setupOf(plan, d);
            return (
              <li key={d} className={cn("px-5 py-3", day.mode === "off" && "bg-surface-muted/50")}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="w-24 shrink-0 text-sm font-bold text-foreground">{name}</span>
                  <div role="radiogroup" aria-label={name} className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                    {MODES.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        role="radio"
                        aria-checked={day.mode === m.value}
                        onClick={() => setMode(d, m.value)}
                        className={cn(
                          "h-8 cursor-pointer rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                          day.mode === m.value ? (m.value === "off" ? "bg-surface-muted text-foreground" : "bg-primary-soft text-primary-deep") : "text-foreground-muted hover:text-foreground"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-sm text-foreground-muted">{setup ? daySummary(setup) : "No school"}</span>
                </div>
                {day.mode === "own" && (
                  <div className="mt-3 space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <DayFields idPrefix={`day-school-${d}`} name={name} value={day.setup} onChange={(next) => edit({ ...plan, days: { ...plan.days, [d]: { mode: "own", setup: next } } })} />
                    <DayPreview name={name} value={day.setup} />
                    {problemOf(d) && (
                      <p role="alert" className="text-sm font-medium text-danger">
                        {problemOf(d)}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {read.handMade.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Some times of {read.handMade.join(", ")} were changed by hand. Saving here makes the periods again from these numbers.</span>
        </p>
      )}
      {problemOf("week") && (
        <p role="alert" className="text-sm font-medium text-danger">
          {problemOf("week")}
        </p>
      )}
      {failure && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="font-medium">{failure.message}</p>
          {failure.lines.map((line) => (
            <p key={line} className="mt-1">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} loading={saving} disabled={!dirty || problems.length > 0}>
          Save timings
        </Button>
        {dirty && !read.isNew && (
          <Button variant="ghost" onClick={() => edit(read.plan)}>
            Throw away changes
          </Button>
        )}
        {!dirty && (
          <>
            <span className="text-sm text-foreground-muted">{justSaved ? "Saved." : "Everything is saved."}</span>
            <button type="button" onClick={onNext} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary-deep hover:underline">
              Now make each class's timetable
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Pre-Primary's own day (2026-11-10, user: "pre-primary ka timing alag ho sakta hai, jaldi shuru ho"): the only department that may keep
 * a timing of its own on this page. It follows the school's until it is given its own, which starts from the school's usual day, so only
 * what differs (an earlier start, fewer periods, its lunch) is changed. It is sent for the school's usual days (`departmentDayBody`): a day
 * the school keeps different, and a holiday, stay the school's for its classes too. *Use the school's timing* takes it away (asks first).
 */
function DepartmentDay({
  department,
  schedules,
  schoolPlan,
  draft,
  onUseSchool,
}: {
  department: DepartmentItem;
  schedules: Schedule[];
  schoolPlan: WeekPlan;
  /** Where this box tells the page about its changes (see `Draft`). */
  draft: MutableRefObject<Draft | null>;
  onUseSchool: () => void;
}) {
  const { push } = useToast();
  const [saveWeek, { isLoading: saving }] = useSaveSchoolDayMutation();
  const own = schedules.some((s) => s.departmentId === department.id);
  const read = useMemo(() => (own ? readWeek(schedules, department.id).plan.usual : schoolPlan.usual), [own, schedules, department.id, schoolPlan]);
  const [starting, setStarting] = useState(false);
  const [setup, setSetup] = useState<DaySetup>(read);
  const [readFrom, setReadFrom] = useState(read);
  const [failure, setFailure] = useState<string | null>(null);

  // What the server has is the starting point, again after every save (the save's answer is put into the read).
  if (readFrom !== read) {
    setReadFrom(read);
    setSetup(read);
    setStarting(false);
    setFailure(null);
  }

  const editing = own || starting;
  const changed = editing && JSON.stringify(setup) !== JSON.stringify(read);
  const problem = editing ? (dayProblem(setup) ?? null) : null;

  /** Sends the day. Answers why it could not be saved (in words), or null when it was. */
  async function save(): Promise<string | null> {
    if (problem) return problem;
    const body = departmentDayBody(schoolPlan, setup, department.id);
    if (body.days.length === 0) return "Set the school's week first: it has no usual day yet";
    setFailure(null);
    try {
      await saveWeek(body).unwrap();
      push("success", `${department.name}'s timing saved`);
      return null;
    } catch (err) {
      const message = getApiError(err)?.message ?? "Could not save the timing. Please try again.";
      setFailure(message);
      return message;
    }
  }

  useEffect(() => {
    draft.current = { changed, problem, save };
    return () => {
      draft.current = null;
    };
  });

  return (
    <Card role="region" aria-label={`${department.name} timing`} className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Baby className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-heading">{department.name} timing</h2>
            <p className="text-sm text-foreground-muted">{editing ? daySummary(setup) : "Same as the school"}</p>
          </div>
        </div>
        {own ? (
          <Button variant="ghost" size="sm" onClick={onUseSchool}>
            <Undo2 className="size-4" aria-hidden />
            Use the school's timing
          </Button>
        ) : starting ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStarting(false);
              setSetup(read);
              setFailure(null);
            }}
          >
            Cancel
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setStarting(true)}>
            <Clock3 className="size-4" aria-hidden />
            Give {department.name} its own timing
          </Button>
        )}
      </div>
      {editing && (
        <>
          <DayFields
            idPrefix={`dept-${department.id}`}
            name={department.name}
            value={setup}
            onChange={(next) => {
              setSetup(next);
              setFailure(null);
            }}
          />
          <DayPreview name={department.name} value={setup} />
          {problem && (
            <p role="alert" className="text-sm font-medium text-danger">
              {problem}
            </p>
          )}
          {failure && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {failure}
            </p>
          )}
          <div>
            <Button onClick={() => void save()} loading={saving} disabled={!(changed || (starting && !own)) || !!problem}>
              Save {department.name} timing
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * "Save the changes to the school's timing?": asked when another tab or another page is about to be opened with changes that were not
 * saved. Save and continue sends the week and goes on only if it was saved (the reason is shown when it was not); Don't save goes on and
 * the changes are lost; Cancel stays.
 */
function SaveFirstModal({
  what,
  problem,
  save,
  onContinue,
  onStay,
}: {
  what: string;
  /** What is wrong with the week now (it cannot be saved until that is fixed), or null. */
  problem: string | null;
  save: () => Promise<string | null>;
  onContinue: () => void;
  onStay: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAndGo() {
    setBusy(true);
    setError(null);
    const why = await save();
    setBusy(false);
    if (why) setError(why);
    else onContinue();
  }

  return (
    <AppModal
      title={`Save the changes to ${what}?`}
      icon={Save}
      busy={busy}
      onClose={onStay}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onStay} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton variant="secondary" onPress={onContinue} isDisabled={busy}>
            Don't save
          </HeroButton>
          <HeroButton variant="primary" isPending={busy} isDisabled={problem !== null} onPress={() => void saveAndGo()}>
            Save and continue
          </HeroButton>
        </>
      }
    >
      <p className="text-sm text-foreground-muted">You changed {what} and have not saved it.</p>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      )}
      <ModalError message={error} />
    </AppModal>
  );
}

/**
 * School timings (2026-11-09; its own page, `/school/timings`, no longer a tab): ONE timing for the whole school, the same for every class: when school starts, how long a
 * period is, the lunch (and a short break), and which days are school days. There is no choice by department any more, except Pre-Primary,
 * which may keep a day of its own (2026-11-10, its box under the school's). A class with
 * fewer periods than the school's day keeps the school's times for the periods it has (it is there for as many periods as it has
 * lessons; a class called at other hours has the Class timing box on its timetable). A department that still has a timing of its own from before is said so at the top, with a way back to
 * the school's timing (the only thing left of department timings in the screens).
 */
export function SchoolTimings({ onNext }: { onNext: () => void }) {
  const { push } = useToast();
  const res = useGetSchedulesQuery();
  const structure = useGetStructureQuery().data?.data;
  const [removeOwn] = useRemoveDepartmentDayMutation();
  const [backToSchool, setBackToSchool] = useState<DepartmentItem | null>(null);
  // The week being edited (its editor fills it in).
  const draft = useRef<Draft | null>(null);
  // Pre-Primary's box, when the school has that department.
  const deptDraft = useRef<Draft | null>(null);

  // Changes that were not saved are asked about before another tab, another page or a reload takes them away.
  const anyChange = () => draft.current?.changed === true || deptDraft.current?.changed === true;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => anyChange() && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (draft.current?.changed || deptDraft.current?.changed) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const schedules = res.data?.data.items;
  const schoolRead = useMemo(() => (schedules ? readWeek(schedules) : null), [schedules]);
  const prePrimary = (structure?.departments ?? []).find((d) => isPrePrimaryName(d.name)) ?? null;
  const stillOwn = (structure?.departments ?? []).filter((d) => d.id !== prePrimary?.id && (schedules ?? []).some((s) => s.departmentId === d.id));

  if (res.error && !schedules) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the timings."}</p>
        <Button variant="outline" onClick={() => res.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!schedules || !schoolRead) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {stillOwn.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="flex items-start gap-2 font-medium">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{d.name} still keeps a timing of its own.</span>
          </p>
          <Button variant="outline" size="sm" aria-label={`${d.name}: use the school's timing`} onClick={() => setBackToSchool(d)}>
            Use the school's timing
          </Button>
        </div>
      ))}

      <WeekEditor key="school" read={schoolRead} schedules={schedules} onNext={onNext} draft={draft} />
      {prePrimary && <DepartmentDay key={prePrimary.id} department={prePrimary} schedules={schedules} schoolPlan={schoolRead.plan} draft={deptDraft} onUseSchool={() => setBackToSchool(prePrimary)} />}

      {blocker.state === "blocked" && (
        <SaveFirstModal
          what={draft.current?.changed && deptDraft.current?.changed ? "the timings" : deptDraft.current?.changed && prePrimary ? `${prePrimary.name}'s timing` : "the school's timing"}
          problem={[draft.current, deptDraft.current].find((d) => d?.changed)?.problem ?? null}
          save={async () => {
            for (const d of [draft.current, deptDraft.current]) {
              if (!d?.changed) continue;
              const why = await d.save();
              if (why) return why;
            }
            return null;
          }}
          onContinue={() => blocker.proceed()}
          onStay={() => blocker.reset()}
        />
      )}
      {backToSchool && (
        <ConfirmModal
          title={`${backToSchool.name}: use the school's timing again?`}
          confirmLabel="Use the school's timing"
          onClose={() => setBackToSchool(null)}
          onConfirm={async () => {
            await removeOwn(backToSchool.id).unwrap();
            push("success", `${backToSchool.name} follows the school's timing again`);
          }}
        >
          <p>Its own timing goes, and its classes follow the school's week. This cannot be done while their timetables have lessons in periods the school's day does not have.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
