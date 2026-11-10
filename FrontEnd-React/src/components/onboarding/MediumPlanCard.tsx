import { useState } from "react";
import { GraduationCap, Minus, Plus, X } from "lucide-react";
import { CLASS_LEVELS, SENIOR_STREAMS } from "../../constants/schoolOptions";
import { DAY_SHORT } from "../../constants/timetable";
import { MAX_CLASS_SEATS, MAX_SEATS, MAX_SECTIONS, addStream, classSeats, hasSeniorClasses, planTotals, removeStream, setAllClasses, setClassRange, setStreams, streamProblem } from "../../utils/mediumPlans";
import { plural } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import type { DaySetup } from "../../utils/timings";
import type { MediumPlanDraft, PlanClass } from "../../types";
import { DayFields, DayPreview } from "../timetable/DayFields";
import { PAGE_GRID } from "../students/form/formGrid";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import type { FieldErrors } from "./useFormValues";

const WEEK = [1, 2, 3, 4, 5, 6, 7];
const SATURDAY = 6;

/** A number box's text as a number: an empty box is 0 and is shown empty, so a number can be cleared and typed again. */
const numberOf = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? 0 : Math.max(0, Math.round(Number(text))));

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-surface-muted")}
    >
      {children}
    </button>
  );
}

/** A stream the school named itself: lit like a ticked one, with its own way to take it away. */
function OwnStream({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary bg-primary text-xs font-semibold text-primary-foreground">
      <button type="button" aria-pressed="true" onClick={onRemove} className="rounded-l-full py-1.5 pl-3.5 pr-1.5">
        {name}
      </button>
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="rounded-r-full py-1.5 pl-1 pr-2.5 opacity-80 transition-opacity hover:opacity-100">
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-sm font-semibold text-foreground">{children}</p>;
}

function Problem({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
      {message}
    </p>
  );
}

/** The value every class has, or nothing when they differ. */
const shared = (classes: PlanClass[], part: "sections" | "seats") => (classes.every((c) => c[part] === classes[0]?.[part]) ? classes[0]?.[part] : undefined);

/** A half day to change from, when Saturday first gets its own timing. */
const halfDay = (usual: DaySetup): DaySetup => ({ ...usual, periods: Math.min(4, usual.periods || 4), lunchStart: null, lunchEnd: null, breakStart: null, breakEnd: null });

/**
 * One medium of a board: which classes it runs, the sections and seats of each, a class per stream in 11 and 12, and its own timing. It is
 * what approval builds this side of the school from. `copyFrom` is every other medium of the form, to start from its answers.
 */
export function MediumPlanCard({
  title,
  plan,
  prefix,
  errors,
  copyFrom,
  onChange,
  onCopy,
}: {
  title: string;
  plan: MediumPlanDraft;
  /** "boards.0.plans.1": where this card's errors are kept, and how its boxes are told apart. */
  prefix: string;
  errors: FieldErrors;
  copyFrom: readonly { value: string; label: string }[];
  onChange: (next: MediumPlanDraft) => void;
  onCopy: (value: string) => void;
}) {
  const id = prefix.replace(/\./g, "-");
  const error = (part: string) => errors[`${prefix}.${part}`];
  const setRow = (index: number, patch: Partial<PlanClass>) => onChange({ ...plan, classes: plan.classes.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const toggleDay = (day: number) => onChange({ ...plan, days: plan.days.includes(day) ? plan.days.filter((d) => d !== day) : [...plan.days, day].sort((a, b) => a - b) });
  const toggleStream = (stream: string) => onChange(plan.seniorStreams.includes(stream) ? removeStream(plan, stream) : setStreams(plan, [...plan.seniorStreams, stream]));

  // A stream of the school's own: typed here, added with the button or Enter (Enter must not send the whole form).
  const [typedStream, setTypedStream] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const ownStreams = plan.seniorStreams.filter((s) => !SENIOR_STREAMS.some((p) => p.toLowerCase() === s.toLowerCase()));
  function addOwnStream() {
    const problem = streamProblem(typedStream, plan.seniorStreams);
    setStreamError(problem);
    if (problem) return;
    onChange(addStream(plan, typedStream));
    setTypedStream("");
  }
  const totals = planTotals(plan);
  const setSections = (index: number, sections: number) => setRow(index, { sections: Math.min(MAX_SECTIONS, Math.max(0, sections)) });

  return (
    <section aria-label={title} className="space-y-4 rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-base font-bold text-foreground">{title}</h4>
        {copyFrom.length > 0 && <Select aria-label={`${title}: copy from`} className="w-full sm:w-60" value="" options={copyFrom} placeholder="Copy from..." onChange={onCopy} />}
      </div>

      <div className={PAGE_GRID}>
        <Field id={`${id}-lowest`} label="Classes from" error={error("lowestClass")}>
          <Select id={`${id}-lowest`} icon={GraduationCap} value={plan.lowestClass} options={CLASS_LEVELS} placeholder="First class" invalid={!!error("lowestClass")} onChange={(value) => onChange(setClassRange(plan, value, plan.highestClass))} />
        </Field>
        <Field id={`${id}-highest`} label="Classes up to" error={error("highestClass")}>
          <Select id={`${id}-highest`} icon={GraduationCap} value={plan.highestClass} options={CLASS_LEVELS} placeholder="Last class" invalid={!!error("highestClass")} onChange={(value) => onChange(setClassRange(plan, plan.lowestClass, value))} />
        </Field>
        {plan.classes.length > 0 && (
          <>
            <Field quiet id={`${id}-all-sections`} label="Sections in every class">
              <Input id={`${id}-all-sections`} type="number" min={0} max={MAX_SECTIONS} value={shared(plan.classes, "sections") ?? ""} placeholder="Different" onChange={(e) => onChange(setAllClasses(plan, { sections: numberOf(e.target.value) }))} />
            </Field>
            <Field quiet id={`${id}-all-seats`} label="Seats in every section">
              <Input id={`${id}-all-seats`} type="number" min={1} max={MAX_SEATS} value={shared(plan.classes, "seats") || ""} placeholder="Different" onChange={(e) => onChange(setAllClasses(plan, { seats: numberOf(e.target.value) }))} />
            </Field>
          </>
        )}
      </div>

      {hasSeniorClasses(plan.highestClass) && (
        <div>
          <Heading>Class 11 and 12 streams</Heading>
          <div className="flex flex-wrap items-center gap-2">
            {SENIOR_STREAMS.map((stream) => (
              <Toggle key={stream} on={plan.seniorStreams.includes(stream)} onClick={() => toggleStream(stream)}>
                {stream}
              </Toggle>
            ))}
            {ownStreams.map((stream) => (
              <OwnStream key={stream} name={stream} onRemove={() => onChange(removeStream(plan, stream))} />
            ))}
            <span className="flex items-center gap-2">
              <Input
                aria-label="Add a stream"
                className="h-10 w-48"
                value={typedStream}
                maxLength={30}
                placeholder="Another stream"
                aria-invalid={!!streamError}
                onChange={(e) => {
                  setTypedStream(e.target.value);
                  if (streamError) setStreamError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addOwnStream();
                }}
              />
              <button type="button" aria-label="Add stream" onClick={addOwnStream} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary">
                <Plus className="size-4" aria-hidden />
                Add
              </button>
            </span>
          </div>
          <Problem message={streamError ?? error("seniorStreams")} />
        </div>
      )}

      {plan.classes.length > 0 && (
        <div>
          <ul aria-label={`${title}: classes`} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {plan.classes.map((row, i) => (
              <li key={row.name} className="rounded-xl border border-border bg-surface-muted/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-bold text-foreground">{row.name}</p>
                  <p className="shrink-0 text-xs font-semibold tabular-nums text-foreground-muted">{`${classSeats(row)} seat${classSeats(row) === 1 ? "" : "s"}`}</p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="text-[11px] font-medium text-foreground-muted">
                    Sections
                    <div className="mt-0.5 flex items-center gap-1">
                      <button type="button" aria-label={`Fewer sections in ${row.name}`} disabled={row.sections <= 0} onClick={() => setSections(i, row.sections - 1)} className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40">
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <Input aria-label={`${row.name}: sections`} className="h-10 min-w-0 px-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="number" min={0} max={MAX_SECTIONS} value={row.sections} aria-invalid={!!error(`classes.${i}.sections`)} onChange={(e) => setSections(i, numberOf(e.target.value))} />
                      <button type="button" aria-label={`More sections in ${row.name}`} disabled={row.sections >= MAX_SECTIONS} onClick={() => setSections(i, row.sections + 1)} className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40">
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <label className="text-[11px] font-medium text-foreground-muted">
                    {row.sections > 0 ? "Seats in each" : "Seats"}
                    <Input aria-label={`${row.name}: seats`} className="mt-0.5 h-10" type="number" min={1} max={row.sections > 0 ? MAX_SEATS : MAX_CLASS_SEATS} value={row.seats || ""} aria-invalid={!!error(`classes.${i}.seats`)} onChange={(e) => setRow(i, { seats: numberOf(e.target.value) })} />
                  </label>
                </div>
                <Problem message={error(`classes.${i}.sections`) ?? error(`classes.${i}.seats`)} />
              </li>
            ))}
          </ul>
          <p aria-live="polite" className="mt-3 text-sm font-semibold text-foreground">
            {`${plural(totals.classes, "class")} · ${plural(totals.sections, "section")} · ${totals.seats} seats in all`}
          </p>
          <Problem message={error("classes")} />
        </div>
      )}

      <div>
        <Heading>School days</Heading>
        <div className="flex flex-wrap gap-2">
          {WEEK.map((day) => (
            <Toggle key={day} on={plan.days.includes(day)} onClick={() => toggleDay(day)}>
              {DAY_SHORT[day]}
            </Toggle>
          ))}
        </div>
        <Problem message={error("week.days")} />
      </div>

      <div>
        <Heading>Timing</Heading>
        <DayFields idPrefix={`${id}-usual`} name={`${title} usual day`} value={plan.usual} onChange={(usual) => onChange({ ...plan, usual })} />
        <div className="mt-3">
          <DayPreview name={`${title} usual day`} value={plan.usual} />
        </div>
        <Problem message={error("week.usual")} />
      </div>

      {plan.days.includes(SATURDAY) && (
        <div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
            <input type="checkbox" className="size-4 accent-primary" checked={plan.saturday !== null} onChange={(e) => onChange({ ...plan, saturday: e.target.checked ? halfDay(plan.usual) : null })} />
            Saturday has its own timing
          </label>
          {plan.saturday && (
            <div className="mt-3">
              <DayFields idPrefix={`${id}-saturday`} name={`${title} Saturday`} value={plan.saturday} onChange={(saturday) => onChange({ ...plan, saturday })} />
              <div className="mt-3">
                <DayPreview name={`${title} Saturday`} value={plan.saturday} />
              </div>
              <Problem message={error("week.saturday")} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
