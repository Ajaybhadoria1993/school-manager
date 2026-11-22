import { useMemo, useState } from "react";
import { Clock3, GraduationCap, Pencil, Plus, RotateCcw } from "lucide-react";
import { classOwnTimings } from "../../utils/classWeek";
import { cn } from "../../utils/helpers";
import { rowsSummary } from "../../utils/schoolWeek";
import type { ClassItem, DepartmentItem, Schedule, Slot } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ClassOwnTimingDialog } from "./ClassOwnTimingDialog";
import { MiniBar } from "./TimingParts";
import { UseSchoolTimingModal } from "./UseSchoolTimingModal";

/** One department as the card shows it. */
export interface DepartmentRow {
  department: DepartmentItem;
  /** The department has a timing of its own. */
  own: boolean;
  /** The day it has (its own, or the school's it follows) in a few words. */
  summary: string;
  /** That day's rows, for the thin bar. */
  slots: Slot[];
}

function Badge({ own }: { own: boolean }) {
  return (
    <span className={cn("inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", own ? "bg-orange-soft text-orange-hover ring-1 ring-inset ring-orange/30" : "bg-surface-muted text-foreground-muted")}>
      {own ? "Custom timing" : "Same as school"}
    </span>
  );
}

/**
 * Class & department timings (2026-11-22, the reference pictures: one card beside the school's usual day, in place of the two cards Department
 * timings and Class timings): what runs differently from the school. On top, **Add class timing** (one class that needs hours of its own,
 * `ClassOwnTimingDialog`); under it every department with how many classes it has, **Change** (its window, `DepartmentTimingDialog`, opened by
 * the page), a thin bar of its day, **Custom timing** or **Same as school**, and its day in words; then the classes that have a timing of their
 * own, each with the pencil (change it) and the arrow (back to the school's timing, after "Are you sure?"). Every change is saved in its window,
 * so this card never has unsaved work.
 */
export function GroupTimings({
  rows,
  classes,
  departments,
  schedules,
  onChangeDepartment,
}: {
  rows: DepartmentRow[];
  classes: ClassItem[];
  departments: DepartmentItem[];
  schedules: Schedule[];
  onChangeDepartment: (departmentId: string) => void;
}) {
  // null: closed; { classId: null }: adding; { classId }: changing that class.
  const [open, setOpen] = useState<{ classId: string | null } | null>(null);
  // The class that is about to go back to the school's timing (the window asking "Are you sure?").
  const [going, setGoing] = useState<{ id: string; name: string } | null>(null);
  const own = useMemo(() => classOwnTimings(schedules), [schedules]);
  const classRows = useMemo(() => {
    const byId = new Map(classes.map((c) => [c.id, c]));
    return own.flatMap((o) => {
      const klass = byId.get(o.classId);
      return klass ? [{ klass, rows: o.rows }] : [];
    });
  }, [own, classes]);
  const sorted = [...classRows].sort((a, b) => a.klass.order - b.klass.order);
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? null;
  const canAdd = classes.some((c) => !own.some((o) => o.classId === c.id));

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-soft text-orange-hover">
          <GraduationCap className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-section-heading">Class & department timings</h2>
          <p className="text-sm text-foreground-muted">Only change these if a group runs differently</p>
        </div>
      </div>

      <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary/30 bg-primary-soft/40 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-foreground-muted">One class needs its own timing? Add it separately.</p>
        <Button variant="outline" size="sm" disabled={!canAdd} onClick={() => setOpen({ classId: null })}>
          <Plus className="size-4" aria-hidden />
          Add class timing
        </Button>
      </div>

      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-border border-t border-border" aria-label="Department timings">
          {rows.map(({ department, own: hasOwn, summary, slots }) => (
            <li key={department.id}>
              <section aria-label={`${department.name} timing`} className="space-y-2.5 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="min-w-0 truncate text-sm font-bold text-foreground">
                    {department.name}{" "}
                    <span className="font-normal text-foreground-muted">
                      {department.classCount} {department.classCount === 1 ? "class" : "classes"}
                    </span>
                  </h3>
                  <Button variant="outline" size="sm" className="shrink-0" aria-label="Change timing" onClick={() => onChangeDepartment(department.id)}>
                    <Clock3 className="size-4" aria-hidden />
                    Change
                  </Button>
                </div>
                <MiniBar slots={slots} />
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Badge own={hasOwn} />
                  <p className="min-w-0 text-xs text-foreground-muted">{summary}</p>
                </div>
              </section>
            </li>
          ))}
        </ul>
      )}

      <div className={cn("border-t border-border", rows.length === 0 && "mt-4")}>
        <h3 className="px-5 pt-4 text-xs font-bold uppercase tracking-wider text-foreground-muted">Classes with their own timing</h3>
        {sorted.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-foreground-muted">No class has its own timing</p>
        ) : (
          <ul className="mt-2 divide-y divide-border" aria-label="Classes with their own timing">
            {sorted.map(({ klass, rows: slots }) => (
              <li key={klass.id} className="space-y-2 px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{klass.name}</p>
                    {departmentName(klass.departmentId) && <p className="text-xs text-foreground-muted">{departmentName(klass.departmentId)}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" aria-label={`Edit ${klass.name} timing`} title="Change timing" className="px-2.5" onClick={() => setOpen({ classId: klass.id })}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label={`Use the school's timing for ${klass.name}`} title="Use the school's timing" className="px-2.5" onClick={() => setGoing({ id: klass.id, name: klass.name })}>
                      <RotateCcw className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
                <MiniBar slots={slots} />
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Badge own />
                  <p className="min-w-0 text-xs text-foreground-muted">{rowsSummary(slots)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <ClassOwnTimingDialog
          key={open.classId ?? "new"}
          classes={classes}
          schedules={schedules}
          classId={open.classId}
          onClose={() => setOpen(null)}
          // The button of the window does not act at once: the window closes and "Are you sure?" opens.
          onUseSchool={(klass) => {
            setOpen(null);
            setGoing(klass);
          }}
        />
      )}
      {going && <UseSchoolTimingModal key={going.id} klass={going} onClose={() => setGoing(null)} />}
    </Card>
  );
}
