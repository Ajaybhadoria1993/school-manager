import type { ReactNode } from "react";
import { FolderPlus, Layers, Pencil, Trash2 } from "lucide-react";
import { TONES } from "../../constants/tones";
import { departmentIcon, plural, type ClassGroup } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { InfoTip, TipButton, WithTip } from "../ui/Hint";
import { ManageLink } from "./ManageLink";

/**
 * One department: a band in its own colour with the name and what is in it, and its classes below as a grid of cards. On the right
 * of the band are a pencil (rename the department), a bin (delete it, after asking) and **Manage**, which opens the department's
 * own screen where its classes and their sections are changed.
 * Without a department (`group.department` is null) the classes are the school's "Other classes" when there are departments,
 * or just a plain grid when there are none. "Other classes" has **Manage** too (its own screen lists the classes that are in
 * no department) and an **Add department** button: it opens the dialog that makes a department and puts these classes in it.
 */
export function DepartmentGroup({
  group,
  titled,
  onAddDepartment,
  onRename,
  onDelete,
  children,
}: {
  group: ClassGroup;
  /** False for a school that uses no departments: the grid needs no heading then. */
  titled: boolean;
  /** For the "Other classes" group: opens the dialog that adds a department and moves classes into it. */
  onAddDepartment: () => void;
  /** For a real department: opens the window that renames it. */
  onRename: () => void;
  /** For a real department: asks whether to delete it. */
  onDelete: () => void;
  children: ReactNode;
}) {
  const { department, classes, tone } = group;
  const t = TONES[tone];
  const Icon = department ? departmentIcon(department.name) : Layers;
  const sectionCount = classes.reduce((sum, c) => sum + c.sections.length, 0);
  const manageTo = `/school/classes/departments/${department?.id ?? "none"}`;

  return (
    <section aria-label={department?.name ?? "Other classes"} className="space-y-4">
      {titled && (
        // The buttons do not fit beside the name on a phone: they drop to a second line there, on the right.
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-gradient-to-r to-transparent py-2 pl-2 pr-3", t.wash)}>
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", t.gradient)}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-[9rem] flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold tracking-tight text-foreground">{department?.name ?? "Other classes"}</h2>
              {!department && (
                <InfoTip label="What are other classes?">
                  These classes are not in any department yet. Press Add department to make one and choose which of them go in it.
                </InfoTip>
              )}
            </div>
            <p className="text-xs text-foreground-muted">
              {plural(classes.length, "class")} · {plural(sectionCount, "section")}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {!department && (
              <WithTip tip="Make a department, such as Pre-Primary, and choose which of these classes go in it.">
                <Button size="sm" variant="outline" className="shrink-0" onClick={onAddDepartment}>
                  <FolderPlus className="size-4" aria-hidden />
                  Add department
                </Button>
              </WithTip>
            )}
            {department && (
              <span className="inline-flex shrink-0 items-center">
                <TipButton label={`Rename ${department.name}`} icon={Pencil} onPress={onRename} />
                <TipButton label={`Delete ${department.name}`} icon={Trash2} danger onPress={onDelete} />
              </span>
            )}
            <ManageLink
              to={manageTo}
              label={`Manage ${department?.name ?? "other classes"}`}
              tip={
                department
                  ? `Open ${department.name} to add classes to it and change its classes and their sections.`
                  : "Open these classes to give each a department, or change them and their sections."
              }
              tone={tone}
            />
          </div>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-surface px-5 py-4">
          <p className="text-sm text-foreground-muted">No classes in {department?.name ?? "this list"} yet.</p>
          {department && (
            <ManageLink to={manageTo} label={`Add classes to ${department.name}`} tip={`Open ${department.name} and add classes to it.`} tone={tone} />
          )}
        </div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">{children}</div>
      )}
    </section>
  );
}
