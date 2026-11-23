import { useMemo } from "react";
import { Clock3, Landmark, Pencil, Plus, RotateCcw, UsersRound } from "lucide-react";
import { classOwnTimings } from "../../utils/classWeek";
import { cn } from "../../utils/helpers";
import { rowsSummary } from "../../utils/schoolWeek";
import type { ClassItem, DepartmentItem, Schedule, Slot } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { MiniBar } from "./TimingParts";

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

/** A tab's card heading: its icon in a soft square, the name, and a line under it. */
function CardHead({ icon: Icon, title, sub, tone, action }: { icon: typeof Clock3; title: string; sub: string; tone: "primary" | "success"; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone === "primary" ? "bg-primary-soft text-primary" : "bg-success-soft text-success")}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-section-heading">{title}</h2>
          <p className="text-sm text-foreground-muted">{sub}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/** The classes that have a timing made for them alone, in the school's order, with their department's name. */
export function useOwnClasses(classes: ClassItem[], schedules: Schedule[]) {
  const own = useMemo(() => classOwnTimings(schedules), [schedules]);
  return useMemo(() => {
    const byId = new Map(classes.map((c) => [c.id, c]));
    const rows = own.flatMap((o) => {
      const klass = byId.get(o.classId);
      return klass ? [{ klass, rows: o.rows }] : [];
    });
    return { rows: rows.sort((a, b) => a.klass.order - b.klass.order), canAdd: classes.some((c) => !own.some((o) => o.classId === c.id)) };
  }, [own, classes]);
}

/**
 * Class Timings tab (2026-11-23, the reference picture's tabs; it was the lower half of the Class & department timings card): **Add class timing**
 * (one class that needs hours of its own) and the classes that have a timing of their own, each with the pencil (change it) and the arrow (back to the
 * school's timing, after "Are you sure?"). The windows are the page's (`onAdd`, `onEdit`, `onUseSchool`); each saves on its own.
 */
export function ClassTimingsCard({
  classes,
  departments,
  schedules,
  onAdd,
  onEdit,
  onUseSchool,
}: {
  classes: ClassItem[];
  departments: DepartmentItem[];
  schedules: Schedule[];
  onAdd: () => void;
  onEdit: (classId: string) => void;
  onUseSchool: (klass: { id: string; name: string }) => void;
}) {
  const { rows, canAdd } = useOwnClasses(classes, schedules);
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? null;

  return (
    <Card className="overflow-hidden pb-1">
      <CardHead
        icon={UsersRound}
        tone="primary"
        title="Class timings"
        sub="One class needs its own timing? Add it separately."
        action={
          <Button variant="outline" size="sm" disabled={!canAdd} onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            Add class timing
          </Button>
        }
      />
      <h3 className="mt-4 border-t border-border px-5 pt-4 text-xs font-bold uppercase tracking-wider text-foreground-muted">Classes with their own timing</h3>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-sm text-foreground-muted">No class has its own timing</p>
      ) : (
        <ul className="mt-2 grid gap-3 px-5 pb-4 sm:grid-cols-2" aria-label="Classes with their own timing">
          {rows.map(({ klass, rows: slots }) => (
            <li key={klass.id} className="space-y-2 rounded-xl border border-border px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{klass.name}</p>
                  {departmentName(klass.departmentId) && <p className="text-xs text-foreground-muted">{departmentName(klass.departmentId)}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label={`Edit ${klass.name} timing`} title="Change timing" className="px-2.5" onClick={() => onEdit(klass.id)}>
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Use the school's timing for ${klass.name}`} title="Use the school's timing" className="px-2.5" onClick={() => onUseSchool({ id: klass.id, name: klass.name })}>
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
    </Card>
  );
}

/**
 * Department Timings tab (2026-11-23; it was the upper half of the Class & department timings card): every department with how many classes it has,
 * **Change** (its window, opened by the page), a thin bar of its day, **Custom timing** or **Same as school**, and its day in words.
 */
export function DepartmentTimingsCard({ rows, onChangeDepartment }: { rows: DepartmentRow[]; onChangeDepartment: (departmentId: string) => void }) {
  return (
    <Card className="overflow-hidden pb-1">
      <CardHead icon={Landmark} tone="success" title="Department timings" sub="Only change these if a department runs differently" />
      {rows.length === 0 ? (
        <p className="px-5 pb-5 pt-4 text-sm text-foreground-muted">No department yet</p>
      ) : (
        <ul className="mt-4 grid gap-3 px-5 pb-4 sm:grid-cols-2" aria-label="Department timings">
          {rows.map(({ department, own: hasOwn, summary, slots }) => (
            <li key={department.id}>
              <section aria-label={`${department.name} timing`} className="h-full space-y-2.5 rounded-xl border border-border px-4 py-3.5">
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
    </Card>
  );
}
