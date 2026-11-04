import type { Leave, LeaveStatus } from "../types";
import { dayRange } from "./calendar";

export const LEAVE_LOOK: Record<LeaveStatus, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  pending: { label: "Waiting", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  cancelled: { label: "Taken back", tone: "neutral" },
};

/** "12 Nov to 13 Nov · 2 days". */
export const leaveDays = (l: Pick<Leave, "fromDate" | "toDate" | "days">) => `${dayRange(l.fromDate, l.toDate)} · ${l.days} day${l.days === 1 ? "" : "s"}`;

/** "Approved by Meena Singh", "Declined by Asha Verma: Exams that day". */
export function answerLine(l: Leave): string | null {
  if (!l.decidedBy || (l.status !== "approved" && l.status !== "declined")) return null;
  return `${LEAVE_LOOK[l.status].label} by ${l.decidedBy.name}${l.note ? `: ${l.note}` : ""}`;
}
