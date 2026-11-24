import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useSearchParams } from "react-router";
import { ArrowRight, CalendarDays, Check, Clock3, Info, Landmark, Save, Send, Star, TriangleAlert, UsersRound } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { DAY_NAMES } from "../../constants/timetable";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetSchedulesQuery, useGetSpecialDaysQuery, useSaveSchoolDayMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { classOwnTimings, periodCount } from "../../utils/classWeek";
import { clock12 } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { deptRows, deptSummary, storedSetup } from "../../utils/departmentDay";
import { WEEK_DAYS, daySummary, departmentRows, departmentRowsBody, moveStart, readWeek, setupOf, shiftMinutes, usualDays, weekBody, weekProblems, type DayMode, type WeekPlan } from "../../utils/schoolWeek";
import { visibleClash, clockToMinutes, formatMinutes, generateDay, shiftSlots, type DaySetup } from "../../utils/timings";
import type { ClassItem, DepartmentItem, Schedule, SchoolDayInput, SpecialDay } from "../../types";
import { StudentFormHeader } from "../students/StudentFormHeader";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { PageTabs } from "../ui/PageTabs";
import { TabPanel } from "../ui/TabPanel";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { DayFields, DayPreview } from "./DayFields";
import { DepartmentTimingDialog } from "./DepartmentTimingDialog";
import { ClassTimingsCard, DepartmentTimingsCard, type DepartmentRow } from "./GroupTimings";
import { ClassOwnTimingDialog } from "./ClassOwnTimingDialog";
import { UseSchoolTimingModal } from "./UseSchoolTimingModal";
import { useFooterSlot } from "../layout/FooterSlot";
import { FixedSaveBar } from "./FixedSaveBar";
import { DayBar, DayFigures } from "./TimingParts";
import { SpecialDayDialog, SpecialDaysCard } from "./SpecialDays";


/** The page's title, its one line under it, and the trail; `status` at the right (Saved / Unsaved changes). */
function Header({ status }: { status?: React.ReactNode }) {
  return (
    <StudentFormHeader
      title="School timings"
      subtitle="Set when your school starts, ends and takes breaks. Every class follows this, unless you give a class or department its own timing."
      crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
      actions={status}
    />
  );
}

/** "Saved · 2:51 PM" (green) when nothing waits to be saved; "Unsaved changes" (amber) when something does. */
function SavedPill({ dirty, savedAt }: { dirty: boolean; savedAt: string | null }) {
  const saved = savedAt ? `Saved · ${savedAt}` : "Saved";
  return dirty ? (
    <span role="status" aria-label="Unsaved changes" className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning ring-1 ring-inset ring-warning/30">
      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      Unsaved changes
    </span>
  ) : (
    <span role="status" aria-label={saved} className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success ring-1 ring-inset ring-success/30">
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      {saved}
    </span>
  );
}

/** The time now in India, as the page says it ("2:51 PM"). */
const nowIn12 = () => clock12(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));

/** What was changed in the school's week, in a few words ("Lunch time was updated", "Periods and Lunch time were updated"). */
function whatChanged(before: WeekPlan, after: WeekPlan, isNew: boolean): string {
  if (isNew) return "The school's first timing";
  const a = before.usual;
  const b = after.usual;
  const parts = [
    a.start !== b.start && "School start",
    (a.arrivalMinutes ?? 0) !== (b.arrivalMinutes ?? 0) && "Classes start",
    a.periodMinutes !== b.periodMinutes && "Period length",
    a.periods !== b.periods && "Periods",
    a.assemblyMinutes !== b.assemblyMinutes && "Assembly",
    (a.lunchStart !== b.lunchStart || a.lunchEnd !== b.lunchEnd) && "Lunch time",
    (a.breakStart !== b.breakStart || a.breakEnd !== b.breakEnd) && "Short break",
    JSON.stringify(before.days) !== JSON.stringify(after.days) && "Days of the week",
  ].filter((p): p is string => typeof p === "string");
  if (parts.length === 0) return "The school's timing was updated";
  if (parts.length === 1) return `${parts[0]} was updated`;
  return `${parts.slice(0, 2).join(" and ")}${parts.length > 2 ? ` and ${parts.length - 2} more` : ""} were updated`;
}

