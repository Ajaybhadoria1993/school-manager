import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useBlocker } from "react-router";
import { ArrowRight, CalendarDays, Clock3, Layers, Save, School, TriangleAlert, Undo2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { DAY_NAMES } from "../../constants/timetable";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetSchedulesQuery, useRemoveDepartmentDayMutation, useSaveSchoolDayMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { WEEK_DAYS, daySummary, readWeek, setupOf, weekBody, weekProblems, type DayMode, type WeekPlan } from "../../utils/schoolWeek";
import { daysLabel } from "../../utils/timings";
import type { DepartmentItem, Schedule } from "../../types";
import { ConfirmModal } from "../classes/ConfirmModal";
import { AppModal, ModalError } from "../ui/AppModal";
import { Badge } from "../ui/Badge";
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

/** The classes of a department as small chips ("Classes  Class 1  Class 2 ..."); says so when it has none yet. */
function ClassChips({ department, classes, center = false }: { department: string; classes: { id: string; name: string }[]; center?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1.5", center && "justify-center")}>
      <span className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Classes</span>
      {classes.length > 0 ? (
        <ul aria-label={`Classes in ${department}`} className={cn("flex flex-wrap gap-1.5", center && "justify-center")}>
          {classes.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground">
              {c.name}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-foreground-muted">No classes in it yet</span>
      )}
    </div>
  );
}

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

/** The week in a few words: "Mon to Fri 08:30 to 14:20 · Sat 08:30 to 11:10 · Sun holiday" is too long, so only the usual day and the holidays. */
function weekSummary(plan: WeekPlan): string {
  const off = WEEK_DAYS.filter((d) => plan.days[d].mode === "off");
  const own = WEEK_DAYS.filter((d) => plan.days[d].mode === "own");
  return [daySummary(plan.usual), own.length > 0 ? `${daysLabel(own)} different` : null, off.length > 0 ? `${daysLabel(off)} off` : null].filter(Boolean).join(" · ");
}

/**
 * One week being changed, of the whole school or of one department: the usual day as a few numbers with the day drawn under them, then
 * each day of the week Usual / Different / Holiday. One Save sends the week (`PUT /timetable/school-day`). It starts from what the server
 * has (`read`) and again after every save.
 */
function WeekEditor({
  read,
  schedules,
  department,
  onNext,
  draft,
  classes,
  actions,
}: {
  read: ReturnType<typeof readWeek>;
  schedules: Schedule[];
  department: DepartmentItem | null;
  onNext: () => void;
  /** A department's classes, shown in the card's header. */
  classes?: { id: string; name: string }[];
  /** At the right of the card's header (a department: use the school's timing again, or cancel a new one). */
  actions?: ReactNode;
  /** Where this editor tells the tab about its changes (see `Draft`). */
  draft: MutableRefObject<Draft | null>;
}) {
  const { push } = useToast();
  const [saveWeek, { isLoading: saving }] = useSaveSchoolDayMutation();
  const [plan, setPlan] = useState<WeekPlan>(read.plan);
  const [readFrom, setReadFrom] = useState(schedules);
  const [failure, setFailure] = useState<{ message: string; lines: string[] } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const departmentId = department?.id ?? null;
  const who = department?.name ?? "Usual day";

  // What the server has is the starting point, again after every save (the save's answer is put into the read).
  if (readFrom !== schedules) {
    setReadFrom(schedules);
    setPlan(read.plan);
    setFailure(null);
  }

  const dirty = read.isNew || JSON.stringify(weekBody(plan, departmentId)) !== JSON.stringify(weekBody(read.plan, departmentId));
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
    const body = weekBody(plan, departmentId);
    try {
      await saveWeek(body).unwrap();
      push("success", department ? `${department.name}'s timing saved` : "School timings saved");
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

  // The tab asks this editor, when another group or tab is about to be opened, whether anything was changed. A week nobody has touched
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
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Clock3 className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-lg font-bold tracking-tight text-foreground">{department ? `${department.name}: usual day` : "Usual school day"}</h2>
                {department && read.isNew && <Badge tone="warning">Not saved yet</Badge>}
              </div>
              <p className="text-sm text-foreground-muted">{daySummary(plan.usual)}</p>
            </div>
          </div>
          {actions}
        </div>
        {department && classes && <ClassChips department={department.name} classes={classes} />}
        <DayFields idPrefix={departmentId ? `usual-${departmentId}` : "usual"} name={who} value={plan.usual} onChange={(usual) => edit({ ...plan, usual })} />
        <DayPreview name={who} value={plan.usual} />
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
            <h2 className="text-lg font-bold tracking-tight text-foreground">Days of the week</h2>
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
                    <DayFields idPrefix={`day-${departmentId ?? "school"}-${d}`} name={name} value={day.setup} onChange={(next) => edit({ ...plan, days: { ...plan.days, [d]: { mode: "own", setup: next } } })} />
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
          {department ? `Save ${department.name}'s timing` : "Save timings"}
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
 * "Save the changes to Pre-Primary's timing?": asked when another group, another tab or another page is about to be opened with changes
 * that were not saved. Save and continue sends the week and goes on only if it was saved (the reason is shown when it was not);
 * Don't save goes on and the changes are lost; Cancel stays.
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
 * Timetable > School timings. At the top, whose timing is shown: the whole school's, or a department's (Pre-Primary may keep other hours
 * than Primary). The whole school's week is set first; a department follows it until it is given a timing of its own, which is then its
 * whole week (made from the school's, so only what differs is changed) and can be taken away again. A class's own periods are not set
 * here: they are set on the class's timetable (Periods per day).
 */
export function SchoolTimingsTab({ onNext }: { onNext: () => void }) {
  const { push } = useToast();
  const res = useGetSchedulesQuery();
  const structure = useGetStructureQuery().data?.data;
  const [removeOwn] = useRemoveDepartmentDayMutation();
  const [group, setGroup] = useState<string>("school");
  // A department being given a timing of its own (its editor shows before anything is saved).
  const [starting, setStarting] = useState<string | null>(null);
  const [backToSchool, setBackToSchool] = useState<DepartmentItem | null>(null);
  // The week being edited (its editor fills it in) and, while a group is picked with changes in it, what to do once that is settled.
  const draft = useRef<Draft | null>(null);
  const [picked, setPicked] = useState<(() => void) | null>(null);

  // Changes that were not saved are asked about before another tab, another page or a reload takes them away.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => draft.current?.changed === true && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (draft.current?.changed) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const schedules = res.data?.data.items;
  const schoolRead = useMemo(() => (schedules ? readWeek(schedules) : null), [schedules]);
  const departments = structure?.departments ?? [];
  const classes = structure?.classes ?? [];
  const department = departments.find((d) => d.id === group) ?? null;
  const ownOf = (id: string) => (schedules ?? []).some((s) => s.departmentId === id);
  const departmentRead = useMemo(
    () => (schedules && schoolRead && department ? readWeek(schedules, department.id, schoolRead.plan) : null),
    [schedules, schoolRead, department]
  );

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

  const pick = (next: string) => {
    setGroup(next);
    setStarting(null);
  };
  /** Another group was asked for: with changes in this one, that is asked about first. */
  const pickGroup = (next: string) => {
    if (next === group) return;
    if (draft.current?.changed) setPicked(() => () => pick(next));
    else pick(next);
  };
  const classesOf = (id: string) => classes.filter((c) => c.departmentId === id).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-5">
      {departments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Timing for</p>
          <div role="radiogroup" aria-label="Timing for" className="flex flex-wrap gap-2">
            {[{ id: "school", name: "Whole school", own: true }, ...departments.map((d) => ({ id: d.id, name: d.name, own: ownOf(d.id) }))].map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={group === g.id}
                onClick={() => pickGroup(g.id)}
                className={cn(
                  "flex min-w-36 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                  group === g.id ? "border-primary bg-primary-soft text-primary-deep ring-1 ring-primary" : "border-border bg-surface text-foreground hover:border-primary/50"
                )}
              >
                {g.id === "school" ? <School className="size-4 shrink-0" aria-hidden /> : <Layers className="size-4 shrink-0" aria-hidden />}
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{g.name}</span>
                  <span className="block text-xs text-foreground-muted">{g.id === "school" ? "Every class" : `${classesOf(g.id).length} class${classesOf(g.id).length === 1 ? "" : "es"} · ${g.own ? "Own timing" : "Same as school"}`}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!department ? (
        <WeekEditor key="school" read={schoolRead} schedules={schedules} department={null} onNext={onNext} draft={draft} />
      ) : !ownOf(department.id) && starting !== department.id ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Layers className="size-6" />
          </span>
          <div>
            <p className="text-base font-bold text-foreground">{department.name} follows the school's timing</p>
            <p className="mt-1 text-sm text-foreground-muted">{weekSummary(schoolRead.plan)}</p>
          </div>
          <ClassChips department={department.name} classes={classesOf(department.id)} center />
          <Button onClick={() => setStarting(department.id)}>
            <Clock3 className="size-4" aria-hidden />
            Give {department.name} its own timing
          </Button>
        </Card>
      ) : (
        departmentRead && (
          <WeekEditor
            key={department.id}
            read={departmentRead}
            schedules={schedules}
            department={department}
            onNext={onNext}
            draft={draft}
            classes={classesOf(department.id)}
            actions={
              departmentRead.isNew ? (
                <Button variant="ghost" size="sm" onClick={() => setStarting(null)}>
                  Cancel
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setBackToSchool(department)}>
                  <Undo2 className="size-4" aria-hidden />
                  Use the school's timing again
                </Button>
              )
            }
          />
        )
      )}

      {(picked || blocker.state === "blocked") && (
        <SaveFirstModal
          what={department ? `${department.name}'s timing` : "the school's timing"}
          problem={draft.current?.problem ?? null}
          save={async () => (draft.current ? draft.current.save() : null)}
          onContinue={() => {
            if (picked) {
              picked();
              setPicked(null);
            } else if (blocker.state === "blocked") blocker.proceed();
          }}
          onStay={() => {
            setPicked(null);
            if (blocker.state === "blocked") blocker.reset();
          }}
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
