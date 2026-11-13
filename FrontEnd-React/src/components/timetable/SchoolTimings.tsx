import { useEffect, useMemo, useState } from "react";
import { useBlocker } from "react-router";
import { ArrowRight, CalendarDays, Clock3, Save, TriangleAlert } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { DAY_NAMES } from "../../constants/timetable";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetSchedulesQuery, useSaveSchoolDayMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { periodCount } from "../../utils/classWeek";
import { cn } from "../../utils/helpers";
import { deptSummary, storedSetup } from "../../utils/departmentDay";
import { WEEK_DAYS, daySummary, departmentRows, departmentRowsBody, readWeek, setupOf, usualDays, weekBody, weekProblems, type DayMode, type WeekPlan } from "../../utils/schoolWeek";
import type { ClassItem, DepartmentItem, Schedule, SchoolDayInput } from "../../types";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { ClassTimings } from "./ClassTimings";
import { DayFields, DayPreview } from "./DayFields";
import { DepartmentTimingDialog } from "./DepartmentTimingDialog";
import { DepartmentTimings, type DepartmentRow } from "./DepartmentTimings";
import { useFooterSlot } from "../layout/FooterSlot";
import { FixedSaveBar } from "./FixedSaveBar";

const MODES: { value: DayMode; label: string }[] = [
  { value: "usual", label: "Usual" },
  { value: "own", label: "Different" },
  { value: "off", label: "Holiday" },
];

