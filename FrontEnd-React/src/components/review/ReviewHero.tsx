import { Building2, Clock3, MapPin, Send, Sparkles, UserPlus } from "lucide-react";
import { Avatar, Chip, ProgressCircle } from "@heroui/react";
import { useCountUp } from "../../hooks/useMotion";
import { boardLabel } from "../../constants/schoolOptions";
import { STATUS_META, formatDateTime, timeAgo } from "../../utils/status";
import { initials } from "../../utils/helpers";
import type { Signal } from "../../utils/review";
import type { ApprovalStatus, SchoolReview } from "../../types";

type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

const STATUS_COLOR: Record<ApprovalStatus, ChipColor> = {
  invited: "default",
  onboarding: "accent",
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

/** The ring on the right: how complete the form is, or (once it is sent in) how many of the checks are in order. */
function ProgressRing({ done, total, caption, color }: { done: number; total: number; caption: string; color: ChipColor }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const shown = useCountUp(percent, 1100); // the ring fills as the page arrives
  return (
    <div className="flex shrink-0 items-center gap-4 lg:flex-col lg:gap-2">
      <ProgressCircle aria-label={caption} value={shown} size="lg" color={color} className="relative">
        {() => (
          <>
            <ProgressCircle.Track className="size-24">
              <ProgressCircle.TrackCircle />
              <ProgressCircle.FillCircle />
            </ProgressCircle.Track>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-extrabold tracking-tight text-foreground">
              {done}/{total}
            </span>
          </>
        )}
      </ProgressCircle>
      <p className="max-w-[9rem] text-xs font-medium leading-snug text-foreground-muted lg:text-center">{caption}</p>
    </div>
  );
}

/** The top of the page: who this school is, where it stands, and how complete its answers are. */
export function ReviewHero({ data, signals, now }: { data: SchoolReview; signals: Signal[]; now: number }) {
  const { tenant, steps, onboarding } = data;
  const s1 = steps[1];
  const s2 = steps[2];
  const status = tenant.approvalStatus;
  const meta = STATUS_META[status];

  const submitted = status === "pending" || status === "approved" || status === "rejected";
  const okCount = signals.filter((s) => s.state === "ok").length;
  const ring = submitted
    ? { done: okCount, total: signals.length, caption: "Checks in order", color: (okCount === signals.length ? "success" : okCount >= signals.length - 2 ? "accent" : "warning") as ChipColor }
    : { done: onboarding.completedSteps.length, total: 4, caption: "Form steps done", color: "accent" as ChipColor };

  const place = [s2.city, s2.state].filter(Boolean).join(", ");

  return (
    <section className="stagger-item relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-primary-soft via-surface to-surface" />
      <div aria-hidden className="float-slow absolute -right-12 -top-16 size-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4 sm:gap-5">
          <Avatar color="accent" size="lg" className="size-16 shrink-0 rounded-2xl shadow-raised sm:size-[4.5rem]">
            <Avatar.Fallback className="bg-gradient-to-br from-primary to-primary-deep text-xl font-bold text-primary-foreground sm:text-2xl">
              {initials(tenant.name) || "S"}
            </Avatar.Fallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-[32px] sm:leading-10">{tenant.name}</h1>
              {/* A new key on a new status, so the chip pops in again when the decision is made. A suspended school is an approved one that is switched off: say so. */}
              <Chip key={`${status}-${tenant.isActive}`} color={tenant.isActive ? STATUS_COLOR[status] : "danger"} variant="soft" size="lg" className="pop-in">
                {status === "pending" && (
                  <span aria-hidden className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-70" />
                    <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                  </span>
                )}
                <Chip.Label>{tenant.isActive ? meta.label : "Suspended"}</Chip.Label>
              </Chip>
            </div>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground-muted">
              {s1.schoolType && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-4" aria-hidden />
                  {s1.schoolType}
                </span>
              )}
              {place && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" aria-hidden />
                  {place}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-4" aria-hidden />
                {tenant.subscriptionTier.charAt(0).toUpperCase() + tenant.subscriptionTier.slice(1)} plan
              </span>
            </p>

            {s1.boards.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {s1.boards.map((entry) => (
                  <Chip key={`${entry.board}-${entry.stateBoard}-${entry.otherBoard}`} color="accent" variant="soft" size="sm">
                    <Chip.Label>{boardLabel(entry)}</Chip.Label>
                  </Chip>
                ))}
              </div>
            )}

            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
              <span className="inline-flex items-center gap-1.5" title={formatDateTime(tenant.createdAt)}>
                <UserPlus className="size-3.5" aria-hidden />
                {tenant.source === "signup" ? "Registered itself" : "Invited by you"} {timeAgo(tenant.createdAt, now)}
              </span>
              {tenant.submittedAt && (
                <span className="inline-flex items-center gap-1.5" title={formatDateTime(tenant.submittedAt)}>
                  <Send className="size-3.5" aria-hidden />
                  Submitted {timeAgo(tenant.submittedAt, now)}
                </span>
              )}
              {tenant.resubmittedCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" aria-hidden />
                  Sent back {tenant.resubmittedCount} time{tenant.resubmittedCount === 1 ? "" : "s"} before
                </span>
              )}
            </p>
          </div>
        </div>

        <ProgressRing {...ring} />
      </div>
    </section>
  );
}
