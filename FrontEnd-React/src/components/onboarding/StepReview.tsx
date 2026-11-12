import { ArrowLeft, GraduationCap, Pencil, School, Send, type LucideIcon } from "lucide-react";
import { API_URL } from "../../redux/api/baseQueryWithReauth";
import { Button } from "../ui/Button";
import { boardLabel, designationLabel, formatAffiliations, formatBoards, formatPhone } from "../../constants/schoolOptions";
import { ONBOARDING_STAGES, stageOfServerStep } from "../../constants/onboardingStages";
import { formatDayRange } from "../../utils/academicYear";
import { plural } from "../../utils/academics";
import { planFacts } from "../../utils/mediumPlans";
import type { SchoolSteps } from "../../types";

/** One line of the review: what it is (small capitals) and what was answered, or "Not provided" in grey. */
function Row({ label, value }: { label: string; value?: string | number | null }) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className="grid gap-x-4 gap-y-0.5 py-2.5 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted sm:pt-0.5">{label}</dt>
      <dd className={empty ? "text-foreground-muted/60" : "font-medium text-foreground [overflow-wrap:anywhere]"}>{empty ? "Not provided" : value}</dd>
    </div>
  );
}

/** A part of a card (the school, its address, the year, one medium, you): its name, a button that opens the screen where it was filled in, and its lines. */
function Part({ title, screen, onEdit, children }: { title: string; screen: number; onEdit: (stage: number) => void; children: React.ReactNode }) {
  return (
    <section className="py-4 first:pt-0 last:pb-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-foreground">{title}</h4>
        <button
          type="button"
          aria-label={`Edit ${title}`}
          onClick={() => onEdit(screen)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground-muted transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
        >
          <Pencil className="size-3" aria-hidden />
          Edit
        </button>
      </div>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}

/** One of the two big cards: a heading with its icon, and its parts one under the other, set apart by a line. */
function ReviewCard({ icon: Icon, title, note, children }: { icon: LucideIcon; title: string; note: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-white bg-white/90 p-4 shadow-raised sm:p-6">
      <header className="mb-5 flex items-center gap-3.5 border-b border-border pb-4">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon className="size-[22px]" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-tight text-foreground">{title}</h3>
          <p className="text-sm text-foreground-muted">{note}</p>
        </div>
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

/**
 * The last screen before the form is sent: everything the school wrote, in two cards. The first is the school and how to reach it (and who is
 * registering it); the second is the academics: the year and the boards, and, for each medium, its classes, sections, seats, days and timing.
 * Each part has an Edit button that opens the screen where it was filled in (`onEdit` is given the screen's number, 1 to 4), and what was
 * typed there is still there. Below: the confirmation, and Previous and Submit.
 */
export function StepReview({
  steps,
  confirmed,
  onConfirmedChange,
  onEdit,
  onBack,
  onSubmit,
  submitting,
  resubmit,
  error,
  missingSteps,
}: {
  steps: SchoolSteps;
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
  /** Opens a screen of the form (1 School Details, 2 Academic Year, 3 Class Sections, 4 Your Profile). */
  onEdit: (stage: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  resubmit: boolean;
  error: string | null;
  /** The saved steps (1 to 3) the server says are not finished. */
  missingSteps: number[];
}) {
  const s1 = steps[1];
  const s2 = steps[2];
  const s3 = steps[3];
  // Every medium of every board, named by its board too once the school follows more than one.
  const mediums = s1.boards.flatMap((entry) =>
    (entry.plans ?? []).map((plan) => ({ title: `${s1.boards.length > 1 && entry.board ? `${boardLabel(entry)} · ` : ""}${plan.medium} Medium`, facts: planFacts(plan) }))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary-soft/70 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Send className="size-[18px]" aria-hidden />
        </span>
        <p className="text-sm">
          <span className="block font-semibold text-foreground">Almost there!</span>
          <span className="text-foreground-muted">Read through your details. You can edit any part before you submit.</span>
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ReviewCard icon={School} title="School and contact" note="Your school, where it is and who is registering it">
          <Part title="School" screen={1} onEdit={onEdit}>
            <Row label="Name" value={s1.schoolName} />
            <Row label="Type" value={s1.schoolType} />
            <Row label="UDISE+ code" value={s1.udiseCode} />
            <Row label="Established" value={s1.establishedYear} />
            <Row label="Students" value={s1.approxStudents} />
            {s1.logoUrl && (
              <div className="grid items-center gap-x-4 gap-y-0.5 py-2.5 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">Logo</dt>
                <dd>
                  <img src={`${API_URL}${s1.logoUrl}`} alt="School logo" className="size-12 rounded-lg border border-border object-contain" />
                </dd>
              </div>
            )}
          </Part>
          <Part title="Address and contact" screen={1} onEdit={onEdit}>
            <Row label="Address" value={[s2.addressLine1, s2.addressLine2].filter(Boolean).join(", ")} />
            <Row label="City" value={s2.city} />
            <Row label="District" value={s2.district} />
            <Row label="Division" value={s2.division} />
            <Row label="State" value={s2.state} />
            <Row label="PIN code" value={s2.pincode} />
            <Row label="Phone" value={formatPhone(s2.schoolPhone)} />
            <Row label="Email" value={s2.schoolEmail} />
            <Row label="Website" value={s2.website} />
          </Part>
          <Part title="Registered by" screen={4} onEdit={onEdit}>
            <Row label="Name" value={s3.adminName} />
            <Row label="Role" value={designationLabel(s3.designation, s3.designationOther)} />
            <Row label="Mobile" value={formatPhone(s3.mobile)} />
            <Row label="Alternate mobile" value={formatPhone(s3.alternateMobile)} />
          </Part>
        </ReviewCard>

        <ReviewCard icon={GraduationCap} title="Academics" note="The session, the boards and the classes of each medium">
          <Part title="Academic year" screen={2} onEdit={onEdit}>
            <Row label="Academic year" value={s1.academicYear?.name} />
            <Row label="Session" value={formatDayRange(s1.academicYear?.startDate ?? "", s1.academicYear?.endDate ?? "")} />
            <Row label="Board and medium" value={formatBoards(s1.boards)} />
            <Row label="Affiliation no." value={formatAffiliations(s1.boards)} />
          </Part>
          {mediums.length === 0 && (
            <Part title="Classes and timing" screen={3} onEdit={onEdit}>
              <Row label="Classes" value={null} />
            </Part>
          )}
          {mediums.map(({ title, facts }) => (
            <Part key={title} title={title} screen={3} onEdit={onEdit}>
              <Row label="Classes" value={facts.range ? `${facts.range} · ${plural(facts.classes, "class")}` : null} />
              <Row label="Sections and seats" value={`${plural(facts.sections, "section")} · ${plural(facts.seats, "seat")} in all`} />
              {facts.rooms > 0 && <Row label="Rooms" value={`${facts.rooms} of ${plural(facts.classes, "class")} ${facts.rooms === 1 ? "has" : "have"} a room`} />}
              {facts.streams.length > 0 && <Row label="Streams" value={facts.streams.join(", ")} />}
              <Row label="School days" value={facts.days} />
              <Row label="Timing" value={[facts.timing, facts.saturday && `Saturday ${facts.saturday}`].filter(Boolean).join(" · ")} />
            </Part>
          ))}
        </ReviewCard>
      </div>

      {missingSteps.length > 0 && (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Some steps are not finished:{" "}
          {missingSteps.map((step, i) => {
            const stage = stageOfServerStep(step);
            return (
              <span key={step}>
                {i > 0 && ", "}
                <button type="button" className="font-medium underline" onClick={() => onEdit(stage)}>
                  {ONBOARDING_STAGES[stage - 1].label}
                </button>
              </span>
            );
          })}
          .
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white bg-white/90 px-4 py-3.5 text-sm text-foreground shadow-card transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary-soft/60">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmedChange(e.target.checked)}
          className="mt-0.5 size-[18px] shrink-0 rounded border-border accent-[var(--primary)]"
        />
        <span>I confirm that the information above is correct, and that I am authorised to register this school.</span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting} className="rounded-xl border-primary! px-5 text-primary hover:bg-primary-soft">
          <ArrowLeft className="size-4" aria-hidden />
          Previous
        </Button>
        <Button type="button" onClick={onSubmit} loading={submitting} disabled={!confirmed}>
          <Send className="size-4" aria-hidden />
          {resubmit ? "Resubmit for approval" : "Submit for approval"}
        </Button>
      </div>
    </div>
  );
}
