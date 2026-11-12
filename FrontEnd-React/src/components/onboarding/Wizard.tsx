import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  useConfirmOnboardingMutation,
  useSaveOnboardingStepMutation,
  useSubmitOnboardingMutation,
} from "../../redux/api/onboardingApi";
import { getApiError } from "../../utils/apiErrors";
import { ACADEMIC_STAGE, CLASSES_STAGE, REVIEW_STAGE, doneStages, stageAfterSave, stageOfServerStep } from "../../constants/onboardingStages";
import { boardFromApi, rangeText } from "../../utils/mediumPlans";
import { SoftControls } from "../ui/Input";
import type { BoardDraft, OnboardingState } from "../../types";
import { useReportProgress } from "./stage";
import { StepReview } from "./StepReview";
import { StepAcademic, StepClasses, StepProfile, StepSchool, type SubmitStep } from "./steps";
import type { FieldErrors, FormDraft, FormValues } from "./useFormValues";

/** The server answers 400 with `details: [{ path, message }]`; turn that into { path: message }. */
function toFieldErrors(err: unknown): FieldErrors {
  const apiErr = getApiError(err);
  if (apiErr) {
    if (Array.isArray(apiErr.details)) {
      const out: FieldErrors = {};
      for (const d of apiErr.details as { path?: string; message?: string }[]) {
        if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
      }
      if (Object.keys(out).length > 0) return out;
    }
    return { _form: apiErr.message };
  }
  return { _form: "Something went wrong. Please try again." };
}

/**
 * The sign-up form: five screens (School Details, Academic Year, Class Sections, Your Profile, Review & Submit) that the server keeps as
 * three saved steps and a review (see constants/onboardingStages.ts). Every step is saved on the server as soon as it is completed, so
 * the administrator can leave and come back on any device and land on the right screen. The list of screens at the side and the card at
 * the top are the frame's (Layouts/OnboardingLayout.tsx): this tells them where the school is.
 */
