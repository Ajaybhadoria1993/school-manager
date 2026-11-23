import { useMemo, useState } from "react";
import { Check, Clock3, Plus, RotateCcw } from "lucide-react";
import { Button } from "@heroui/react";
import { useSaveClassDayMutation } from "../../redux/api/timetableApi";
import { classDayBody, classOwnTimings, classWeek, usualRows } from "../../utils/classWeek";
import { cn } from "../../utils/helpers";
import { dayProblem } from "../../utils/schoolWeek";
import { describeDay, visibleClash, generateDay, setupFromSlots, withoutArrival, type DaySetup } from "../../utils/timings";
import type { ClassItem, Schedule } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { useToast } from "../ui/toast-context";
import { DayFields } from "./DayFields";

/**
 * One class's own timing (2026-11-13), from the School timings page: the same boxes as the school's day and a department's (starts, each
 * period, how many, assembly, lunch, a short break), for the whole class (every section of it). Adding picks the class first (a class that
 * has a timing of its own is not offered again); changing opens the class that was clicked. It starts from the day the class has now, so
 * only what differs has to be changed. Save writes the rows for every day the class follows the school's usual day (`PUT /timetable/class-day`;
 * a short Saturday of the school is left to the school), and nothing is sent while the boxes are what the class already has. *Use the school's
 * timing* (a button, 2026-11-17) does not act at once: it hands the class to `onUseSchool`, which closes this window and opens "Are you sure?"
 * (`UseSchoolTimingModal`). Lessons in a period the class will no longer have are asked about first and taken out only when the person agrees.
 */
