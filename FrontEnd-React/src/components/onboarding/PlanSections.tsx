import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, CircleCheck, Landmark, Layers } from "lucide-react";
import { classRangeSummary, hasSeniorClasses, planTotals, quickFill, rangeText, setClassRange } from "../../utils/mediumPlans";
import { plural } from "../../utils/academics";
import type { MediumPlanDraft } from "../../types";
import { InfoTip } from "../ui/Hint";
import { ClassCard } from "./ClassCard";
import { RangePicker } from "./RangePicker";
import type { HeaderSlots } from "./stage";
import { PlanStreams, PlanWeek } from "./PlanExtras";
import { QuickFill } from "./QuickFill";
import type { FieldErrors } from "./useFormValues";

/** One click to a usual range, for a medium that has none yet. */
const USUAL_RANGES: readonly [string, string][] = [
  ["Nursery", "5"],
  ["Nursery", "8"],
  ["Nursery", "10"],
  ["Nursery", "12"],
  ["1", "10"],
  ["1", "12"],
];

/**
 * One medium's Class Sections: a bar with the academic year, the range of classes (the classes in between are made for you), how many
 * classes are chosen and Quick Fill; then one pastel card for each class with its sections, seats and room; then a card that says all is
 * set. The streams of Class 11 and 12 are above the cards (so ticking one never moves the chips), the school days and timing below them.
 * Errors are read by the name of the box ("boards.0.plans.1.classes.3.seats").
 */
