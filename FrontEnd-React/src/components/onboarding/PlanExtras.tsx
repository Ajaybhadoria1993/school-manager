import { useState } from "react";
import { Plus, X } from "lucide-react";
import { SENIOR_STREAMS } from "../../constants/schoolOptions";
import { DAY_SHORT } from "../../constants/timetable";
import { addStream, removeStream, setStreams, streamProblem } from "../../utils/mediumPlans";
import { cn } from "../../utils/helpers";
import type { DaySetup } from "../../utils/timings";
import type { MediumPlanDraft } from "../../types";
import { DayFields, DayPreview } from "../timetable/DayFields";
import { Input } from "../ui/Input";

const WEEK = [1, 2, 3, 4, 5, 6, 7];
const SATURDAY = 6;

/** A half day to change from, when Saturday first gets its own timing. */
const halfDay = (usual: DaySetup): DaySetup => ({ ...usual, periods: Math.min(4, usual.periods || 4), lunchStart: null, lunchEnd: null, breakStart: null, breakEnd: null });

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-surface-muted")}
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

/** The streams of Class 11 and 12: the usual ones to tick, and any of the school's own. Each stream is a class of its own. */
export function PlanStreams({ plan, onChange, error }: { plan: MediumPlanDraft; onChange: (next: MediumPlanDraft) => void; error?: string }) {
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

  return (
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
          <button type="button" aria-label="Add stream" onClick={addOwnStream} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary">
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </span>
      </div>
      <Problem message={streamError ?? error} />
    </div>
  );
}

/** When the medium has school: the days, the timing of the usual day and, when Saturday is a school day, its own timing. */
export function PlanWeek({
  plan,
  title,
  id,
  onChange,
  error,
}: {
  plan: MediumPlanDraft;
  title: string;
  /** Tells this medium's boxes apart from another medium's. */
  id: string;
  onChange: (next: MediumPlanDraft) => void;
  error: (part: string) => string | undefined;
}) {
  const toggleDay = (day: number) => onChange({ ...plan, days: plan.days.includes(day) ? plan.days.filter((d) => d !== day) : [...plan.days, day].sort((a, b) => a - b) });

  return (
    <>
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
    </>
  );
}
