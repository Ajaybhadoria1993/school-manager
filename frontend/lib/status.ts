import type { ApprovalStatus } from "@/types";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

/** One place for how each stage of a school's life is named and coloured. */
export const STATUS_META: Record<ApprovalStatus, { label: string; tone: Tone; hint: string }> = {
  invited: { label: "Invited", tone: "neutral", hint: "Waiting for the administrator to open the invitation" },
  onboarding: { label: "Setting up", tone: "info", hint: "The administrator is filling in the school details" },
  pending: { label: "Awaiting approval", tone: "warning", hint: "Submitted, waiting for your decision" },
  approved: { label: "Approved", tone: "success", hint: "Live on the platform" },
  rejected: { label: "Needs changes", tone: "danger", hint: "Sent back to the school with a reason" },
};

export const STATUS_ORDER: ApprovalStatus[] = ["invited", "onboarding", "pending", "approved", "rejected"];

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value)
  );
}

/** "3 hours ago" style text; falls back to a date for anything older than a week. */
export function timeAgo(value: string | Date, now = Date.now()): string {
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 8) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
