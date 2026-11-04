import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import type { ClassFilters as Filters, ClassSort } from "../../../hooks/useClassFilters";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";

const SORTS: { value: ClassSort; label: string }[] = [
  { value: "order", label: "Sort: Order" },
  { value: "name", label: "Sort: Name" },
  { value: "seats", label: "Sort: Seats" },
];

/** What each direction means for each sort, in words a person would use ("Lowest first" means nothing for names). */
const DIRECTION: Record<ClassSort, { asc: string; desc: string }> = {
  order: { asc: "Lowest first", desc: "Highest first" },
  name: { asc: "A to Z", desc: "Z to A" },
  seats: { asc: "Fewest seats first", desc: "Most seats first" },
};

/**
 * The one slim row above a department's class list: search by class name, how to sort, and which way. No card and no titles
 * above the boxes (their placeholders and labels say what they are). (The department is the one the screen is about, so there is no
 * department to pick.) Nothing is filtered here: a change goes to the address and the server answers with the matching page. The
 * search box waits until you stop typing, so one burst of typing is one request. While you are typing in it it shows your text;
 * otherwise it shows what the address says (so Clear, a link and the back button empty or fill it).
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

  const words = DIRECTION[filters.sort];
  const now = filters.dir === "asc" ? words.asc : words.desc;
  const other = filters.dir === "asc" ? words.desc : words.asc;

  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Search the classes">
      <div className="min-w-[14rem] flex-1">
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

      <div className="w-40 shrink-0">
        <Select aria-label="Sort the classes by" value={filters.sort} options={SORTS} onChange={(sort) => onChange({ sort: sort as ClassSort })} />
      </div>

      <Button
        type="button"
        variant="outline"
        aria-label={`Sorted ${now.toLowerCase()}: press for ${other.toLowerCase()}`}
        onClick={() => onChange({ dir: filters.dir === "asc" ? "desc" : "asc" })}
      >
        {filters.dir === "asc" ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}
        {now}
      </Button>

      {active > 0 && (
        <Button variant="ghost" className="text-primary-deep" onClick={onClear}>
          <X className="size-4" aria-hidden />
          Clear
        </Button>
      )}
    </div>
  );
}