/** The week in a window ("Preview week"): each day with school as its bar, the others as a holiday. */
function PreviewWeekModal({ plan, onClose }: { plan: WeekPlan; onClose: () => void }) {
  return (
    <AppModal
      title="This week"
      icon={CalendarDays}
      size="lg"
      onClose={onClose}
      footer={
        <HeroButton variant="primary" onPress={onClose}>
          Close
        </HeroButton>
      }
    >
      <ul aria-label="The week, day by day" className="space-y-3">
        {WEEK_DAYS.map((d) => {
          const setup = setupOf(plan, d);
          return (
            <li key={d} className="space-y-1.5 rounded-xl border border-border p-3">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-foreground">{DAY_NAMES[d]}</span>
                <span className="text-xs text-foreground-muted">{setup ? daySummary(setup) : "Holiday"}</span>
              </p>
              {setup && <DayBar name={`${DAY_NAMES[d]} preview`} slots={generateDay(setup).slots} />}
            </li>
          );
        })}
      </ul>
    </AppModal>
  );
}

/**
 * Days of the week (2026-11-22, the reference pictures): a pill for each day, dark when the school runs that day (a click turns it into a
 * holiday, and back). A day can have a timing of its own: **Set different Saturday timing** (the usual short day) or **Another day**; such a day
 * has a small dot in its pill and its own boxes under the pills, with **Use the usual timing** to follow the usual day again.
 */
