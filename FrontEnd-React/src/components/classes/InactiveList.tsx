import { useState } from "react";
import { Archive, ChevronDown, CircleCheck } from "lucide-react";
import { useReactivateClassMutation, useReactivateDepartmentMutation } from "../../redux/api/academicsApi";
import { getApiError } from "../../utils/apiErrors";
import { plural } from "../../utils/academics";
import { cn, formatDate } from "../../utils/helpers";
import type { AcademicStructure, ClassItem, DepartmentItem } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useToast } from "../ui/toast-context";

/**
 * The classes and departments the school made inactive. They are never deleted (a class holds students and their history), so this is
 * where they wait, whole, and where each comes back with one click. It is closed until opened, and is not on the page at all when
 * nothing is inactive. A class cannot come back under a department that is inactive: the server says so, and the message is shown.
 */
export function InactiveList({ structure }: { structure: AcademicStructure }) {
  const [open, setOpen] = useState(false);
  const { push } = useToast();
  const [reactivateClass] = useReactivateClassMutation();
  const [reactivateDepartment] = useReactivateDepartmentMutation();
  const [working, setWorking] = useState<string | null>(null);

  const classes = structure.inactiveClasses ?? [];
  const departments = structure.inactiveDepartments ?? [];
  const total = classes.length + departments.length;
  if (total === 0) return null;

  const departmentName = (id: string | null) =>
    id ? [...structure.departments, ...departments].find((d) => d.id === id)?.name ?? null : null;

  async function bringBack(kind: "class" | "department", item: ClassItem | DepartmentItem) {
    setWorking(item.id);
    try {
      await (kind === "class" ? reactivateClass(item.id) : reactivateDepartment(item.id)).unwrap();
      push("success", `${item.name} is active again`);
    } catch (err) {
      push("error", getApiError(err)?.message ?? `Could not make ${item.name} active.`);
    } finally {
      setWorking(null);
    }
  }

  const who = (item: ClassItem | DepartmentItem) =>
    item.inactive ? `Made inactive by ${item.inactive.by.name} on ${formatDate(item.inactive.at)}` : "Inactive";

  const row = (kind: "class" | "department", item: ClassItem | DepartmentItem, detail: string) => (
    <li key={`${kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {item.name} <span className="font-normal text-foreground-muted">· {kind === "class" ? "Class" : "Department"}</span>
        </p>
        <p className="truncate text-xs text-foreground-muted">{detail}</p>
      </div>
      <Button size="sm" variant="outline" loading={working === item.id} onClick={() => void bringBack(kind, item)} aria-label={`Make ${item.name} active`}>
        {working !== item.id && <CircleCheck className="size-4" aria-hidden />}
        Make active
      </Button>
    </li>
  );

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        <Archive className="size-4 text-foreground-muted" aria-hidden />
        <span className="flex-1 text-sm font-bold text-foreground">Inactive ({total})</span>
        <span className="text-xs text-foreground-muted">
          {[classes.length > 0 && plural(classes.length, "class"), departments.length > 0 && plural(departments.length, "department")].filter(Boolean).join(" · ")}
        </span>
        <ChevronDown className={cn("size-4 text-foreground-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="fade-in divide-y divide-border border-t border-border">
          {departments.map((d) => row("department", d, who(d)))}
          {classes.map((c) => row("class", c, [departmentName(c.departmentId) && `Was in ${departmentName(c.departmentId)}`, who(c)].filter(Boolean).join(" · ")))}
        </ul>
      )}
    </Card>
  );
}
