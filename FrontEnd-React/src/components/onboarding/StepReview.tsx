import { ArrowLeft, GraduationCap, MapPin, Pencil, School, Send, UserRound, type LucideIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { designationLabel, formatAffiliations, formatBoards, formatClassRange, formatPhone } from "../../constants/schoolOptions";
import { formatDayRange } from "../../utils/academicYear";
import type { SchoolSteps } from "../../types";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className="space-y-0.5 py-2.5 text-sm sm:grid sm:grid-cols-5 sm:gap-3 sm:space-y-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted sm:col-span-2 sm:pt-0.5">{label}</dt>
      <dd className={empty ? "text-foreground-muted/60 sm:col-span-3" : "font-medium text-foreground [overflow-wrap:anywhere] sm:col-span-3"}>
        {empty ? "Not provided" : value}
      </dd>
    </div>
  );
}

function Block({
  title,
  icon: Icon,
  step,
  onEdit,
  children,
}: {
  title: string;
  icon: LucideIcon;
  step: number;
  onEdit: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground-muted transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
        >
          <Pencil className="size-3" aria-hidden />
          Edit
        </button>
      </div>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}

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
  onEdit: (step: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  resubmit: boolean;
  error: string | null;
  missingSteps: number[];
}) {
  const s1 = steps[1];
  const s2 = steps[2];
  const s3 = steps[3];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary-soft/70 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Send className="size-[18px]" aria-hidden />
        </span>
        <p className="text-sm">
          <span className="block font-semibold text-foreground">Almost there!</span>
          <span className="text-foreground-muted">Read through your details. You can edit any section before you submit.</span>
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Block title="School" icon={School} step={1} onEdit={onEdit}>
          <Row label="Name" value={s1.schoolName} />
          <Row label="Type" value={s1.schoolType} />
          <Row label="Board and medium" value={formatBoards(s1.boards)} />
          <Row label="Affiliation no." value={formatAffiliations(s1.boards)} />
          <Row label="UDISE+ code" value={s1.udiseCode} />
          <Row label="Established" value={s1.establishedYear} />
        </Block>
        <Block title="Address and contact" icon={MapPin} step={2} onEdit={onEdit}>
          <Row label="Address" value={[s2.addressLine1, s2.addressLine2].filter(Boolean).join(", ")} />
          <Row label="City" value={s2.city} />
          <Row label="District" value={s2.district} />
          <Row label="Division" value={s2.division} />
          <Row label="State" value={s2.state} />
          <Row label="PIN code" value={s2.pincode} />
          <Row label="Phone" value={formatPhone(s2.schoolPhone)} />
          <Row label="Email" value={s2.schoolEmail} />
          <Row label="Website" value={s2.website} />
        </Block>
        <Block title="You" icon={UserRound} step={3} onEdit={onEdit}>
          <Row label="Name" value={s3.adminName} />
          <Row label="Role" value={designationLabel(s3.designation, s3.designationOther)} />
          <Row label="Mobile" value={formatPhone(s3.mobile)} />
          <Row label="Alternate mobile" value={formatPhone(s3.alternateMobile)} />
        </Block>
        <Block title="Classes and size" icon={GraduationCap} step={1} onEdit={onEdit}>
          <Row label="Classes" value={formatClassRange(s1.lowestClass, s1.highestClass)} />
          <Row label="Students" value={s1.approxStudents} />
          <Row label="Academic year" value={s1.academicYear?.name} />
          <Row label="Session" value={formatDayRange(s1.academicYear?.startDate ?? "", s1.academicYear?.endDate ?? "")} />
        </Block>
      </div>

      {missingSteps.length > 0 && (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Some steps are not finished:{" "}
          {missingSteps.map((step, i) => (
            <span key={step}>
              {i > 0 && ", "}
              <button type="button" className="font-medium underline" onClick={() => onEdit(step)}>
                step {step}
              </button>
            </span>
          ))}
          .
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface-muted/60 px-4 py-3.5 text-sm text-foreground transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary-soft/60">
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

      <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        <Button type="button" onClick={onSubmit} loading={submitting} disabled={!confirmed}>
          <Send className="size-4" aria-hidden />
          {resubmit ? "Resubmit for approval" : "Submit for approval"}
        </Button>
      </div>
    </div>
  );
}