function WeekDays({ plan, problemOf, setMode, setOwn }: { plan: WeekPlan; problemOf: (day: number) => string | undefined; setMode: (day: number, mode: DayMode) => void; setOwn: (day: number, setup: DaySetup) => void }) {
  const [choosing, setChoosing] = useState(false);
  const open = WEEK_DAYS.filter((d) => plan.days[d].mode !== "off");
  const own = WEEK_DAYS.filter((d) => plan.days[d].mode === "own");
  const usualOnes = WEEK_DAYS.filter((d) => plan.days[d].mode === "usual");
  const saturdayFree = plan.days[6].mode === "usual";
  const line = `${open.length}-day week · ${own.length === 0 ? "all days use the usual timing" : `${own.map((d) => DAY_NAMES[d]).join(", ")} ${own.length === 1 ? "has its" : "have their"} own timing`}`;
  const link = "cursor-pointer text-sm font-semibold text-primary-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CalendarDays className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-heading">Days of the week</h2>
            <p className="text-sm text-foreground-muted">{line}</p>
          </div>
        </div>
        {usualOnes.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {saturdayFree && (
              <button type="button" className={link} onClick={() => setMode(6, "own")}>
                Set different Saturday timing
              </button>
            )}
            <button type="button" className={link} aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>
              {saturdayFree ? "Another day" : "Set a different timing for a day"}
            </button>
          </div>
        )}
      </div>

      <div role="group" aria-label="School days" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {WEEK_DAYS.map((d) => {
          const mode = plan.days[d].mode;
          const on = mode !== "off";
          const setup = setupOf(plan, d);
          const slots = setup ? generateDay(setup).slots : [];
          const hours = on && slots.length > 0 ? `${slots[0].start}–${slots[slots.length - 1].end}` : "Holiday";
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={DAY_NAMES[d]}
              title={on ? (mode === "own" ? `${DAY_NAMES[d]}: its own timing` : `${DAY_NAMES[d]}: usual timing`) : `${DAY_NAMES[d]}: holiday`}
              onClick={() => setMode(d, on ? "off" : "usual")}
              className={cn(
                "relative flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                on ? "border-primary/30 bg-primary-soft/70 text-primary-deep hover:bg-primary-soft" : "border-dashed border-border bg-surface text-foreground-muted hover:border-primary/40 hover:text-foreground"
              )}
            >
              <span className="text-sm font-bold">{DAY_NAMES[d]}</span>
              <span aria-hidden className="text-xs font-medium tabular-nums opacity-80">
                {hours}
              </span>
              {mode === "own" && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-orange ring-2 ring-surface" />}
            </button>
          );
        })}
      </div>

      {choosing && usualOnes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5">
          <span className="text-sm text-foreground-muted">Which day has a different timing?</span>
          <div role="group" aria-label="Day with a different timing" className="flex flex-wrap gap-1.5">
            {usualOnes.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setMode(d, "own");
                  setChoosing(false);
                }}
                className="h-8 cursor-pointer rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:border-primary/50 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {DAY_NAMES[d]}
              </button>
            ))}
          </div>
        </div>
      )}

      {own.map((d) => {
        const name = DAY_NAMES[d];
        const day = plan.days[d];
        return (
          <section key={d} aria-label={`${name} timing`} className="space-y-3 rounded-xl border border-orange/30 bg-orange-soft/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">
                {name} has its own timing <span className="font-normal text-foreground-muted">· {daySummary(day.setup)}</span>
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setMode(d, "usual")}>
                Use the usual timing
              </Button>
            </div>
            <DayFields adaptive idPrefix={`day-school-${d}`} name={name} value={day.setup} onChange={(next) => setOwn(d, next)} />
            <DayPreview name={name} value={day.setup} />
            {problemOf(d) && !visibleClash(day.setup) && (
              <p role="alert" className="text-sm font-medium text-danger">
                {problemOf(d)}
              </p>
            )}
          </section>
        );
      })}
    </Card>
  );
}

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
  // When this visit last saved the week ("2:51 PM"), for the Saved line at the top; null until then.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // The department whose window is open (Change timing).
  const [windowOf, setWindowOf] = useState<string | null>(null);
  // Which tab is open (2026-11-23, the reference: Usual / Class / Department / Special day timings), kept in the address.
  const [params, setParams] = useSearchParams();
  const tab: TimingTab = TIMING_TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as TimingTab) : "usual";
  const openTab = (next: TimingTab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === "usual") p.delete("tab");
      else p.set("tab", next);
      return p;
    });
  // A class's own timing in its window (null: closed; classId null: adding), and the class about to go back to the school's timing.
  const [classWindow, setClassWindow] = useState<{ classId: string | null } | null>(null);
  const [going, setGoing] = useState<{ id: string; name: string } | null>(null);
  // The days with a timing of their own (a PTM, a half day; 2026-11-22), and the one open in its window ("new" for Special day).
  const specialDays = useGetSpecialDaysQuery().data?.data.items ?? [];
  const [special, setSpecial] = useState<SpecialDay | "new" | null>(null);
  // The classes and departments ticked to move with the school's start (2026-11-22: none until ticked), kept against the timings they were ticked on.
  const [ticks, setTicks] = useState<{ sig: string; keys: string[] } | null>(null);
  // With the layout's footer strip the buttons have a place of their own; without it they are fixed over the page, which then leaves room for them.
  const hasFooter = useFooterSlot() !== null;

  // ---- The school's week ---------------------------------------------------------------------------------------------------------------
  const plan = schoolEdit && schoolEdit.sig === schoolSig ? schoolEdit.plan : read.plan;
  const schoolEdited = plan !== read.plan && JSON.stringify(plan) !== JSON.stringify(read.plan);
  // A school with no timing yet starts at the usual numbers, and those can be saved as they are.
  const dirty = read.isNew || (schoolEdited && JSON.stringify(weekBody(plan)) !== JSON.stringify(weekBody(read.plan)));
  const problems = weekProblems(plan);
  const problemOf = (where: "usual" | "week" | number) => problems.find((p) => p.where === where)?.message;

  // ---- The winter shift (2026-11-17) -------------------------------------------------------------------------------------------------------
  // School starts later (or earlier) than it was saved: the lunch and the days of its own moved in the boxes at once; the timings of the
  // classes and departments that keep hours of their own move with it when this is saved (the server does it in the same save).
  // Each class or department with hours of its own has a tick (2026-11-22, user: "check na kare to time nahi badhega, check kare to badh jayega"):
  // only the ticked ones move, none until ticked; the server moves them in the same save (`shiftOnly`).
  const shift = read.isNew || !dirty ? 0 : (shiftMinutes(read.plan.usual.start, plan.usual.start) ?? 0);
  const others = schedules.filter((s) => s.scope !== "all" && periodCount(s.slots) > 0);
  const classNameOf = (id: string) => classes.find((c) => c.id === id)?.name;
  const movable = movableGroups(others, (s) => (s.departmentId ? departments.find((d) => d.id === s.departmentId)?.name : s.classIds.length === 1 ? classNameOf(s.classIds[0]) : undefined) ?? s.name);
  const ticked = new Set(ticks && ticks.sig === schoolSig ? ticks.keys : []);
  const toggleTick = (key: string) => setTicks({ sig: schoolSig, keys: ticked.has(key) ? [...ticked].filter((k) => k !== key) : [...ticked, key] });
  const moving = shift === 0 ? [] : movable.filter((g) => ticked.has(g.key)).flatMap((g) => g.timings);
  const shiftProblem = shift === 0 ? null : (() => {
    const stuck = moving.find((s) => shiftSlots(s.slots, shift) === null);
    return stuck ? `${stuck.name} would go past midnight if everything starts ${formatMinutes(Math.abs(shift))} ${shift > 0 ? "later" : "earlier"}` : null;
  })();
  const firstProblem = problems[0]?.message ?? shiftProblem ?? null;

  // ---- The departments --------------------------------------------------------------------------------------------------------------------
  // The school's length of a period: a department set by hours (Pre-Primary) gets periods of it.
  const periodMinutes = plan.usual.periodMinutes;
  const rows: DepartmentRow[] = departments.map((department) => {
    const have = storedSetup(department, schedules, plan.usual);
    return { department, own: have.stored, summary: deptSummary(have.setup, periodMinutes), slots: deptRows(have.setup, periodMinutes) };
  });
  // The classes the school's own timing is for: not a class with a timing of its own, nor one of a department that has one.
  const ownClasses = new Set(classOwnTimings(schedules).map((o) => o.classId));
  const ownDepartments = new Set(rows.filter((r) => r.own).map((r) => r.department.id));
  const followers = classes.filter((c) => !ownClasses.has(c.id) && !(c.departmentId && ownDepartments.has(c.departmentId))).length;
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
    setFailure(null);
  };
  // The usual day was edited: when its start moved, the lunch and the days of its own move with it (`moveStart`). A start box that was cleared
  // and typed again is measured from the last whole start, kept here.
  const lastStart = useRef(plan.usual.start);
  const editUsual = (usual: DaySetup) => {
    if (clockToMinutes(plan.usual.start) !== null) lastStart.current = plan.usual.start;
    editPlan(moveStart(plan, usual, lastStart.current));
  };
  const setMode = (day: number, mode: DayMode) => {
    const before = plan.days[day];
    // A day that becomes different starts from the usual day, so only what differs has to be changed.
    const setup = mode === "own" && before.mode !== "own" ? { ...plan.usual } : before.setup;
    editPlan({ ...plan, days: { ...plan.days, [day]: { mode, setup } } });
  };
  const throwAway = () => {
    setSchoolEdit(null);
    setTicks(null);
    setFailure(null);
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
    // The school's week carries the winter shift: the server moves the ticked timings by the same minutes in this one save (nothing to say when none is ticked).
    const moveBy = moving.length > 0 ? shift : 0;
    if (dirty) jobs.push({ label: "School timings", sent: { ...weekBody(plan), ...(moveBy !== 0 ? { shiftOthers: moveBy, shiftOnly: moving.map((s) => s.id) } : {}) } });
    // A department sent again with the school's week goes with the same shift when it was ticked (its rows were moved by the server a moment ago).
    for (const d of resends) {
      const rowsNow = departmentRows(schedules, d.id);
      const moved = moveBy !== 0 && moving.some((s) => s.departmentId === d.id);
      jobs.push({ label: `${d.name}'s timing`, sent: departmentRowsBody(plan, moved ? (shiftSlots(rowsNow, moveBy) ?? rowsNow) : rowsNow, d.id) });
    }
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
    setSavedAt(nowIn12());
    return null;
  }

  // Changes that were not saved are asked about before another page or a reload takes them away.
  // Opening another tab of this page (only `tab` changes, 2026-11-23) keeps the changes on screen: nothing is asked then.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => schoolEdited && (currentLocation.pathname !== nextLocation.pathname || withoutTab(currentLocation.search) !== withoutTab(nextLocation.search)));
  useEffect(() => {
    if (!schoolEdited) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [schoolEdited]);

  const windowDepartment = windowOf ? departments.find((d) => d.id === windowOf) : undefined;
  // The rows of the usual day: its figures (School time, Class time, Periods, Lunch) and its bar are worked out from them.
  const usualSlots = generateDay(plan.usual).slots;

  return (
    <div className={cn("space-y-5", !hasFooter && "pb-24")}>
      <Header status={<SavedPill dirty={dirty} savedAt={savedAt} />} />
      {/* The reference picture (2026-11-23): the tabs and what the open one holds, the whole width (Quick actions and Other timings beside them were
          taken away the same day: "full width rakho"). */}
      <div className="min-w-0 space-y-5">
        <div className="min-w-0 space-y-5">
          <PageTabs label="Which timings" tabs={TIMING_TABS} value={tab} onChange={openTab} />

          <TabPanel tab={tab} className="space-y-5">
          {tab === "usual" && (
          <>
          <Card className="space-y-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Clock3 className="size-6" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-section-heading">Usual school day</h2>
                  <p className="text-sm text-foreground-muted">Applies to all classes without their own timing</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPreviewing(true)}>
                <Send className="size-4" aria-hidden />
                Preview week
              </Button>
            </div>

            <DayFigures slots={usualSlots} />

            <div className="space-y-2">
              <p className="text-xs font-bold text-foreground">Your day at a glance</p>
              <DayBar name="Usual day" slots={usualSlots} />
            </div>

            <div className="border-t border-border pt-5">
              <DayFields adaptive idPrefix="usual" name="Usual day" value={plan.usual} onChange={editUsual} />
            </div>
            {/* A break inside a period is said by the boxes, with the way to move it (2026-11-22): not again here. */}
            {problemOf("usual") && !visibleClash(plan.usual) && (
              <p role="alert" className="text-sm font-medium text-danger">
                {problemOf("usual")}
              </p>
            )}
            {/* Only when the start moved and some class or department keeps hours of its own: a tick for each, to move it too when this is saved. */}
            {shift !== 0 && movable.length > 0 && <MoveTooBox shift={shift} groups={movable} ticked={ticked} onToggle={toggleTick} />}
            {shiftProblem && (
              <p role="alert" className="text-sm font-medium text-danger">
                {shiftProblem}
              </p>
            )}
          </Card>

          <WeekDays plan={plan} problemOf={(d) => problemOf(d)} setMode={setMode} setOwn={(d, next) => editPlan({ ...plan, days: { ...plan.days, [d]: { mode: "own", setup: next } } })} />

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
            <button type="button" onClick={onNext} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary-deep hover:underline">
              Now make each class's timetable
              <ArrowRight className="size-4" aria-hidden />
            </button>
          )}
          </>
          )}

          {tab === "class" && (
            <ClassTimingsCard
              classes={classes}
              departments={departments}
              schedules={schedules}
              onAdd={() => setClassWindow({ classId: null })}
              onEdit={(classId) => setClassWindow({ classId })}
              onUseSchool={setGoing}
            />
          )}
          {tab === "department" && <DepartmentTimingsCard rows={rows} onChangeDepartment={setWindowOf} />}
          {tab === "special" && <SpecialDaysCard days={specialDays} onChange={setSpecial} onAdd={() => setSpecial("new")} />}
          </TabPanel>
        </div>
      </div>

      {special && <SpecialDayDialog day={special === "new" ? null : special} usual={plan.usual} classes={classes} onClose={() => setSpecial(null)} />}
      {classWindow && (
        <ClassOwnTimingDialog
          key={classWindow.classId ?? "new"}
          classes={classes}
          schedules={schedules}
          classId={classWindow.classId}
          onClose={() => setClassWindow(null)}
          // The button of the window does not act at once: the window closes and "Are you sure?" opens.
          onUseSchool={(klass) => {
            setClassWindow(null);
            setGoing(klass);
          }}
        />
      )}
      {going && <UseSchoolTimingModal key={going.id} klass={going} onClose={() => setGoing(null)} />}

      {/* Fixed to the bottom of the screen (it does not move when the page scrolls): what is waiting to be saved at the left, Discard and Save
          changes at the right. With nothing to save, Save changes stays (off) and the top says Saved. */}
      <FixedSaveBar
        note={
          dirty ? (
            <p className="flex items-start gap-2.5">
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-orange ring-4 ring-orange/20" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">You have unsaved changes</span>
                <span className="block truncate text-xs text-foreground-muted">
                  {whatChanged(read.plan, plan, read.isNew)} · applies to {followers} {followers === 1 ? "class" : "classes"}
                </span>
              </span>
            </p>
          ) : undefined
        }
      >
        {schoolEdited && (
          <Button variant="outline" onClick={throwAway}>
            Discard
          </Button>
        )}
        <Button variant="accent" onClick={() => void saveAll()} loading={saving} disabled={!dirty || firstProblem !== null} className="disabled:bg-orange-soft disabled:text-orange-hover/60 disabled:opacity-100 disabled:shadow-none">
          {!saving && <Check className="size-4" aria-hidden />}
          Save changes
        </Button>
      </FixedSaveBar>

      {previewing && <PreviewWeekModal plan={plan} onClose={() => setPreviewing(false)} />}
      {windowDepartment && <DepartmentTimingDialog key={windowDepartment.id} department={windowDepartment} classes={classes} schedules={schedules} plan={read.plan} onClose={() => setWindowOf(null)} />}
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
        <Header />
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
        <Header />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  return <Loaded schedules={schedules} departments={structure?.departments ?? []} classes={structure?.classes ?? []} onNext={onNext} />;
}

