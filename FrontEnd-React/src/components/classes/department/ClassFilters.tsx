import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import type { ClassFilters as Filters, ClassSort } from "../../../hooks/useClassFilters";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";

const SORTS: { value: ClassSort; label: string }[] = [
  { value: "order", label: "Order" },
  { value: "name", label: "Name" },
  { value: "seats", label: "Seats" },
];

const LABEL = "mb-1 text-[11px] font-bold uppercase tracking-wider text-foreground-muted";

/**
 * The bar across the top of a department's class list: search by class name, and the sort. (The department is the one the
 * screen is about, so there is no department to pick.) Nothing is filtered here: a change goes to the address and the server
 * answers with the matching page. The search box waits until you stop typing, so one burst of typing is one request. While you are
 * typing in it it shows your text; otherwise it shows what the address says (so Clear, a link and the back button empty or fill it).
 */
export function ClassFilters({
  filters,
  active,
  onChange,
  onClear,
}: {
  filters: Filters;
  /** How many filters are set. */
  active: number;
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState(filters.q);
  const typing = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  // Not typing: show what the address says.
  useEffect(() => {
    if (!typing.current) setName(filters.q);
  }, [filters.q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Sends what was typed once it has stopped for a moment. */
  function send(q: string) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange({ q }), 300);
  }

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-3" role="search" aria-label="Search the classes">
      <div className="min-w-[14rem] flex-[3]">
        <p className={LABEL}>Class name</p>
        <Input
          aria-label="Search classes by name"
          icon={Search}
          value={name}
          maxLength={40}
          placeholder="Search class name"
          onFocus={() => (typing.current = true)}
          onBlur={() => (typing.current = false)}
          onChange={(e) => {
            setName(e.target.value);
            send(e.target.value);
          }}
        />
      </div>

      <div className="min-w-[11rem] flex-1">
        <div className="mb-1 flex items-center justify-between gap-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-foreground-muted">Sort by</p>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary-deep underline-offset-2 hover:underline"
            aria-label={filters.dir === "asc" ? "Sorted lowest first: press for highest first" : "Sorted highest first: press for lowest first"}
            onClick={() => onChange({ dir: filters.dir === "asc" ? "desc" : "asc" })}
          >
            {filters.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
            {filters.dir === "asc" ? "Lowest first" : "Highest first"}
          </button>
        </div>
        <Select aria-label="Sort the classes by" value={filters.sort} options={SORTS} onChange={(sort) => onChange({ sort: sort as ClassSort })} />
      </div>

      {active > 0 && (
        <Button variant="ghost" className="text-primary-deep" onClick={onClear}>
          <X className="size-4" aria-hidden />
          Clear
        </Button>
      )}
    </div>
  );
}
