import { MAX_CLASS_CAPACITY } from "../../../constants/academics";
import { InfoTip } from "../../ui/Hint";
import { Input } from "../../ui/Input";
import { FIELD_TITLE } from "./fieldStyles";

/**
 * The seats of the whole class, a small box beside its name: how many students the class can take, with or without sections. Like
 * the name it only edits what the class screen's draft holds; the one Save in the header saves it. Escape puts the saved seats back.
 * A class made before seats existed (or in bulk) has none yet: its box is empty and asks for them.
 */
export function ClassSeatsField({
  name,
  value,
  problem,
  dirty,
  unset,
  onChange,
  onRevert,
}: {
  /** The saved name of the class (the label does not change while typing). */
  name: string;
  value: string;
  problem?: string;
  dirty: boolean;
  /** The class has no seats saved yet. */
  unset: boolean;
  onChange: (value: string) => void;
  onRevert: () => void;
}) {
  return (
    <div className="w-36 shrink-0">
      <p className={`${FIELD_TITLE} flex items-center gap-1`}>
        Seats
        <InfoTip label="What are the class's seats?" className="size-4">
          How many students this whole class can take, whether or not it has sections. Its sections share these seats: all of them together
          cannot have more. You can change the number later.
        </InfoTip>
      </p>
      <Input
        aria-label={`Seats of ${name}`}
        aria-invalid={problem ? true : undefined}
        inputMode="numeric"
        value={value}
        maxLength={String(MAX_CLASS_CAPACITY).length}
        placeholder={unset ? "Not set" : "For example 120"}
        className="font-semibold"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && dirty) {
            e.preventDefault();
            onRevert();
          }
        }}
      />
      {problem && (
        <p role="alert" className="mt-1.5 max-w-64 text-xs font-medium text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
