import { useState } from "react";
import { BadgeCheck, Check, Hourglass, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { formatBoards, formatClassRange, formatPhone } from "../../constants/schoolOptions";
import { formatDateTime } from "../../utils/status";
import { cn } from "../../utils/helpers";
import type { OnboardingState } from "../../types";
import { useReportStage } from "./stage";
import { Stepper } from "./Stepper";

function Milestone({ title, text, state }: { title: string; text: string; state: "done" | "active" }) {
  return (
    <li
      className={cn(
        "flex-1 rounded-2xl border p-4 text-left",
        state === "done" ? "border-primary/20 bg-primary-soft/60" : "border-warning/30 bg-warning-soft"
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          state === "done" ? "bg-primary text-primary-foreground" : "bg-warning text-white"
        )}
      >
        {state === "done" ? <Check className="size-[18px]" strokeWidth={3} aria-hidden /> : <Hourglass className="size-[18px]" aria-hidden />}
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-foreground-muted">{text}</p>
      <p className={cn("mt-2 text-xs font-semibold", state === "done" ? "text-primary" : "text-warning")}>
        {state === "done" ? "Completed" : "In review"}
      </p>
    </li>
  );
}

/** Shown after submitting, until the platform team decides. The page above polls and moves on by itself. */
export function WaitingView({
  state,
  email,
  onCheck,
}: {
  state: OnboardingState;
  email: string;
  onCheck: () => Promise<void>;
}) {
  useReportStage(5);
  const [checking, setChecking] = useState(false);
  const s1 = state.steps[1];
  const s2 = state.steps[2];
  const s3 = state.steps[3];
  const { submittedAt, resubmittedCount } = state.onboarding;

  async function check() {
    setChecking(true);
    try {
      await onCheck();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="px-5 py-4 sm:px-7 sm:py-5">
        <Stepper active={5} completed={[1, 2, 3, 4]} maxOpen={5} />
      </Card>

      <Card className="rise-in overflow-hidden text-center">
        <div className="bg-gradient-to-b from-primary-soft to-surface px-6 pb-2 pt-10 sm:px-10">
          <div className="relative mx-auto flex size-20 items-center justify-center">
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-warning/20" />
            <span className="relative flex size-20 items-center justify-center rounded-full bg-surface text-warning shadow-float">
              <Hourglass className="size-9" aria-hidden />
            </span>
          </div>

          <h1 className="mt-7 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Waiting for approval</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-foreground-muted sm:text-base">
            Your school&apos;s details are with our team. Your dashboard opens as soon as they are approved.
          </p>
          {submittedAt && (
            <p className="mt-2 text-xs text-foreground-muted">
              {resubmittedCount > 0 ? `Resubmitted ${formatDateTime(submittedAt)}` : `Submitted ${formatDateTime(submittedAt)}`}
            </p>
          )}
        </div>

        <div className="px-6 pb-9 sm:px-10">
          <ol className="mt-7 flex flex-col gap-3 sm:flex-row" aria-label="Progress">
            <Milestone title="School details" text="Name, board, classes, address and contact" state="done" />
            <Milestone title="Your profile" text="You, as the school's administrator" state="done" />
            <Milestone title="Approval" text="Our team is checking everything" state="active" />
          </ol>

          <div className="mt-8 flex flex-col items-center gap-2">
            <Button variant="outline" onClick={check} disabled={checking}>
              {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
              Check status
            </Button>
            <p className="text-xs text-foreground-muted">
              This page updates by itself. We will also email <span className="font-medium text-foreground">{email}</span>.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <BadgeCheck className="size-5" aria-hidden />
          </span>
          <h2 className="text-base font-semibold text-foreground">What you sent</h2>
        </div>
        <dl className="mt-4 grid gap-x-8 text-sm sm:grid-cols-2">
          {(
            [
              ["School", s1.schoolName],
              ["Boards", formatBoards(s1.boards)],
              ["City", [s2.city, s2.state].filter(Boolean).join(", ")],
              ["Phone", formatPhone(s2.schoolPhone)],
              ["Administrator", s3.adminName],
              ["Classes", formatClassRange(s1.lowestClass, s1.highestClass)],
              ["Academic year", s1.academicYear?.name ? `${s1.academicYear.name} (pending approval)` : ""],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-border py-2.5">
              <dt className="text-foreground-muted">{label}</dt>
              <dd className="truncate font-medium text-foreground">{value || "-"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-foreground-muted">
          You cannot edit while the team is reviewing. If something needs to change, they will send it back to you with a note.
        </p>
      </Card>
    </div>
  );
}
