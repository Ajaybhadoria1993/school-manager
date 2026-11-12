import { MAX_NEW_SECTIONS, MAX_SECTION_CAPACITY } from "../../constants/academics";
import type { DivideForm } from "../../hooks/useDivideForm";
import { plural } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import { Input } from "../ui/Input";

/** Sections to choose from when dividing a class: 2 to 6 are the usual; more can be added on the class's own page. */
const COUNTS = [2, 3, 4, 5, 6].filter((n) => n <= MAX_NEW_SECTIONS);

/**
 * The boxes of "divide this class into sections" (see `useDivideForm`): how many, the seats of each, a room for each when the school asks
 * for rooms, and a live line that says how many students go to each section before anything is done. Used by the full-class window of Add
 * student (where one more student is being admitted: `newcomer`) and by the class's own Divide window.
 */
export function DivideFields({
  form,
  className,
  enrolled,
  classSeats,
  newcomer,
}: {
  form: DivideForm;
  className: string;
  enrolled: number;
  /** The class's seats now (null: not set), to say what they become. */
  classSeats: number | null;
  newcomer: boolean;
}) {
  const classSeatsAfter = form.eachProblem ? null : Math.max(classSeats ?? 0, form.count * form.each);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-foreground">How many sections</p>
        <div role="radiogroup" aria-label="How many sections" className="flex flex-wrap gap-2">
          {COUNTS.map((n) => (
            <label key={n} className="relative block">
              <input type="radio" name="section-count" value={n} checked={form.count === n} onChange={() => form.setCount(n)} aria-label={`${n} sections`} className="peer sr-only" />
              <span
                className={cn(
                  "inline-flex h-9 min-w-10 cursor-pointer items-center justify-center rounded-xl border px-2.5 text-sm font-semibold peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20",
                  form.count === n ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:border-primary/50"
                )}
              >
                {n}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="divide-each" className="mb-1.5 block text-sm font-semibold text-foreground">
          Seats in each section
        </label>
        <Input
          id="divide-each"
          aria-label="Seats in each section"
          aria-invalid={form.eachProblem ? true : undefined}
          inputMode="numeric"
          maxLength={String(MAX_SECTION_CAPACITY).length}
          value={form.eachText}
          onChange={(e) => form.setEach(e.target.value)}
        />
        {form.eachProblem && <p className="mt-1.5 text-xs font-medium text-danger">{form.eachProblem}</p>}
      </div>

      {form.needsRooms && (
        <div className="grid gap-2 sm:grid-cols-2">
          {form.letters.map((letter, i) => (
            <div key={letter}>
              <label htmlFor={`divide-room-${letter}`} className="mb-1.5 block text-sm font-semibold text-foreground">
                Room of section {letter}
              </label>
              <Input
                id={`divide-room-${letter}`}
                aria-label={`Room of section ${letter}`}
                maxLength={30}
                placeholder="For example Room 12"
                value={form.rooms[i] ?? ""}
                onChange={(e) => form.setRoom(i, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm" aria-live="polite">
        <p className="font-semibold text-foreground">{form.letters.map((letter, i) => `${letter}: ${plural(form.plan.sizes[i], "student")}`).join(" · ")}</p>
        <p className="mt-1 text-xs text-foreground-muted">
          {enrolled > 0 ? `The ${plural(enrolled, "student")} of ${className} are shared out by name, and their roll numbers stay.` : `${className} has no students yet.`}
          {newcomer && ` The new student goes to section ${form.letters[form.plan.newcomerIn]}.`}
          {classSeatsAfter !== null && classSeatsAfter !== (classSeats ?? 0) && ` ${className} then has ${classSeatsAfter} seats, the sections together.`}
        </p>
      </div>
    </div>
  );
}
