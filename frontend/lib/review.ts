import { CLASS_LEVELS } from "@/lib/schoolOptions";
import { formatDateTime } from "@/lib/status";
import type { SchoolReview } from "@/types";

/** How many classes run from the first to the last the school named, or null until it has said. */
export function classCount(lowest: string | null, highest: string | null): number | null {
  const from = CLASS_LEVELS.findIndex((c) => c === lowest);
  const to = CLASS_LEVELS.findIndex((c) => c === highest);
  return from >= 0 && to >= from ? to - from + 1 : null;
}

// ---------------------------------------------------------------- what to check before deciding

/** ok: given and fine. warn: something the reviewer should look at. info: optional, nothing wrong without it. */
export type SignalState = "ok" | "warn" | "info";

export interface Signal {
  id: string;
  label: string;
  state: SignalState;
  hint: string;
}

/** The facts a reviewer weighs, read only from what the school sent (nothing is guessed). */
export function buildSignals(data: SchoolReview): Signal[] {
  const { steps, admin } = data;
  const s1 = steps[1];
  const s2 = steps[2];
  const s3 = steps[3];
  const withNumber = s1.boards.filter((entry) => entry.affiliationNumber).length;
  const allNumbered = s1.boards.length > 0 && withNumber === s1.boards.length;

  return [
    {
      id: "email",
      label: "Administrator's email confirmed",
      state: admin?.emailVerifiedAt ? "ok" : "warn",
      hint: admin?.emailVerifiedAt ? `Confirmed ${formatDateTime(admin.emailVerifiedAt)}` : "They have not opened the link yet",
    },
    {
      id: "affiliation",
      label: "Affiliation number for every board",
      state: allNumbered ? "ok" : "warn",
      hint:
        s1.boards.length === 0
          ? "No board added yet"
          : allNumbered
            ? s1.boards.length === 1
              ? "Given"
              : `Given for all ${s1.boards.length} boards`
            : `${withNumber} of ${s1.boards.length} boards have one`,
    },
    { id: "udise", label: "UDISE+ code", state: s1.udiseCode ? "ok" : "warn", hint: s1.udiseCode || "Not given" },
    {
      id: "declaration",
      label: "Declaration accepted",
      state: steps[4].confirmed ? "ok" : "warn",
      hint: steps[4].confirmed ? "The administrator confirmed the details" : "Not confirmed",
    },
    { id: "established", label: "Year established", state: s1.establishedYear ? "ok" : "info", hint: s1.establishedYear ? String(s1.establishedYear) : "Optional, not given" },
    { id: "website", label: "School website", state: s2.website ? "ok" : "info", hint: s2.website || "Optional, not given" },
    { id: "alternate", label: "A second phone number", state: s3.alternateMobile ? "ok" : "info", hint: s3.alternateMobile ? "Given" : "Optional, not given" },
  ];
}

// ---------------------------------------------------------------- what has happened so far

export type EventTone = "neutral" | "success" | "danger" | "warning" | "info";

export interface TimelineEvent {
  id: string;
  /** null for what is still to come. */
  at: string | null;
  title: string;
  /** Who, or the note or reason that came with it. */
  detail?: string;
  /** The detail is a note or a reason someone wrote: shown as a quote, not as a plain line. */
  quote?: boolean;
  tone: EventTone;
  /** The thing the school is waiting on now. */
  upcoming?: boolean;
}

export function buildTimeline(data: SchoolReview): TimelineEvent[] {
  const { tenant, admin, review, suspension } = data;
  const events: TimelineEvent[] = [
    {
      id: "created",
      at: tenant.createdAt,
      title: tenant.source === "signup" ? "The school registered itself" : "You invited the school",
      detail: tenant.contactEmail,
      tone: "neutral",
    },
  ];

  if (admin?.emailVerifiedAt) {
    events.push({ id: "email", at: admin.emailVerifiedAt, title: "The administrator confirmed their email", detail: admin.name, tone: "success" });
  }
  if (tenant.submittedAt) {
    events.push({
      id: "submitted",
      at: tenant.submittedAt,
      title: tenant.resubmittedCount > 0 ? `Submitted again (${tenant.resubmittedCount} time${tenant.resubmittedCount === 1 ? "" : "s"} after being sent back)` : "Submitted for approval",
      tone: "info",
    });
  }
  if (review.reviewedAt) {
    const approved = Boolean(review.approvedAt);
    events.push({
      id: "reviewed",
      at: review.reviewedAt,
      title: `${approved ? "Approved" : "Sent back"}${review.reviewedByName ? ` by ${review.reviewedByName}` : ""}`,
      detail: (approved ? review.note : review.rejectionReason) || undefined,
      quote: true,
      tone: approved ? "success" : "danger",
    });
  }

  if (suspension) {
    events.push({
      id: "suspended",
      at: suspension.suspendedAt,
      title: `Suspended${suspension.suspendedByName ? ` by ${suspension.suspendedByName}` : ""}`,
      detail: suspension.reason || undefined,
      quote: true,
      tone: "danger",
    });
    if (suspension.reactivatedAt) {
      events.push({
        id: "reactivated",
        at: suspension.reactivatedAt,
        title: `Reactivated${suspension.reactivatedByName ? ` by ${suspension.reactivatedByName}` : ""}`,
        detail: suspension.note || undefined,
        quote: true,
        tone: "success",
      });
    }
  }

  events.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());

  const status = tenant.approvalStatus;
  if (status === "approved" && !tenant.isActive) events.push({ id: "next", at: null, title: "Switched off until you reactivate the school", tone: "danger", upcoming: true });
  else if (status === "pending") events.push({ id: "next", at: null, title: "Waiting for your decision", tone: "warning", upcoming: true });
  else if (status === "onboarding") events.push({ id: "next", at: null, title: "The school is filling in its details", tone: "info", upcoming: true });
  else if (status === "invited") {
    events.push({
      id: "next",
      at: null,
      title: "Waiting for the invitation to be opened",
      detail: tenant.inviteExpiresAt ? `The link works until ${formatDateTime(tenant.inviteExpiresAt)}` : undefined,
      tone: "neutral",
      upcoming: true,
    });
  } else if (status === "rejected") events.push({ id: "next", at: null, title: "Waiting for the school to fix the points and submit again", tone: "danger", upcoming: true });

  return events;
}