/** What the server refused, and the days it named ("days.5.slots.0.end" is the sixth day sent). */
interface Failure {
  message: string;
  lines: string[];
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
 * "Save the changes to the school's timing?": asked when another page is about to be opened with changes that were not saved. Save and
 * continue sends them and goes on only if they were saved (the reason is shown when they were not); Don't save goes on and the changes
 * are lost; Cancel stays.
 */
function SaveFirstModal({
  what,
  problem,
  save,
  onContinue,
  onStay,
}: {
  what: string;
  /** What is wrong with the numbers now (they cannot be saved until that is fixed), or null. */
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
 * Everything on the page once the timings are read. The page holds what was changed in the school's week (the usual day and each day of the
 * week) and the one **Save changes**, fixed at the bottom of the screen, sends it (`PUT /timetable/school-day`). A department's own timing
 * and a class's own timing are changed in a window with a Save of its own (`DepartmentTimingDialog`, `ClassOwnTimingDialog`), so they are
 * saved when that Save is pressed. A department that has a timing of its own is sent again, with the rows it had, when the school's week is
 * saved with other usual days (its days are the school's usual days). Changes are kept against the timings they were made on: once those are
 * saved (the server's answer is put into the read) the changes are dropped and the boxes show what the server has.
 */
function Loaded({ schedules, departments, classes, onNext }: { schedules: Schedule[]; departments: DepartmentItem[]; classes: ClassItem[]; onNext: () => void }) {
  const { push } = useToast();
  const [saveWeek] = useSaveSchoolDayMutation();
  const read = useMemo(() => readWeek(schedules), [schedules]);
  const schoolSig = useMemo(() => JSON.stringify(schedules.filter((s) => s.scope === "all")), [schedules]);
  const [schoolEdit, setSchoolEdit] = useState<{ sig: string; plan: WeekPlan } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // The department whose window is open (Change timing).
  const [windowOf, setWindowOf] = useState<string | null>(null);
  // With the layout's footer strip the buttons have a place of their own; without it they are fixed over the page, which then leaves room for them.
  const hasFooter = useFooterSlot() !== null;

  // ---- The school's week ---------------------------------------------------------------------------------------------------------------
  const plan = schoolEdit && schoolEdit.sig === schoolSig ? schoolEdit.plan : read.plan;
  const schoolEdited = plan !== read.plan && JSON.stringify(plan) !== JSON.stringify(read.plan);
  // A school with no timing yet starts at the usual numbers, and those can be saved as they are.
  const dirty = read.isNew || (schoolEdited && JSON.stringify(weekBody(plan)) !== JSON.stringify(weekBody(read.plan)));
  const problems = weekProblems(plan);
  const problemOf = (where: "usual" | "week" | number) => problems.find((p) => p.where === where)?.message;
  const firstProblem = problems[0]?.message ?? null;

  // ---- The departments --------------------------------------------------------------------------------------------------------------------
  // The school's length of a period: a department set by hours (Pre-Primary) gets periods of it.
  const periodMinutes = plan.usual.periodMinutes;
  const rows: DepartmentRow[] = departments.map((department) => {
    const have = storedSetup(department, schedules, plan.usual);
    return { department, own: have.stored, summary: deptSummary(have.setup, periodMinutes) };
  });
  // A department's timing covers the school's usual days: when the school's week is saved with other usual days, a department that has a
  // timing of its own is sent again with it, with the rows it had.
  const usual = usualDays(plan);
  const resends =
    schoolEdited && dirty && usual.length > 0
      ? departments.filter((d) => {
          const days = [...new Set(schedules.filter((s) => s.departmentId === d.id && periodCount(s.slots) > 0).flatMap((s) => s.days))].sort((a, b) => a - b);
          return days.length > 0 && JSON.stringify(days) !== JSON.stringify(usual);
        })
      : [];

  // ---- Changing --------------------------------------------------------------------------------------------------------------------------
  const editPlan = (next: WeekPlan) => {
    setSchoolEdit({ sig: schoolSig, plan: next });
    setJustSaved(false);
    setFailure(null);
  };
  const setMode = (day: number, mode: DayMode) => {
    const before = plan.days[day];
    // A day that becomes different starts from the usual day, so only what differs has to be changed.
    const setup = mode === "own" && before.mode !== "own" ? { ...plan.usual } : before.setup;
    editPlan({ ...plan, days: { ...plan.days, [day]: { mode, setup } } });
  };
  const throwAway = () => {
    setSchoolEdit(null);
    setFailure(null);
    setJustSaved(false);
  };

  /** Sends the school's week, and then the departments whose days moved with it. Answers why it could not be saved (in words), or null when it was. */
  async function saveAll(): Promise<string | null> {
    if (firstProblem) return firstProblem;
    setFailure(null);
    interface Job {
      label: string;
      sent: SchoolDayInput;
    }
    const jobs: Job[] = [];
    if (dirty) jobs.push({ label: "School timings", sent: weekBody(plan) });
    for (const d of resends) jobs.push({ label: `${d.name}'s timing`, sent: departmentRowsBody(plan, departmentRows(schedules, d.id), d.id) });
    setSaving(true);
    try {
      for (const job of jobs) {
        try {
          await saveWeek(job.sent).unwrap();
        } catch (err) {
          const e = getApiError(err);
          const message = e?.message ?? "Could not save the timings. Please try again.";
          const lines = refusedByDay(e?.details, job.sent.days);
          setFailure({ message, lines });
          return [message, ...lines].join(" ");
        }
      }
    } finally {
      setSaving(false);
    }
    push("success", jobs.length === 1 ? `${jobs[0].label} saved` : "Timings saved");
    setJustSaved(true);
    return null;
  }

  // Changes that were not saved are asked about before another page or a reload takes them away.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => schoolEdited && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (!schoolEdited) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [schoolEdited]);

  const windowDepartment = windowOf ? departments.find((d) => d.id === windowOf) : undefined;

  return (
    <div className={cn("space-y-5", !hasFooter && "pb-20")}>
      {/* Two columns that begin together, under the title, and end together: the column beside the day stretches its last card to the foot. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
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
            <DayFields adaptive idPrefix="usual" name="Usual day" value={plan.usual} onChange={(usual) => editPlan({ ...plan, usual })} />
            {problemOf("usual") && (
              <p role="alert" className="text-sm font-medium text-danger">
                {problemOf("usual")}
              </p>
            )}
          </Card>

          <Card className="p-4">
            <DayPreview variant="line" name="Usual day" value={plan.usual} />
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start gap-3 px-5 pt-5">
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <CalendarDays className="size-5" />
              </span>
              <div className="min-w-0 self-center">
                <h2 className="text-section-heading">Days of the week</h2>
              </div>
            </div>
            <ul className="mt-4 divide-y divide-border border-t border-border" aria-label="Days of the week">
              {WEEK_DAYS.map((d) => {
                const day = plan.days[d];
                const name = DAY_NAMES[d];
                const setup = setupOf(plan, d);
                return (
                  <li key={d} className={cn("px-5 py-3", day.mode === "off" && "bg-danger-soft/40")}>
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
                              day.mode === m.value ? (m.value === "off" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-deep") : "text-foreground-muted hover:text-foreground"
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
                        <DayFields adaptive idPrefix={`day-school-${d}`} name={name} value={day.setup} onChange={(next) => editPlan({ ...plan, days: { ...plan.days, [d]: { mode: "own", setup: next } } })} />
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
          {!dirty && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-foreground-muted">{justSaved ? "Saved." : "Everything is saved."}</span>
              <button type="button" onClick={onNext} className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-primary-deep hover:underline">
                Now make each class's timetable
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </div>

        {/* Level with the Usual school day card: Class timings first (one class is the commonest change), then the departments. The last card
            grows to the foot of the page (`[&>:last-child]:flex-1`), so there is no blank space left under this column. */}
        <div className="flex min-w-0 flex-col gap-5 [&>:last-child]:flex-1">
          <ClassTimings classes={classes} departments={departments} schedules={schedules} />
          <DepartmentTimings rows={rows} onChange={setWindowOf} />
        </div>
      </div>

      {/* Fixed to the bottom of the screen (it does not move when the page scrolls): only the buttons, no band or card behind them, so each
          button has a solid look of its own, the disabled Save too. What is said when everything is saved is in the page, not here. */}
      <FixedSaveBar>
        {schoolEdited && (
          <Button variant="outline" onClick={throwAway}>
            Throw away changes
          </Button>
        )}
        <Button onClick={() => void saveAll()} loading={saving} disabled={!dirty || firstProblem !== null} className="disabled:bg-primary-soft disabled:text-primary/60 disabled:opacity-100 disabled:shadow-none">
          Save changes
        </Button>
      </FixedSaveBar>

      {windowDepartment && <DepartmentTimingDialog key={windowDepartment.id} department={windowDepartment} schedules={schedules} plan={read.plan} onClose={() => setWindowOf(null)} />}
      {blocker.state === "blocked" && <SaveFirstModal what="the school's timing" problem={firstProblem} save={saveAll} onContinue={() => blocker.proceed()} onStay={() => blocker.reset()} />}
    </div>
  );
}

/**
 * School timings (`/school/timings`, 2026-11-13 redesign after the reference pictures): on the left the school's usual day (the numbers, the day
 * drawn as a timeline) and what each day of the week does; beside it, the timings that differ: each department can follow the school or keep
 * a timing of its own, and any one class can come at hours of its own. A class follows its own timing, else its department's, else the
 * school's. The boxes are the same everywhere (starts, each period, how many, assembly, lunch, a short break). Save changes, fixed at the bottom
 * of the screen, saves the school's week; a department and a class each have a window with a Save of its own. Asked about before changes that
 * are not saved are lost.
 * The column beside the day (Class timings, then Department timings) starts level with the Usual school day card, under the title, and its
 * last card grows so that both columns end together (2026-11-13).
 */
export function SchoolTimings({ onNext }: { onNext: () => void }) {
  const res = useGetSchedulesQuery();
  const structure = useGetStructureQuery().data?.data;
  const schedules = res.data?.data.items;

  if (res.error && !schedules) {
    return (
      <div className="space-y-5">
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the timings."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }
  if (!schedules) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  return <Loaded schedules={schedules} departments={structure?.departments ?? []} classes={structure?.classes ?? []} onNext={onNext} />;
}
