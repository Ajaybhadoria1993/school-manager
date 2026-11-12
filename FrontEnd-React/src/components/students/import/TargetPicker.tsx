import type { ClassItem, ImportTarget } from "../../../types";
import { Select } from "../../ui/Select";

const WHOLE_SCHOOL = "all";
const ANY_SECTION = "any";

/**
 * Who the file is for: the whole school (each row names its class, the default), one class, or one section of a class. A class that has
 * sections gets a second box; a class without sections has nothing more to choose. The choice is a plain state of the page: it is not
 * saved, and a new file starts as a whole-school file again.
 */
export function TargetPicker({
  classes,
  target,
  onChange,
  disabled,
}: {
  classes: readonly ClassItem[];
  target: ImportTarget | null;
  onChange: (target: ImportTarget | null) => void;
  disabled?: boolean;
}) {
  const klass = target ? classes.find((c) => c.id === target.classId) : undefined;
  const label = "text-xs font-semibold text-foreground-muted";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <span id="import-class-label" className={label}>
          Upload for
        </span>
        <Select
          id="import-class"
          value={klass?.id ?? WHOLE_SCHOOL}
          disabled={disabled}
          options={[{ value: WHOLE_SCHOOL, label: "Whole school" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(id) => onChange(id === WHOLE_SCHOOL || id === "" ? null : { classId: id, sectionId: null })}
        />
      </div>
      {klass && klass.sections.length > 0 && (
        <div className="min-w-0 space-y-1.5">
          <span id="import-section-label" className={label}>
            Section
          </span>
          <Select
            id="import-section"
            value={target?.sectionId ?? ANY_SECTION}
            disabled={disabled}
            options={[{ value: ANY_SECTION, label: "Any section (shared evenly)" }, ...klass.sections.map((s) => ({ value: s.id, label: s.name }))]}
            onChange={(id) => onChange({ classId: klass.id, sectionId: id === ANY_SECTION || id === "" ? null : id })}
          />
        </div>
      )}
    </div>
  );
}
