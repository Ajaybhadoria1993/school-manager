import type { LeaveStatus } from "../../types";
import { LEAVE_LOOK } from "../../utils/leaves";
import { Badge } from "../ui/Badge";

/** Waiting (amber), Approved (green), Declined (red), Taken back (grey). */
export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge tone={LEAVE_LOOK[status].tone}>{LEAVE_LOOK[status].label}</Badge>;
}
