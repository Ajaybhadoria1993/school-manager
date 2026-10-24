import { DoorOpen, Trash2 } from "lucide-react";
import { TONES, type Tone } from "../../../constants/tones";
import type { SectionField, SectionProblems, SectionValues } from "../../../hooks/useClassDraft";
import { classMark } from "../../../utils/academics";
import { cn } from "../../../utils/helpers";
import type { SectionItem } from "../../../types";
import { InfoTip, TipButton } from "../../ui/Hint";
import { Input } from "../../ui/Input";
import { FIELD_TITLE } from "./fieldStyles";

/**
 * One section as a card: its name, seats and room, and a bin at its top right. It only shows and edits what the class screen's
 * draft holds (`values`); it has no Save of its own: the one Save in the screen's header saves every card at once. A card with
 * something typed in it is outlined in amber and says "Not saved yet". When the school requires seats and room (`required`) their
 * titles carry a red star, and a section that still has neither is marked so it is not missed. A wrong value is shown under its box,
 * and what the server refused (a name already used in this class) under the boxes. Escape puts this card's saved values back.
 */
export function SectionCard({
  className,
  section,
  tone,
  values,
  problems,
  dirty,
  required,
  onChange,
  onRevert,
  onDelete,
}: {
  /** The class's name, for the labels ("Class 5 - A"). */
  className: string;
  /** The saved section (its labels use the saved name, so they do not change while typing). */
  section: SectionItem;
  tone: Tone;
  values: SectionValues;
  problems: SectionProblems;
  dirty: boolean;
  /** The school requires seats and room for a section. */
  required: boolean;
  onChange: (field: SectionField, value: string) => void;
  onRevert: () => void;
  onDelete: () => void;
}) {
  const label = `${className} - ${section.name}`;
  // Saved without what the school now requires (made in bulk with its class, or before the rule): said so until it is completed.
  const incomplete = required && (section.capacity == null || !section.room);
  const star = (
    <span className="ml-0.5 text-danger" aria-hidden>
      *
    </span>
  );

  return (
    <li
      onKeyDown={(e) => {
        if (e.key === "Escape" && dirty) {
          e.preventDefault();
          onRevert();
        }
      }}
      className={cn(
        "rounded-2xl border bg-surface p-3.5 shadow-sm transition-all hover:shadow-card",
        dirty ? "border-warning/60 ring-1 ring-warning/25" : "border-border"
      )}
    >
      <div className="flex items-end gap-3">
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold tracking-tight", TONES[tone].gradient)}>
          {classMark(section.name)}
        </span>
        <label className="block min-w-0 flex-1">
          <span className={FIELD_TITLE}>Section</span>
          <Input
            aria-label={`Name of ${label}`}
            aria-invalid={problems.name ? true : undefined}
            value={values.name}
            maxLength={20}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </label>
        <TipButton label={`Delete ${label}`} icon={Trash2} danger onPress={onDelete} />
      </div>
      {problems.name && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {problems.name}
        </p>
      )}

      {/* Seats are at most three digits, so the room gets the rest of the width. */}
      <div className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
        <div className="min-w-0">
          <span className={cn(FIELD_TITLE, "flex items-center gap-1")}>
            Seats
            {required && star}
            <InfoTip label="What are seats?" className="size-4">
              The most students this section should have. Admissions will warn you when a section is full. Leave it empty if there is no fixed
              limit.
            </InfoTip>
          </span>
          <Input
            aria-label={`Seats of ${label}`}
            aria-invalid={problems.seats ? true : undefined}
            inputMode="numeric"
            value={values.seats}
            maxLength={3}
            placeholder={required ? "Required" : "No limit"}
            onChange={(e) => onChange("seats", e.target.value)}
          />
        </div>
        <label className="block min-w-0">
          <span className={FIELD_TITLE}>
            Room
            {required && star}
          </span>
          <Input
            aria-label={`Room of ${label}`}
            aria-invalid={problems.room ? true : undefined}
            icon={DoorOpen}
            value={values.room}
            maxLength={30}
            placeholder={required ? "Required" : "Not set"}
            onChange={(e) => onChange("room", e.target.value)}
          />
        </label>
      </div>
      {(problems.seats || problems.room) && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {[problems.seats, problems.room].filter(Boolean).join(" ")}
        </p>
      )}
      {problems.form && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {problems.form}
        </p>
      )}
      {dirty && !problems.form && <p className="mt-2 text-xs font-semibold text-warning">Not saved yet</p>}
      {incomplete && !dirty && <p className="mt-2 text-xs font-medium text-warning">Add the seats and the room: your school requires them.</p>}
    </li>
  );
}
