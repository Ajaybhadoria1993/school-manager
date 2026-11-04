import { useMemo, useState } from "react";
import { ListOrdered, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@heroui/react";
import { DAY_NAMES, MAX_PERIODS } from "../../constants/timetable";
import { useGetSchedulesQuery, useSaveClassDayMutation } from "../../redux/api/timetableApi";
import { classDayBody, classWeek, daySummaryOf, periodCount, referenceDay, rowsFor, sameRows, type ClassDay } from "../../utils/classWeek";
import { cn } from "../../utils/helpers";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

const ALL_OPTIONS = Array.from({ length: MAX_PERIODS }, (_, i) => ({ value: String(i + 1), label: `${i + 1} period${i === 0 ? "" : "s"}` }));

/** − 5 +: the periods of one day. */
function Stepper({ label, value, canAdd, onChange }: { label: string; value: number; canAdd: boolean; onChange: (next: number) => void }) {
  const button = "flex size-9 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 items-center overflow-hidden rounded-lg border border-border bg-surface">
      <button type="button" aria-label={`Fewer periods on ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)} className={button}>
        <Minus className="size-4" aria-hidden />
      </button>
      <span aria-live="polite" className="w-9 text-center text-sm font-bold tabular-nums text-foreground">
        {value}
      </span>
      <button type="button" aria-label={`More periods on ${label}`} disabled={value >= MAX_PERIODS || !canAdd} onClick={() => onChange(value + 1)} className={button}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * How many periods a class has on each day: a − 5 + for each day of the week (0 is a day without school), and "Set every school day to"
 * for all of them at once. It changes only this class (every section of it): the other classes keep following the school's timing, and
 * the days left as they are keep following it too. The rows are made from the number (fewer: the day is cut after that period, more:
 * periods after the last one); the days that end up different from what the class would follow anyway are saved as its own
 * (`PUT /timetable/class-day`). Lessons in a period the class will no longer have are asked about first and taken out only when the
 * person agrees. Asks the school's timings once, when it opens.
 */
export function ClassPeriodsDialog({
  classId,
  className,
  allSections,
  onClose,
  onSaved,
  onGoTimings,
}: {
  classId: string;
  /** "Class 5": the class, not a section. */
  className: string;
  /** The timetable open is one section's: the box says it is for all of the class's sections. */
  allSections: boolean;
  onClose: () => void;
  /** The timings changed: the page reads its timetable again. */
  onSaved: () => void;
  onGoTimings: () => void;
}) {
  const { push } = useToast();
  const timings = useGetSchedulesQuery();
  const schedules = timings.data?.data.items;
  const [saveClassDay] = useSaveClassDayMutation();
  const { busy, error, run, clearError } = useSave(onClose);

  const real = useMemo(() => classWeek(schedules ?? [], classId), [schedules, classId]);
  // "Back to the school's periods" starts again from what the class would follow without days of its own.
  const [reset, setReset] = useState(false);
  const [edited, setEdited] = useState<Record<number, number>>({});
  const days = useMemo<ClassDay[]>(() => (reset ? real.map((d) => ({ ...d, current: d.inherited, own: false })) : real), [real, reset]);
  const reference = useMemo(() => referenceDay(days), [days]);
  const countOf = (d: ClassDay) => edited[d.day] ?? periodCount(d.current);
  const counts = Object.fromEntries(days.map((d) => [d.day, countOf(d)]));
  const sent = classDayBody(classId, days, counts, reference, false);
  const total = days.reduce((n, d) => n + countOf(d), 0);
  const dirty = reset || days.some((d) => countOf(d) !== periodCount(d.current));
  const hasOwn = real.some((d) => d.own);

  const change = (day: number, next: number) => {
    clearError();
    setEdited((all) => ({ ...all, [day]: next }));
  };
  /** Every day that has school gets this many periods (a class with no school at all: Monday to Friday). */
  const setAll = (n: number) => {
    clearError();
    const school = days.filter((d) => periodCount(d.current) > 0 || (edited[d.day] ?? 0) > 0);
    const targets = school.length > 0 ? school.map((d) => d.day) : [1, 2, 3, 4, 5];
    setEdited((all) => ({ ...all, ...Object.fromEntries(targets.map((d) => [d, n])) }));
  };

  const asked = error?.code === "LESSONS_IN_REMOVED_PERIODS";
  const save = (removeLessons: boolean) =>
    run(async () => {
      await saveClassDay({ ...sent.body, removeLessons }).unwrap();
      push("success", sent.body.days.length === 0 ? `${className} follows the school's periods` : `${className}: periods saved`);
      onSaved();
    });

  return (
    <AppModal
      title={`Periods per day: ${className}`}
      icon={ListOrdered}
      busy={busy}
      size="lg"
      onClose={onClose}
      footer={
        asked ? (
          <>
            <Button variant="secondary" onPress={clearError} isDisabled={busy}>
              Go back
            </Button>
            <Button variant="danger" isPending={busy} onPress={() => void save(true)}>
              Take those lessons out and save
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isPending={busy} isDisabled={!schedules || !dirty || !!sent.problem} onPress={() => void save(false)}>
              Save
            </Button>
          </>
        )
      }
    >
      {timings.error && !schedules ? (
        <p role="alert" className="text-sm text-danger">
          Could not load the school's timings. Close this and try again.
        </p>
      ) : !schedules ? (
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : asked ? (
        <div role="alert" className="space-y-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="font-semibold">{error?.message}</p>
          <p>If you go on, those lessons are taken out of the timetable of {allSections ? "every section of " : ""}{className}. This cannot be undone.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            Changes only {className}
            {allSections ? " (all its sections)" : ""}. Other classes, and any day you leave alone, keep the school's timing.
          </p>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted/60 px-3.5 py-2.5">
            <span className="text-sm font-semibold text-foreground">Same on every school day</span>
            <div className="w-36 shrink-0">
              <Select aria-label="Set every school day to" placeholder="Choose…" value="" options={ALL_OPTIONS} onChange={(v) => v && setAll(Number(v))} />
            </div>
          </div>

          <ul aria-label="Periods on each day" className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {days.map((d) => {
              const n = countOf(d);
              const rows = rowsFor(d, n, reference);
              const canAdd = n < MAX_PERIODS && rowsFor(d, n + 1, reference) !== null;
              const differs = rows ? !sameRows(rows, d.inherited) : false;
              return (
                // A day that is not the school's has a blue edge and tint; a day with no school is greyed.
                <li key={d.day} className={cn("flex items-center gap-3 border-l-4 border-transparent py-2 pl-3 pr-3.5", differs && "border-primary bg-primary-soft/40", n === 0 && !differs && "bg-surface-muted/50")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-foreground">{DAY_NAMES[d.day]}</span>
                      {differs && <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary-deep ring-1 ring-inset ring-primary/20">Different from the school</span>}
                    </p>
                    <p className={cn("mt-0.5 text-sm", rows ? "text-foreground-muted" : "font-medium text-danger")}>{rows ? daySummaryOf(rows) : `${n} periods do not fit in this day`}</p>
                  </div>
                  <Stepper label={DAY_NAMES[d.day]} value={n} canAdd={canAdd} onChange={(next) => change(d.day, next)} />
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {hasOwn && !reset ? (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  clearError();
                  setEdited({});
                  setReset(true);
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
                Back to the school's periods
              </Button>
            ) : (
              <span />
            )}
            <p className="text-sm text-foreground-muted">
              <strong className="font-bold text-foreground">{total}</strong> period{total === 1 ? "" : "s"} a week
            </p>
          </div>

          {sent.problem && (
            <p role="alert" className="text-sm font-medium text-danger">
              {sent.problem}
            </p>
          )}
          <ModalError message={error && !asked ? error.message : null} />

          <p className="text-sm text-foreground-muted">
            Whole school or a department? Use{" "}
            <button type="button" onClick={onGoTimings} className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline">
              School timings
            </button>
            .
          </p>
        </>
      )}
    </AppModal>
  );
}
