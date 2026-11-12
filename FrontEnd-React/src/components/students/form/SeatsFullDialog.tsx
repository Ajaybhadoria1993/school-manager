import { useState } from "react";
import { Armchair, Plus, Rows3 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { MAX_CLASS_CAPACITY, MAX_SECTION_CAPACITY } from "../../../constants/academics";
import { useDivideForm } from "../../../hooks/useDivideForm";
import { useDivideClassMutation } from "../../../redux/api/academicsApi";
import { getApiError } from "../../../utils/apiErrors";
import { plural } from "../../../utils/academics";
import { cn } from "../../../utils/helpers";
import type { AcademicStructure, DivideClassResult } from "../../../types";
import { DivideFields } from "../../classes/DivideFields";
import { AppModal, ModalError } from "../../ui/AppModal";
import { Input } from "../../ui/Input";

/** The place that is full: a section, or a class that has no sections (its students sit in the class itself). */
export interface SeatsUnit {
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  enrolled: number;
  capacity: number;
}

const asNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : NaN);

/**
 * "This class is full": what to do about the student who needs a seat. Two answers, both on the screen at once:
 *   - Add seats: raise the seats to a number (for a few more students, as a school does); the student is then put in.
 *   - Make sections (only for a class with no sections, and for someone who may manage classes): divide the class into sections, the
 *     students it has are shared out between them (the dialog says how many go where before anything is done), and the new student
 *     goes to the section with the fewest.
 * A section that is full only offers more seats (the other answer is to pick another section, which is Cancel). Nothing is changed
 * until the button is pressed. `admitting` says whether the student is being admitted right now (the words follow it).
 */
