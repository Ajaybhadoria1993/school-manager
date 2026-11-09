import type { ReactNode } from "react";
import { cn } from "../../utils/helpers";
import { Select, type SelectOption } from "./Select";

/** The "all" row of a filter's list: picking it takes that filter away. */
const ALL = "__all__";

/**
 * The row of a list page's search and filters (Teacher, School Class), like Infinity Medisetu's: on a wide screen (1280px and more)
 * the search (first child, in `FilterSearch`) takes the room that is left and each dropdown is up to 14rem, all on one line however many
 * dropdowns the page has; narrower, the search has its own line and the dropdowns sit four (on a phone two) to a line.
 */
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      role="search"
      className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-flow-col xl:grid-rows-1 xl:grid-cols-[minmax(16rem,1fr)] xl:auto-cols-[minmax(0,14rem)]"
    >
      {children}
    </section>
  );
}

/** The search box's place in a FilterBar. */
export function FilterSearch({ children }: { children: ReactNode }) {
  return <div className="col-span-2 min-w-0 md:col-span-4 xl:col-span-1">{children}</div>;
}

/**
 * One filter of a FilterBar: no label over it, the box shows the filter's name until something is picked (then the pick, tinted, so the
 * filters that are on stand out). The name is still the dropdown's name for a screen reader (`id`-label). Its list starts with `all`
 * ("All subjects"), which takes the filter away: `onChange` then gets "".
 */
export function FilterSelect({
  id,
  name,
  all,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  name: string;
  all: string;
  /** "" = nothing picked (the box shows `name`). */
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label id={`${id}-label`} htmlFor={id} className="sr-only">
        {name}
      </label>
      <Select
        id={id}
        value={value}
        placeholder={name}
        disabled={disabled}
        options={[{ value: ALL, label: all }, ...options]}
        onChange={(v) => onChange(v === ALL ? "" : v)}
        triggerClassName={cn(value ? "border-primary/40 bg-primary-soft/60 font-semibold text-primary-deep" : "text-foreground-muted")}
      />
    </div>
  );
}