/** A class or department with hours of its own, with all its timings (a department can have a short Saturday too): what one tick moves. */
interface MovableGroup {
  key: string;
  name: string;
  timings: Schedule[];
}

/** The timings of the classes and departments, one group for each (by department, else by the one class, else the timing itself), in the order listed. */
function movableGroups(timings: readonly Schedule[], nameOf: (s: Schedule) => string): MovableGroup[] {
  const groups = new Map<string, MovableGroup>();
  for (const s of timings) {
    const key = s.departmentId ? `d:${s.departmentId}` : s.classIds.length === 1 ? `c:${s.classIds[0]}` : `s:${s.id}`;
    const group = groups.get(key) ?? { key, name: nameOf(s), timings: [] };
    group.timings.push(s);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * School starts later (or earlier) than saved and some classes or departments keep hours of their own: a tick for each (2026-11-22). A ticked one
 * starts as many minutes later too when this is saved ("09:30–11:40 → 10:30–12:40"); an unticked one keeps its hours. None is ticked to begin with.
 */
function MoveTooBox({ shift, groups, ticked, onToggle }: { shift: number; groups: MovableGroup[]; ticked: Set<string>; onToggle: (key: string) => void }) {
  const when = `${formatMinutes(Math.abs(shift))} ${shift > 0 ? "later" : "earlier"}`;
  return (
    <div className="rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary-deep">
      <p className="flex items-center gap-2 font-semibold">
        <Info className="size-4 shrink-0" aria-hidden />
        Also start {when}?
      </p>
      <ul aria-label={`Start ${when} too`} className="mt-2 space-y-1.5">
        {groups.map((g) => {
          // The hours of its main timing (the one with the most days), and where they go.
          const main = g.timings.reduce((best, t) => (t.days.length > best.days.length ? t : best), g.timings[0]);
          const from = main.slots[0]?.start;
          const to = main.slots[main.slots.length - 1]?.end;
          const moved = shiftSlots(main.slots, shift);
          const on = ticked.has(g.key);
          return (
            <li key={g.key}>
              <label className="flex cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-1">
                <input type="checkbox" aria-label={`Move ${g.name} too`} className="size-4 accent-[var(--color-primary)]" checked={on} onChange={() => onToggle(g.key)} />
                <span className="font-semibold text-foreground">{g.name}</span>
                <span className="tabular-nums text-foreground-muted">
                  {from}–{to}
                  {/* Where it would go, always said (2026-11-22, user: "aage likho, 1 ghante aage ka time"): bold when ticked. */}
                  {moved && moved.length > 0 && (
                    <span className={cn(on ? "font-semibold text-primary-deep" : "text-foreground-muted")}>
                      {" "}
                      → {moved[0].start}–{moved[moved.length - 1].end}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** An address's search part without the open tab: a change of tab alone is not leaving the page. */
const withoutTab = (search: string) => {
  const p = new URLSearchParams(search);
  p.delete("tab");
  return p.toString();
};

/** The tabs of the page (2026-11-23, the reference picture). */
type TimingTab = "usual" | "class" | "department" | "special";
const TIMING_TABS: { id: TimingTab; label: string; icon: typeof Clock3 }[] = [
  { id: "usual", label: "Usual Timings", icon: Clock3 },
  { id: "class", label: "Class Timings", icon: UsersRound },
  { id: "department", label: "Department Timings", icon: Landmark },
  { id: "special", label: "Special Day Timings", icon: Star },
];