export function ClassOwnTimingDialog({
  classes,
  schedules,
  classId,
  onClose,
  onUseSchool,
}: {
  classes: ClassItem[];
  schedules: Schedule[];
  /** The class being changed; none when one is being added. */
  classId: string | null;
  onClose: () => void;
  /** The class wants to follow the school's timing again: the page asks "Are you sure?" and does it. */
  onUseSchool: (klass: { id: string; name: string }) => void;
}) {
  const { push } = useToast();
  const [saveClassDay] = useSaveClassDayMutation();
  const { busy, error, run, clearError } = useSave(onClose);

  const owned = useMemo(() => new Set(classOwnTimings(schedules).map((o) => o.classId)), [schedules]);
  const [chosen, setChosen] = useState(classId ?? "");
  const [typed, setTyped] = useState<{ classId: string; setup: DaySetup } | null>(null);

  const klass = classes.find((c) => c.id === chosen) ?? null;
  const days = useMemo(() => (chosen ? classWeek(schedules, chosen) : []), [schedules, chosen]);
  // What the class has now (its own day, or the school's it follows): the boxes start from it.
  const base = useMemo(() => setupFromSlots(usualRows(days)), [days]);
  const setup = typed && typed.classId === chosen ? typed.setup : base;
  const hasOwn = chosen !== "" && owned.has(chosen);
  const problem = chosen ? dayProblem(setup) : undefined;
  const body = chosen && !problem ? classDayBody(chosen, days, generateDay(setup).slots, false) : null;
  // A class that follows the school has something to save only when its rows are not the school's; one that has a timing of its own, when its boxes changed.
  const canSave = body !== null && (hasOwn ? JSON.stringify(setup) !== JSON.stringify(base) : body.days.length > 0);

  const asked = error?.code === "LESSONS_IN_REMOVED_PERIODS";
  const send = (removeLessons: boolean) =>
    run(async () => {
      if (!klass || !body) return;
      await saveClassDay({ ...body, removeLessons }).unwrap();
      push("success", `${klass.name}: timing saved`);
    });

  const free = classes.filter((c) => !owned.has(c.id));
  // The classes to pick from, as chips: the first few, the rest behind More.
  const [allShown, setAllShown] = useState(false);
  const FEW = 6;
  const shownChips = allShown ? free : free.slice(0, FEW);
  const preview = klass ? generateDay(setup).slots : [];
  const hours = describeDay(preview);
  let period = 0;

  return (
    <AppModal
      title={classId && klass ? `${klass.name} timing` : "Add class timing"}
      icon={Clock3}
      busy={busy}
      size="lg"
      wide
      onClose={onClose}
      footer={
        asked ? (
          <>
            <Button variant="secondary" onPress={clearError} isDisabled={busy}>
              Go back
            </Button>
            <Button variant="danger" isPending={busy} onPress={() => void send(true)}>
              Take those lessons out and save
            </Button>
          </>
        ) : (
          <>
            {/* At the left, and it asks first: the page opens "Are you sure?". */}
            {klass && hasOwn && (
              <Button variant="ghost" size="sm" className="mr-auto text-primary-deep" isDisabled={busy} onPress={() => onUseSchool({ id: klass.id, name: klass.name })}>
                <RotateCcw className="size-4" aria-hidden />
                Use the school's timing
              </Button>
            )}
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isPending={busy} isDisabled={!canSave} onPress={() => void send(false)}>
              Save
            </Button>
          </>
        )
      }
    >
      {asked ? (
        <div role="alert" className="space-y-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="font-semibold">{error?.message}</p>
          <p>If you go on, those lessons are taken out of the timetable of every section of {klass?.name}. This cannot be undone.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0 space-y-4">
            {!classId && (
              <div>
                <p className="mb-1.5 text-body-label">Class</p>
                <div role="radiogroup" aria-label="Class" className="flex flex-wrap gap-1.5">
                  {shownChips.map((c) => {
                    const on = c.id === chosen;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setChosen(c.id);
                          setTyped(null);
                          clearError();
                        }}
                        className={cn(
                          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                          on ? "border-primary-deep bg-primary-deep text-white" : "border-border bg-surface text-foreground hover:border-primary/50"
                        )}
                      >
                        {on && <Check className="size-3.5" aria-hidden />}
                        {c.name}
                      </button>
                    );
                  })}
                  {free.length > FEW && (
                    <button type="button" onClick={() => setAllShown((v) => !v)} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm font-semibold text-foreground-muted hover:border-primary/50 hover:text-foreground">
                      {allShown ? "Fewer" : <><Plus className="size-3.5" aria-hidden />More</>}
                    </button>
                  )}
                  {free.length === 0 && <p className="text-sm text-foreground-muted">Every class has a timing of its own</p>}
                </div>
              </div>
            )}
            {klass ? (
              <>
                <DayFields
                  adaptive
                  showEnd
                  idPrefix="class-own"
                  name={klass.name}
                  value={setup}
                  onChange={(next) => {
                    clearError();
                    setTyped({ classId: klass.id, setup: next });
                  }}
                />
                <ModalError message={error ? error.message : null} />
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-muted">Choose the class first</p>
            )}
          </div>

          {/* The day the boxes make, period by period, and whether it fits. */}
          <aside aria-label="Day preview" className="rounded-xl bg-primary-soft/50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-foreground-muted">Day preview</p>
            {klass ? (
              <>
                <ol aria-label={`${klass.name}, period by period`} className="mt-3 space-y-1.5">
                  {withoutArrival(preview).map((s, i) => {
                    if (s.kind === "period") period += 1;
                    const label = s.kind === "period" ? `Period ${period}` : s.label || (s.kind === "lunch" ? "Lunch" : "Break");
                    return (
                      <li key={i} className={cn("flex items-center justify-between gap-2 text-sm", s.kind === "lunch" ? "font-semibold text-orange-hover" : s.kind === "break" ? "text-foreground-muted" : "text-foreground")}>
                        <span className="flex items-center gap-2">
                          <span aria-hidden className={cn("size-1.5 rounded-full", s.kind === "lunch" ? "bg-orange" : s.kind === "break" ? "bg-foreground-muted" : "bg-primary")} />
                          {label}
                        </span>
                        <span className="tabular-nums text-foreground-muted">
                          {s.start} – {s.end}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {problem && visibleClash(setup) ? (
                  // Said with the way to move it beside the boxes: here only that the day does not fit yet.
                  <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">A break starts inside a period: move it first.</p>
                ) : problem ? (
                  <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                    {problem}
                  </p>
                ) : (
                  hours.start &&
                  hours.end && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs text-foreground-muted">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                      <span>
                        <strong className="text-success">No clashes.</strong> {hours.periods} {hours.periods === 1 ? "period fits" : "periods fit"} between {hours.start} and {hours.end}.
                      </span>
                    </p>
                  )
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-foreground-muted">The periods show here once a class is chosen.</p>
            )}
          </aside>
        </div>
      )}
    </AppModal>
  );
}
