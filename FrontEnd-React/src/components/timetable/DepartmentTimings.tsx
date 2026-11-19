import { Clock3, Layers } from "lucide-react";
import { cn } from "../../utils/helpers";
import type { DepartmentItem } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/** One department as the card shows it. */
export interface DepartmentRow {
  department: DepartmentItem;
  /** The department has a timing of its own. */
  own: boolean;
  /** The day it has (its own, or the school's it follows) in a few words. */
  summary: string;
}

/**
 * Department timings (2026-11-13): the card beside the school's usual day, in the column of Class timings. Every department follows the
 * school ("Same as school", with the day it follows) until it is given a timing of its own; a department that has one says **Own timing** and
 * its day. **Change timing** opens a window (`DepartmentTimingDialog`) with the boxes and its own Save, so this card never has unsaved work
 * and nothing in it moves when something is typed.
 */
export function DepartmentTimings({ rows, onChange }: { rows: DepartmentRow[]; onChange: (departmentId: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Layers className="size-5" />
        </span>
        <h2 className="self-center text-section-heading">Department timings</h2>
      </div>
      <ul className="mt-4 divide-y divide-border border-t border-border" aria-label="Department timings">
        {rows.map(({ department, own, summary }) => (
          <li key={department.id}>
            <section aria-label={`${department.name} timing`} className="space-y-3 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-foreground">{department.name}</h3>
                  <p className="text-xs text-foreground-muted">
                    {department.classCount} {department.classCount === 1 ? "class" : "classes"}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => onChange(department.id)}>
                  <Clock3 className="size-4" aria-hidden />
                  Change timing
                </Button>
              </div>
              <div className="space-y-1.5">
                <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-semibold", own ? "bg-primary-soft text-primary-deep" : "bg-surface-muted text-foreground-muted")}>
                  {own ? "Own timing" : "Same as school"}
                </span>
                <p className="text-sm text-foreground-muted">{summary}</p>
              </div>
            </section>
          </li>
        ))}
      </ul>
    </Card>
  );
}
