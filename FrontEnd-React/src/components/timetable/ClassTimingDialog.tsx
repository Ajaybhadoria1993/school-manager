import { useMemo, useState } from "react";
import { Clock3, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@heroui/react";
import { MAX_PERIODS } from "../../constants/timetable";
import { useGetSchedulesQuery, useSaveClassDayMutation } from "../../redux/api/timetableApi";
import { classHours, classTimingBody, classWeek, daySummaryOf, periodCount, referenceDay, rowsBetween, rowsForPeriods } from "../../utils/classWeek";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Input, Label } from "../ui/Input";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

const stepButton =
  "flex h-10 w-10 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

/**
 * Periods & time (2026-11-09; it replaced "Periods per day"): how many periods a class has and when it starts and ends, for the whole
 * class (every section of it) and every school day. A class has the school's times and is there for as many periods as it has lessons,
 * so this box is for a class that has more or fewer periods than the school's day (Nursery 5, the school 7), or is called at other hours
 * (9 to 2). The three boxes are one thing: **Periods** (− 5 +) makes the end, an **end** typed makes the number, another **start**
 * keeps the number and moves the end. The day is made with the school's length of a period and its lunch (the last period is cut to end
 * with the class), for every day the class has school and follows the school's usual day (`PUT /timetable/class-day`); the school's own
 * hours send nothing, so the class follows the school again. Lessons in a period the class will no longer have are asked about first and
 * taken out only when the person agrees. Asks the school's timings once, when it opens.
 */
export function ClassTimingDialog({
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

  const days = useMemo(() => classWeek(schedules ?? [], classId), [schedules, classId]);
  /** The hours the class has now, and the school's own (what "Back to the school's timing" puts in the boxes). */
  const now = useMemo(() => classHours(days), [days]);
  const school = useMemo(() => classHours(days.map((d) => ({ ...d, current: d.inherited, own: false }))), [days]);
  const hasOwn = days.some((d) => d.own);
  const hasSchool = days.some((d) => d.current.length > 0);

  const [typed, setTyped] = useState<{ start: string; end: string } | null>(null);
  const start = typed?.start ?? now.start;
  const end = typed?.end ?? now.end;
  const hours = (next: Partial<{ start: string; end: string }>) => {
    clearError();
    setTyped({ start, end, ...next });
  };

  const sent = classTimingBody(classId, days, start, end, false);
  // The day as these hours make it, from a day the class has (or the usual day): what the three boxes are measured on.
  const sample = days.find((d) => d.current.length > 0);
  const reference = sample ? (sample.inherited.length > 0 ? sample.inherited : sample.current) : referenceDay(days);
  const rows = sent.problem ? null : rowsBetween(start, end, reference);
  const periods = rows ? periodCount(rows) : 0;
  const endOf = (made: ReturnType<typeof rowsForPeriods>) => (made ? made[made.length - 1].end : null);
  /** Another number of periods: the end is where the last of them ends. */
  const withPeriods = (n: number) => {
    const end = endOf(rowsForPeriods(start, n, reference));
    if (end) hours({ end });
  };
  /** Another start keeps the number of periods, so the day moves and its end with it. */
  const withStart = (next: string) => hours({ start: next, ...(periods > 0 && endOf(rowsForPeriods(next, periods, reference)) ? { end: endOf(rowsForPeriods(next, periods, reference))! } : {}) });
  const canMore = periods < MAX_PERIODS && rowsForPeriods(start, periods + 1, reference) !== null;
  // A class that has no school yet is given the usual day as it is; any other class has something to save only when the hours changed.
  const dirty = start !== now.start || end !== now.end || (!hasSchool && sent.body.days.length > 0);

  const asked = error?.code === "LESSONS_IN_REMOVED_PERIODS";
  const save = (removeLessons: boolean) =>
    run(async () => {
      await saveClassDay({ ...sent.body, removeLessons }).unwrap();
      push("success", sent.body.days.length === 0 ? `${className} follows the school's timing` : `${className}: timing saved`);
      onSaved();
    });

  return (
    <AppModal
      title={`Periods & time: ${className}`}
      icon={Clock3}
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
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : asked ? (
        <div role="alert" className="space-y-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="font-semibold">{error?.message}</p>
          <p>
            If you go on, those lessons are taken out of the timetable of {allSections ? "every section of " : ""}
            {className}. This cannot be undone.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field quiet id="class-timing-start" label="Class starts">
              <Input id="class-timing-start" type="time" value={start} onChange={(e) => withStart(e.target.value)} />
            </Field>
            <div>
              <Label id="class-timing-periods-label">Periods in a day</Label>
              <div role="group" aria-labelledby="class-timing-periods-label" className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-border bg-surface">
                <button type="button" aria-label="Fewer periods" disabled={periods <= 1} onClick={() => withPeriods(periods - 1)} className={stepButton}>
                  <Minus className="size-4" aria-hidden />
                </button>
                <span aria-live="polite" className="w-12 text-center text-sm font-bold tabular-nums text-foreground">
                  {periods}
                </span>
                <button type="button" aria-label="More periods" disabled={!canMore} onClick={() => withPeriods(periods + 1)} className={stepButton}>
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
            </div>
            <Field quiet id="class-timing-end" label="Class ends">
              <Input id="class-timing-end" type="time" value={end} onChange={(e) => hours({ end: e.target.value })} />
            </Field>
          </div>

          {rows && (
            <p className="rounded-xl bg-surface-muted/60 px-3.5 py-2.5 text-sm font-medium text-foreground">
              {periods} period{periods === 1 ? "" : "s"} · {daySummaryOf(rows)}
            </p>
          )}
          {sent.problem && (
            <p role="alert" className="text-sm font-medium text-danger">
              {sent.problem}
            </p>
          )}
          <ModalError message={error && !asked ? error.message : null} />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {hasOwn && (start !== school.start || end !== school.end) ? (
              <Button variant="ghost" size="sm" onPress={() => hours(school)}>
                <RotateCcw className="size-4" aria-hidden />
                Back to the school's timing
              </Button>
            ) : (
              <span />
            )}
            <p className="text-sm text-foreground-muted">
              Whole school? Use{" "}
              <button type="button" onClick={onGoTimings} className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline">
                School timings
              </button>
              .
            </p>
          </div>
          {allSections && <p className="text-sm text-foreground-muted">Applies to every section of {className}.</p>}
        </>
      )}
    </AppModal>
  );
}
