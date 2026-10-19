import { CheckCircle2, Circle, Hourglass, MailCheck, Power, PowerOff, ThumbsDown, ThumbsUp } from "lucide-react";
import { Alert, Button } from "@heroui/react";
import { STATUS_META, formatDateTime } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { SchoolReview } from "@/types";

const STEP_NAMES = ["School details", "Address and contact", "About the administrator", "Review and confirm"];

/**
 * Where the school stands and what you can do about it. A school that is waiting can be approved or sent back,
 * and a live one can be suspended (and a suspended one reactivated); every other stage says what happened,
 * or what the school is doing, instead.
 */
export function DecisionPanel({
  data,
  index,
  onApprove,
  onReject,
  onSuspend,
  onReactivate,
}: {
  data: SchoolReview;
  index: number;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
}) {
  const { tenant, onboarding, review, suspension } = data;
  const status = tenant.approvalStatus;
  const style = { "--i": index } as React.CSSProperties;

  if (status === "pending") {
    return (
      <section
        className="stagger-item rounded-2xl border border-warning-line bg-gradient-to-b from-warning-soft to-surface p-5 shadow-card"
        style={style}
      >
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
          </span>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Your decision</h2>
        </div>
        <p className="mt-2 text-sm text-foreground-muted">
          Read the details, then decide. The administrator gets an email with your decision either way.
        </p>
        <div className="mt-4 grid gap-2.5">
          <Button size="lg" fullWidth onPress={onApprove}>
            <ThumbsUp className="size-4" aria-hidden />
            Approve school
          </Button>
          <Button size="lg" fullWidth variant="danger-soft" onPress={onReject}>
            <ThumbsDown className="size-4" aria-hidden />
            Send back with a reason
          </Button>
        </div>
      </section>
    );
  }

  if (status === "approved" && !tenant.isActive) {
    return (
      <section className="stagger-item space-y-3" style={style}>
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Suspended{suspension ? ` ${formatDateTime(suspension.suspendedAt)}` : ""}</Alert.Title>
            <Alert.Description>
              {suspension?.suspendedByName ? `By ${suspension.suspendedByName}. ` : ""}Nobody from this school can sign in.
              {suspension?.reason && (
                <span className="mt-2 block rounded-lg border-l-4 border-danger bg-surface/70 px-3 py-2 text-foreground">{suspension.reason}</span>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Switch it back on</h2>
          <p className="mt-1.5 text-sm text-foreground-muted">Everyone can sign in again. The administrator gets an email saying so.</p>
          <Button className="mt-4" size="lg" fullWidth onPress={onReactivate}>
            <Power className="size-4" aria-hidden />
            Reactivate school
          </Button>
        </div>
      </section>
    );
  }

  if (status === "approved") {
    return (
      <section className="stagger-item space-y-3" style={style}>
        <Alert status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Approved{review.approvedAt ? ` ${formatDateTime(review.approvedAt)}` : ""}</Alert.Title>
            <Alert.Description>
              {review.reviewedByName ? `By ${review.reviewedByName}. ` : ""}
              The administrator can open the dashboard.
              {review.note && <span className="mt-2 block rounded-lg bg-surface/70 px-3 py-2 text-foreground">{review.note}</span>}
            </Alert.Description>
          </Alert.Content>
        </Alert>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Need to stop it?</h2>
          <p className="mt-1.5 text-sm text-foreground-muted">
            Suspending signs everyone out and blocks sign-in. Nothing is deleted, and you can switch it back on any time.
          </p>
          <Button className="mt-4" size="lg" fullWidth variant="danger-soft" onPress={onSuspend}>
            <PowerOff className="size-4" aria-hidden />
            Suspend school
          </Button>
        </div>
      </section>
    );
  }

  if (status === "rejected") {
    return (
      <section className="stagger-item" style={style}>
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Sent back{review.reviewedAt ? ` ${formatDateTime(review.reviewedAt)}` : ""}</Alert.Title>
            <Alert.Description>
              {review.reviewedByName ? `By ${review.reviewedByName}. ` : ""}You will get an email when the school submits again.
              {review.rejectionReason && (
                <span className="mt-2 block rounded-lg border-l-4 border-danger bg-surface/70 px-3 py-2 text-foreground">{review.rejectionReason}</span>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </section>
    );
  }

  // invited / onboarding: nothing to decide yet
  const done = onboarding.completedSteps;
  return (
    <section className="stagger-item rounded-2xl border border-border bg-surface p-5 shadow-card" style={style}>
      <div className="flex items-center gap-2.5">
        {status === "invited" ? <MailCheck className="size-5 text-foreground-muted" aria-hidden /> : <Hourglass className="size-5 text-info" aria-hidden />}
        <h2 className="text-base font-semibold tracking-tight text-foreground">Nothing to decide yet</h2>
      </div>
      <p className="mt-2 text-sm text-foreground-muted">{STATUS_META[status].hint}.</p>
      {status === "onboarding" && (
        <ol className="mt-4 space-y-2.5">
          {STEP_NAMES.map((name, i) => {
            const isDone = done.includes(i + 1);
            return (
              <li key={name} className="flex items-center gap-2.5 text-sm">
                {isDone ? (
                  <CheckCircle2 className="pop-in size-4 shrink-0 text-success" style={{ animationDelay: `${300 + i * 90}ms` }} aria-label="Done" />
                ) : (
                  <Circle className="size-4 shrink-0 text-foreground-muted/50" aria-label="Not done" />
                )}
                <span className={cn(isDone ? "text-foreground" : "text-foreground-muted")}>{name}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