export function SeatsFullDialog({
  unit,
  structure,
  canMakeSections,
  admitting,
  onAddSeats,
  onDivided,
  onClose,
}: {
  unit: SeatsUnit;
  structure: AcademicStructure;
  canMakeSections: boolean;
  /** True when the form is being submitted (the buttons say "and admit"); false when a full place was only picked. */
  admitting: boolean;
  /** The person chose to add seats: `to` is the seats the place will have. */
  onAddSeats: (to: number) => void;
  /** The class was divided: the section the new student goes to, and what was made. */
  onDivided: (section: { id: string; name: string }, result: DivideClassResult) => void;
  onClose: () => void;
}) {
  const klass = structure.classes.find((c) => c.id === unit.classId);
  const title = unit.sectionName ? `${unit.className} - ${unit.sectionName}` : unit.className;
  const canDivide = unit.sectionId === null && canMakeSections && (klass?.sections.length ?? 0) === 0;
  const [choice, setChoice] = useState<"seats" | "sections">("seats");
  const [divide, { isLoading: dividing }] = useDivideClassMutation();
  const [error, setError] = useState<string | null>(null);

  // ----- Add seats
  const [seatsText, setSeatsText] = useState(String(unit.enrolled + 1));
  const to = asNumber(seatsText);
  const maxSeats = unit.sectionId ? MAX_SECTION_CAPACITY : MAX_CLASS_CAPACITY;
  const seatsProblem = Number.isNaN(to)
    ? "Enter the seats as a number."
    : to <= unit.enrolled
      ? `${title} has ${unit.enrolled} students: it needs at least ${unit.enrolled + 1} seats.`
      : to > maxSeats
        ? `At most ${maxSeats} seats.`
        : null;
  // A section's seats are part of its class's: when the section outgrows what the class has, the class's seats grow too.
  const others = (klass?.sections ?? []).filter((s) => s.id !== unit.sectionId).reduce((sum, s) => sum + (s.capacity ?? 0), 0);
  const classGrows = unit.sectionId && !seatsProblem && klass?.capacity != null && others + to > klass.capacity ? others + to : null;

  // ----- Make sections (the one more student needs a seat too)
  const division = useDivideForm({ enrolled: unit.enrolled, newcomer: true, needsRooms: structure.settings.sectionDetailsRequired });

  async function makeSections() {
    setError(null);
    if (division.problem) {
      setError(division.problem);
      return;
    }
    try {
      const res = await divide({ id: unit.classId, ...division.request() }).unwrap();
      // The new student sits in the section with the fewest students (the first when equal), which has a seat for them.
      const target = res.data.sections.reduce((best, s) => (s.students < best.students ? s : best), res.data.sections[0]);
      onDivided({ id: target.id, name: target.name }, res.data);
    } catch (err) {
      setError(getApiError(err)?.message ?? "Could not make the sections.");
    }
  }

  function submit() {
    if (choice === "sections") {
      void makeSections();
      return;
    }
    if (seatsProblem) {
      setError(seatsProblem);
      return;
    }
    onAddSeats(to);
  }

  const option = (value: "seats" | "sections", icon: typeof Plus, heading: string, text: string) => {
    const Icon = icon;
    const on = choice === value;
    return (
      <label className="relative block">
        <input
          type="radio"
          name="seats-full"
          value={value}
          checked={on}
          onChange={() => {
            setChoice(value);
            setError(null);
          }}
          className="peer sr-only"
        />
        <span
          className={cn(
            "flex h-full cursor-pointer gap-3 rounded-xl border p-3 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20",
            on ? "border-primary bg-primary-soft/50 ring-1 ring-primary" : "border-border bg-surface hover:border-primary/50"
          )}
        >
          <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground">{heading}</span>
            <span className="mt-0.5 block text-xs text-foreground-muted">{text}</span>
          </span>
        </span>
      </label>
    );
  };

  const go = choice === "seats" ? (admitting ? "Add seats and admit" : "Add seats") : admitting ? "Make sections and admit" : "Make sections";

  return (
    <AppModal
      title={`${title} is full`}
      icon={Armchair}
      busy={dividing}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={dividing}>
            Cancel
          </HeroButton>
          <HeroButton variant="primary" isPending={dividing} onPress={submit}>
            {go}
          </HeroButton>
        </>
      }
    >
      <p className="text-sm text-foreground-muted">
        <span className="font-semibold text-foreground">
          {unit.enrolled} of {unit.capacity} seats
        </span>{" "}
        are taken, so there is no seat for this student. {canDivide ? "Choose what to do:" : unit.sectionId ? "Add seats to it, or cancel and pick another section." : "Add seats to continue."}
      </p>

      {canDivide && (
        <div role="radiogroup" aria-label={`What to do about ${title}`} className="grid gap-2 sm:grid-cols-2">
          {option("seats", Plus, "Add seats", `For a few more students: raise the seats of ${unit.className}.`)}
          {option("sections", Rows3, "Make sections", `Divide ${unit.className} into sections (A, B...) and share its students between them.`)}
        </div>
      )}

      {choice === "seats" ? (
        <div>
          <label htmlFor="seats-full-to" className="mb-1.5 block text-sm font-semibold text-foreground">
            Seats of {title}
          </label>
          <Input
            id="seats-full-to"
            aria-label={`New seats of ${title}`}
            aria-invalid={seatsProblem ? true : undefined}
            inputMode="numeric"
            maxLength={String(maxSeats).length}
            value={seatsText}
            onChange={(e) => {
              setSeatsText(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <p className={cn("mt-1.5 text-xs", seatsProblem ? "font-medium text-danger" : "text-foreground-muted")}>
            {seatsProblem ??
              `${title} will have ${plural(to, "seat")}, ${to - unit.capacity} more than now.${classGrows ? ` ${unit.className} has ${klass?.capacity} seats and its sections share them, so its seats grow to ${classGrows}.` : ""}`}
          </p>
        </div>
      ) : (
        <DivideFields form={division} className={unit.className} enrolled={unit.enrolled} classSeats={klass?.capacity ?? null} newcomer />
      )}

      <ModalError message={error} />
    </AppModal>
  );
}
