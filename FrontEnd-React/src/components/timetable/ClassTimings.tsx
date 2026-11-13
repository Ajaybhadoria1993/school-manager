import { useMemo, useState } from "react";
import { GraduationCap, Pencil, Plus } from "lucide-react";
import { classOwnTimings } from "../../utils/classWeek";
import { rowsSummary } from "../../utils/schoolWeek";
import type { ClassItem, DepartmentItem, Schedule } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ClassOwnTimingDialog } from "./ClassOwnTimingDialog";

/**
 * Class timings (2026-11-13): the classes that come at hours of their own (one class of the school that starts later, or has fewer periods),
 * under the department timings. A class follows its department's timing, or the school's, until it is added here; its row says what it
 * has now and the pencil changes it. Adding and changing happen in a window with its own Save (`ClassOwnTimingDialog`), so this card never
 * has unsaved work.
 */
export function ClassTimings({ classes, departments, schedules }: { classes: ClassItem[]; departments: DepartmentItem[]; schedules: Schedule[] }) {
  // null: closed; { classId: null }: adding; { classId }: changing that class.
  const [open, setOpen] = useState<{ classId: string | null } | null>(null);
  const own = useMemo(() => classOwnTimings(schedules), [schedules]);
  const rows = useMemo(() => {
    const byId = new Map(classes.map((c) => [c.id, c]));
    return own.flatMap((o) => {
      const klass = byId.get(o.classId);
      return klass ? [{ klass, rows: o.rows }] : [];
    });
  }, [own, classes]);
  const sorted = [...rows].sort((a, b) => a.klass.order - b.klass.order);
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? null;
  const canAdd = classes.some((c) => !own.some((o) => o.classId === c.id));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <GraduationCap className="size-5" />
          </span>
          <h2 className="text-section-heading">Class timings</h2>
        </div>
        <Button variant="outline" size="sm" disabled={!canAdd} onClick={() => setOpen({ classId: null })}>
          <Plus className="size-4" aria-hidden />
          Add class
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="px-5 pb-5 pt-4 text-sm text-foreground-muted">No class has its own timing</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-t border-border" aria-label="Classes with their own timing">
          {sorted.map(({ klass, rows: slots }) => (
            <li key={klass.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{klass.name}</p>
                {departmentName(klass.departmentId) && <p className="text-xs text-foreground-muted">{departmentName(klass.departmentId)}</p>}
                <p className="mt-1 text-sm text-foreground-muted">{rowsSummary(slots)}</p>
              </div>
              <Button variant="ghost" size="sm" aria-label={`Edit ${klass.name} timing`} className="shrink-0 px-2.5" onClick={() => setOpen({ classId: klass.id })}>
                <Pencil className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && <ClassOwnTimingDialog key={open.classId ?? "new"} classes={classes} schedules={schedules} classId={open.classId} onClose={() => setOpen(null)} />}
    </Card>
  );
}
