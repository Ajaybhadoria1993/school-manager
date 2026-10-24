import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, List, Search, X } from "lucide-react";
import type { StudentFilters as Filters, StudentView } from "../../hooks/useStudentFilters";
import type { AcademicStructure, StudentCapacity } from "../../types";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { WithTip } from "../ui/Hint";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

/** "all" stands for "no class" / "no section" in the dropdowns (a dropdown cannot show an empty value as picked). */
const ALL = "all";

const VIEWS: { value: StudentView; label: string; icon: typeof List; tip: string }[] = [
  { value: "table", label: "List", icon: List, tip: "A table: one row for each student." },
  { value: "grid", label: "Grid", icon: LayoutGrid, tip: "Cards: a colourful card for each student." },
];

/**
 * The row above the students, like the appointments list it is modelled on: a search that takes all the room that is left, the class
 * (with arrows to step to the class before or after it, and how many students each class has), the section of that class, and the
 * List / Grid switch at the right. Nothing is filtered here: a change goes to the address and the server answers with the matching page
 * (the switch only changes how the answer is drawn). The search box waits until typing stops (300 ms), so a burst of typing is one
 * request. The students come in the server's order (by class and section, then by name): there is no sort to pick. Every control has a
 * fixed width except the search, and Clear keeps its place while hidden, so nothing moves when a class or a search is set.
 */
export function StudentToolbar({
  filters,
  active,
  structure,
  capacity,
  onChange,
  onClear,
}: {
  filters: Filters;
  active: number;
  structure: AcademicStructure;
  capacity: StudentCapacity | undefined;
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState(filters.q);
  const typing = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  // Not typing: show what the address says (Clear, a link, the back button).
  useEffect(() => {
    if (!typing.current) setText(filters.q);
  }, [filters.q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function send(q: string) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange({ q }), 300);
  }

  const byClass = new Map((capacity?.classes ?? []).map((c) => [c.classId, c.enrolled]));
  const bySection = new Map((capacity?.sections ?? []).map((s) => [s.sectionId, s.enrolled]));
  const classOptions = [
    { value: ALL, label: `All classes (${capacity?.totals.students ?? 0})` },
    ...structure.classes.map((c) => ({ value: c.id, label: `${c.name} (${byClass.get(c.id) ?? 0})` })),
  ];
  // The classes in teaching order, with "all" first: the arrows step through them.
  const steps = ["", ...structure.classes.map((c) => c.id)];
  const at = Math.max(0, steps.indexOf(filters.classId));

  const klass = structure.classes.find((c) => c.id === filters.classId);
  const hasSections = !!klass && klass.sections.length > 0;
  const sectionOptions = hasSections
    ? [
        { value: ALL, label: `All sections (${byClass.get(klass.id) ?? 0})` },
        ...klass.sections.map((s) => ({
          value: s.id,
          label: `Section ${s.name} (${bySection.get(s.id) ?? 0}${s.capacity ? `/${s.capacity} seats` : ""})`,
        })),
      ]
    : [];

  return (
    <div role="search" aria-label="Find students" className="flex flex-wrap items-center gap-x-3 gap-y-3">
      {/* Takes whatever room the other controls leave, so the row is always full; on a phone it is a row of its own. */}
      <div className="min-w-[14rem] flex-1">
        <Input
          aria-label="Search students by name or admission number"
          icon={Search}
          value={text}
          maxLength={60}
          placeholder="Search by name or admission number"
          onFocus={() => (typing.current = true)}
          onBlur={() => (typing.current = false)}
          onChange={(e) => {
            setText(e.target.value);
            send(e.target.value);
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <WithTip tip="The class before this one.">
          <Button variant="outline" className="px-2.5" aria-label="Previous class" disabled={at <= 0} onClick={() => onChange({ classId: steps[at - 1] })}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        </WithTip>
        <div className="w-52">
          <Select
            id="students-class"
            aria-label="Show the students of a class"
            value={filters.classId || ALL}
            options={classOptions}
            onChange={(id) => onChange({ classId: id === ALL ? "" : id })}
          />
        </div>
        <WithTip tip="The class after this one.">
          <Button variant="outline" className="px-2.5" aria-label="Next class" disabled={at >= steps.length - 1} onClick={() => onChange({ classId: steps[at + 1] })}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </WithTip>
      </div>

      <div className="w-52">
        <Select
          id="students-section"
          aria-label="Show a section of the class"
          value={filters.sectionId || ALL}
          options={sectionOptions}
          disabled={!hasSections}
          placeholder={klass ? "No sections" : "Pick a class"}
          onChange={(id) => onChange({ sectionId: id === ALL ? "" : id })}
        />
      </div>

      {/* Its place is kept even when there is nothing to clear, so picking a class never moves the search or the dropdowns. */}
      <div className={cn("shrink-0", active === 0 && "invisible")} aria-hidden={active === 0 || undefined}>
        <WithTip tip="Clear the search and the class.">
          <Button variant="ghost" className="px-2.5 text-primary-deep" aria-label="Clear" onClick={onClear} disabled={active === 0} tabIndex={active === 0 ? -1 : undefined}>
            <X className="size-4" aria-hidden />
          </Button>
        </WithTip>
      </div>

      <div role="group" aria-label="How to show the students" className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
        {VIEWS.map((view) => (
          <WithTip key={view.value} tip={view.tip}>
            <button
              type="button"
              aria-pressed={filters.view === view.value}
              onClick={() => onChange({ view: view.value })}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                filters.view === view.value ? "bg-primary-soft text-primary-deep" : "text-foreground-muted hover:bg-background hover:text-foreground"
              )}
            >
              <view.icon className="size-4" aria-hidden />
              {view.label}
            </button>
          </WithTip>
        ))}
      </div>
    </div>
  );
}
