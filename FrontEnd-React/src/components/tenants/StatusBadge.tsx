import { Badge } from "../ui/Badge";
import { STATUS_META } from "../../utils/status";
import type { ApprovalStatus } from "../../types";

/**
 * How a school's stage is shown everywhere (tables, cards, headers). A suspended school is still an
 * approved one, but "Approved" would be misleading next to a switch that is off: say "Suspended" instead.
 */
export function StatusBadge({ status, suspended = false, className }: { status: ApprovalStatus; suspended?: boolean; className?: string }) {
  const meta = suspended ? { label: "Suspended", tone: "danger" as const } : STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={`whitespace-nowrap ${className ?? ""}`}>
      {meta.label}
    </Badge>
  );
}
