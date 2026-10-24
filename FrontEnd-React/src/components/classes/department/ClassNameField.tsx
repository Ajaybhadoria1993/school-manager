import { Input } from "../../ui/Input";
import { FIELD_TITLE } from "./fieldStyles";

/**
 * The class's name box (not too wide). It only edits what the class screen's draft holds; the one Save in the header saves it,
 * together with the sections. Escape puts the saved name back. `name` is the saved name (the label does not change while typing).
 */
export function ClassNameField({
  name,
  value,
  problem,
  dirty,
  onChange,
  onRevert,
}: {
  name: string;
  value: string;
  problem?: string;
  dirty: boolean;
  onChange: (value: string) => void;
  onRevert: () => void;
}) {
  return (
    <div className="min-w-0 flex-1 basis-56">
      <p className={FIELD_TITLE}>Class name</p>
      <div className="max-w-xs">
        <Input
          aria-label={`Name of ${name}`}
          aria-invalid={problem ? true : undefined}
          value={value}
          maxLength={40}
          className="font-semibold"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && dirty) {
              e.preventDefault();
              onRevert();
            }
          }}
        />
      </div>
      {problem && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