export function PlanSections({
  title,
  plan,
  prefix,
  errors,
  yearName,
  showTitle,
  onChange,
  onEditYear,
  slots,
}: {
  title: string;
  plan: MediumPlanDraft;
  /** "boards.0.plans.1": where this block's errors are kept, and how its boxes are told apart. */
  prefix: string;
  errors: FieldErrors;
  yearName: string;
  /** More than one medium on the screen: each one is named. */
  showTitle: boolean;
  onChange: (next: MediumPlanDraft) => void;
  /** Goes back to the Academic Year screen, where the year is chosen. */
  onEditYear: () => void;
  /** The places in the frame (under the heading card, and at the right) a medium alone puts its bar and Quick Fill in; none without a frame. */
  slots?: HeaderSlots;
}) {
  const id = prefix.replace(/\./g, "-");
  const error = (part: string) => errors[`${prefix}.${part}`];
  const totals = planTotals(plan);
  const range = rangeText(plan.lowestClass, plan.highestClass);
  const setRow = (index: number, patch: Partial<MediumPlanDraft["classes"][number]>) =>
    onChange({ ...plan, classes: plan.classes.map((c, i) => (i === index ? { ...c, ...patch } : c)) });

  // The year, the range and how many classes are chosen: under the heading card (a medium alone), or at the top of the medium (several).
  const controls = (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="w-full min-w-44 sm:w-56">
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Landmark className="size-4 text-foreground-secondary" aria-hidden />
          <span>
            Academic Year <span className="text-danger">*</span>
          </span>
        </p>
        <button
          type="button"
          onClick={onEditYear}
          title="Change the academic year on the Academic Year screen"
          className="flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-white px-3 text-left text-[15px] font-semibold text-foreground shadow-card transition-all hover:border-primary/40! focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        >
          <CalendarDays className="size-[19px] shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{yearName || "Not set"}</span>
          <ChevronDown className="size-4 shrink-0 text-foreground-muted" aria-hidden />
        </button>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Layers className="size-4 text-foreground-secondary" aria-hidden />
          <span>
            Class Range <span className="text-danger">*</span>
          </span>
        </p>
        <div className="flex items-center gap-2">
          <RangePicker lowest={plan.lowestClass} highest={plan.highestClass} invalid={!!(error("lowestClass") || error("highestClass"))} onChange={(lowest, highest) => onChange(setClassRange(plan, lowest, highest))} />
          <InfoTip label="What is the class range?" className="size-5">
            The first and the last class this medium runs. Every class in between gets a card below.
          </InfoTip>
        </div>
        {[error("lowestClass"), error("highestClass")].filter(Boolean).map((message) => (
          <p key={message} role="alert" className="mt-1.5 text-xs font-medium text-danger">
            {message}
          </p>
        ))}
      </div>

      {plan.classes.length > 0 && (
        <div className="fade-in flex h-12 items-center gap-2.5 rounded-xl border border-sky-100 bg-sky-50 px-3.5 shadow-card">
          <CircleCheck className="size-6 shrink-0 fill-emerald-500 text-white" aria-hidden />
          <span className="leading-tight">
            <span className="block text-sm font-bold text-foreground">{plural(plan.classes.length, "Class")} Selected</span>
            <span className="block max-w-56 truncate text-[11px] text-foreground-muted">{classRangeSummary(plan.lowestClass, plan.highestClass)}</span>
          </span>
        </div>
      )}
    </div>
  );
  const quickFillButton = plan.classes.length > 0 && <QuickFill medium={title} onApply={(values) => onChange(quickFill(plan, values))} />;
  // A medium alone puts its bar under the heading card and Quick Fill at the right of it (the frame has places for them); with several
  // mediums each one keeps its own bar and Quick Fill, so the buttons are never mixed up.
  const portal = !showTitle && !!slots?.below;

  return (
    <section aria-label={title} className="space-y-4">
      {showTitle && (
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      )}

      {portal ? createPortal(controls, slots!.below!) : <div className="flex flex-wrap items-end justify-between gap-3">{controls}{quickFillButton}</div>}
      {portal && slots?.side && quickFillButton && createPortal(quickFillButton, slots.side)}
      {portal && !slots?.side && quickFillButton && <div className="flex justify-end">{quickFillButton}</div>}

      {/* The streams are ABOVE the cards: ticking one adds or takes away cards, and the chips must stay where the finger is. (Below the cards they
          were pushed down by every card that came in, so the next press missed.) */}
      {plan.classes.length > 0 && hasSeniorClasses(plan.highestClass) && (
        <div className="rounded-2xl border border-white bg-white/80 p-4 shadow-card sm:p-5">
          <PlanStreams plan={plan} onChange={onChange} error={error("seniorStreams")} />
        </div>
      )}

      {plan.classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-white/70 p-5 text-center">
          <p className="text-sm font-semibold text-foreground">Choose the classes this medium runs</p>
          <p className="mt-0.5 text-sm text-foreground-muted">Pick the first and the last class above, or start from a usual range:</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {USUAL_RANGES.map(([from, to]) => (
              <button
                key={`${from}-${to}`}
                type="button"
                onClick={() => onChange(setClassRange(plan, from, to))}
                className="cursor-pointer rounded-full border border-border bg-white px-3.5 py-1.5 text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary-soft hover:text-primary active:scale-95"
              >
                {rangeText(from, to)}
              </button>
            ))}
          </div>
          {error("classes") && (
            <p role="alert" className="mt-3 text-xs font-medium text-danger">
              {error("classes")}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* overflow-anchor: none: when cards come in or go, the browser must not scroll the page to keep one of them in place (that is a jump). */}
          <ul aria-label={`${title}: classes`} className="[overflow-anchor:none] grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {plan.classes.map((row, i) => (
              <ClassCard
                key={row.name}
                row={row}
                position={i}
                onChange={(patch) => setRow(i, patch)}
                error={error(`classes.${i}.sections`) ?? error(`classes.${i}.seats`) ?? error(`classes.${i}.room`)}
              />
            ))}
            <li className="fade-in flex items-center gap-3 overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
              <img src="/images/onboarding/checklist.svg" alt="" className="float-slow h-20 w-[4.5rem] shrink-0" loading="lazy" />
              <div className="min-w-0">
                <p className="text-lg font-bold text-emerald-700">All Set!</p>
                <p className="text-xs leading-snug text-foreground-secondary">
                  You have configured sections for {plural(totals.classes, "class")}
                  {range ? ` from ${range}` : ""}.
                </p>
                <p aria-live="polite" className="mt-1 text-[11px] font-semibold text-foreground-muted">
                  {`${plural(totals.classes, "class")} · ${plural(totals.sections, "section")} · ${totals.seats} seats in all`}
                </p>
              </div>
            </li>
          </ul>
          {error("classes") && (
            <p role="alert" className="text-xs font-medium text-danger">
              {error("classes")}
            </p>
          )}
        </>
      )}

      {plan.classes.length > 0 && (
        <div className="space-y-5 rounded-2xl border border-white bg-white/80 p-4 shadow-card sm:p-5">
          <PlanWeek plan={plan} title={title} id={id} onChange={onChange} error={error} />
        </div>
      )}
    </section>
  );
}