export function Wizard({
  state,
  onSubmitted,
  onLocked,
}: {
  /** The saved form. Saving a step replaces it in the cache, so this prop is always the latest. */
  state: OnboardingState;
  /** The form was sent for approval. */
  onSubmitted: () => void;
  /** The server says this form can no longer be edited (it was submitted elsewhere). */
  onLocked: () => void;
}) {
  const [saveStep] = useSaveOnboardingStepMutation();
  const [confirmOnboarding] = useConfirmOnboardingMutation();
  const [submitOnboarding] = useSubmitOnboardingMutation();
  const rejected = state.approvalStatus === "rejected";
  const [active, setActive] = useState(() => stageOfServerStep(Math.min(Math.max(state.onboarding.currentStep, 1), 4)));
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  // What was typed in a step but not saved: Previous, Edit and the list at the side must not throw it away. The Academic Year and Class
  // Sections screens are one server step (2), so they share one draft.
  const [drafts, setDrafts] = useState<Partial<Record<1 | 2 | 3, FormValues>>>({});
  // The Academic Year screen opened again to say what is wrong with it (a problem found when Class Sections was saved).
  const [academicFix, setAcademicFix] = useState<{ errors: FieldErrors; n: number } | null>(null);
  const draftFor = (step: 1 | 2 | 3): FormDraft => ({
    values: drafts[step],
    onChange: (values) => setDrafts((d) => ({ ...d, [step]: values })),
  });

  const maxOpen = Math.max(stageOfServerStep(state.onboarding.currentStep), active);

  // The range the school typed for its one medium ("Nursery to 10th"), for the line under the heading of Class Sections.
  const boards: BoardDraft[] = (drafts[2]?.boards as BoardDraft[] | undefined) ?? state.steps[1].boards.map(boardFromApi);
  const plans = boards.flatMap((entry) => entry.plans);
  const range = plans.length === 1 ? rangeText(plans[0].lowestClass, plans[0].highestClass) : "";
  useReportProgress({
    active,
    done: doneStages(state.onboarding.completedSteps),
    reachable: maxOpen,
    onSelect: setActive,
    subtitle: active === CLASSES_STAGE && range ? `Configure sections for each class (${range}) with their details` : undefined,
  });

  // A new screen (or a long review page) should start at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active]);

  const save =
    (step: 1 | 2 | 3): SubmitStep =>
    async (values) => {
      setSaving(true);
      try {
        const res = await saveStep({ step, values }).unwrap();
        setDrafts((d) => {
          const rest = { ...d };
          delete rest[step];
          return rest;
        });
        // Changing an answer voids the confirmation (the server drops it too): tick it again on the review.
        setConfirmed(false);
        // Editing from the review goes straight back to it; the first walk-through moves on screen by screen.
        const done = res.data.onboarding.completedSteps;
        setActive([1, 2, 3].every((s) => done.includes(s)) ? REVIEW_STAGE : stageAfterSave(step));
        return null;
      } catch (err) {
        if (getApiError(err)?.code === "ONBOARDING_LOCKED") onLocked();
        return toFieldErrors(err);
      } finally {
        setSaving(false);
      }
    };

  async function submitAll() {
    setSubmitError(null);
    setMissing([]);
    setSaving(true);
    try {
      await confirmOnboarding().unwrap();
      await submitOnboarding().unwrap();
      onSubmitted();
    } catch (err) {
      const apiErr = getApiError(err);
      if (apiErr?.code === "ONBOARDING_LOCKED") {
        onLocked();
      } else if (apiErr?.code === "ONBOARDING_INCOMPLETE") {
        const list = (apiErr.details as { missingSteps?: number[] } | undefined)?.missingSteps ?? [];
        setMissing(list.filter((s) => s !== 4));
        setSubmitError(list.length ? null : apiErr.message);
      } else {
        setSubmitError(apiErr?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {rejected && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-danger/25 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-foreground">Your school needs a few changes</p>
            {state.rejectionReason && <p className="mt-1 break-words text-foreground">&ldquo;{state.rejectionReason}&rdquo;</p>}
            <p className="mt-1 text-foreground-muted">Update the details below, then submit again. Nothing you entered was lost.</p>
          </div>
        </div>
      )}

      {/* `key` gives each screen a fresh form, filled from what the server has saved. */}
      <SoftControls>
        <div key={active} className="rise-in">
          {/* Step 1 is the school and its address, which the server keeps as two topics: both are what the form starts from. */}
          {active === 1 && <StepSchool key="s1" initial={{ ...state.steps[1], ...state.steps[2] }} draft={draftFor(1)} onSubmit={save(1)} saving={saving} />}
          {active === ACADEMIC_STAGE && (
            <StepAcademic
              key={`s2-${academicFix?.n ?? 0}`}
              initial={state.steps[1]}
              draft={draftFor(2)}
              errorsFromNext={academicFix?.errors}
              onContinue={() => setActive(CLASSES_STAGE)}
              onBack={() => setActive(1)}
            />
          )}
          {active === CLASSES_STAGE && (
            <StepClasses
              key="s3"
              initial={state.steps[1]}
              draft={draftFor(2)}
              onSubmit={save(2)}
              onBack={() => setActive(ACADEMIC_STAGE)}
              onFixAcademic={(errors) => {
                setAcademicFix((fix) => ({ errors, n: (fix?.n ?? 0) + 1 }));
                setActive(ACADEMIC_STAGE);
              }}
              onEditYear={() => setActive(ACADEMIC_STAGE)}
              saving={saving}
            />
          )}
          {active === 4 && <StepProfile key="s4" initial={state.steps[3]} draft={draftFor(3)} onSubmit={save(3)} onBack={() => setActive(CLASSES_STAGE)} saving={saving} />}
          {active === REVIEW_STAGE && (
            <StepReview
              steps={state.steps}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
              // The review is given the number of the screen (1 to 4) that each of its parts was filled in on.
              onEdit={setActive}
              onBack={() => setActive(4)}
              onSubmit={submitAll}
              submitting={saving}
              resubmit={rejected}
              error={submitError}
              missingSteps={missing}
            />
          )}
        </div>
      </SoftControls>
    </div>
  );
}
