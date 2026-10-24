import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, MapPin, School, UserRound, type LucideIcon } from "lucide-react";
import {
  useConfirmOnboardingMutation,
  useSaveOnboardingStepMutation,
  useSubmitOnboardingMutation,
} from "../../redux/api/onboardingApi";
import { getApiError } from "../../utils/apiErrors";
import { STEP_SUBTITLES, STEP_TITLES } from "../../constants/schoolOptions";
import { Card } from "../ui/Card";
import type { OnboardingState } from "../../types";
import { Stepper } from "./Stepper";
import { useReportStage } from "./stage";
import { StepReview } from "./StepReview";
import { StepAddress, StepProfile, StepSchool, type SubmitStep } from "./steps";
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

const STEP_ICONS: LucideIcon[] = [School, MapPin, UserRound, ClipboardCheck];

/**
 * The four-step form. Every step is saved on the server as soon as it is completed, so the
 * administrator can leave and come back on any device and land on the right step.
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
  const [active, setActive] = useState(() => Math.min(Math.max(state.onboarding.currentStep, 1), 4));
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  // What was typed in a step but not saved: Back, Edit and the stepper must not throw it away.
  const [drafts, setDrafts] = useState<Partial<Record<1 | 2 | 3, FormValues>>>({});
  const draftFor = (step: 1 | 2 | 3): FormDraft => ({
    values: drafts[step],
    onChange: (values) => setDrafts((d) => ({ ...d, [step]: values })),
  });

  const maxOpen = Math.max(state.onboarding.currentStep, active);
  useReportStage(active);
  const StepIcon = STEP_ICONS[active - 1];

  // A new step (or a long review page) should start at the top, not wherever the last one was scrolled to.
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
        // Editing from the review goes straight back to it; the first walk-through moves on step by step.
        const done = res.data.onboarding.completedSteps;
        setActive([1, 2, 3].every((s) => done.includes(s)) ? 4 : step + 1);
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
    <div className="space-y-5">
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

      <Card className="px-5 py-4 sm:px-7 sm:py-5">
        <Stepper active={active} completed={state.onboarding.completedSteps} maxOpen={maxOpen} onSelect={setActive} />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 border-b border-border bg-gradient-to-r from-primary-soft/70 to-surface px-5 py-5 sm:px-8">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary shadow-card">
            <StepIcon className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{STEP_TITLES[active - 1]}</h2>
            <p className="text-sm text-foreground-muted">{STEP_SUBTITLES[active - 1]}</p>
          </div>
        </div>

        {/* `key` gives each step a fresh form, filled from what the server has saved. */}
        <div key={active} className="rise-in p-5 sm:p-8">
          {active === 1 && <StepSchool key="s1" initial={state.steps[1]} draft={draftFor(1)} onSubmit={save(1)} saving={saving} />}
          {active === 2 && <StepAddress key="s2" initial={state.steps[2]} draft={draftFor(2)} onSubmit={save(2)} onBack={() => setActive(1)} saving={saving} />}
          {active === 3 && <StepProfile key="s3" initial={state.steps[3]} draft={draftFor(3)} onSubmit={save(3)} onBack={() => setActive(2)} saving={saving} />}
          {active === 4 && (
            <StepReview
              steps={state.steps}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
              onEdit={setActive}
              onBack={() => setActive(3)}
              onSubmit={submitAll}
              submitting={saving}
              resubmit={rejected}
              error={submitError}
              missingSteps={missing}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
