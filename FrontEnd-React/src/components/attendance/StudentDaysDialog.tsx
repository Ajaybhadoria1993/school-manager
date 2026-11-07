import { Backpack } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { shortDay } from "../../utils/calendar";
import type { AttendanceStatus, StudentRangeRow } from "../../types";
import { AppModal } from "../ui/AppModal";
import { Badge } from "../ui/Badge";

const WORD: Record<AttendanceStatus, { label: string; tone: "success" | "danger" | "warning" | "info" }> = {
  present: { label: "Present", tone: "success" },
  absent: { label: "Absent", tone: "danger" },
  late: { label: "Late", tone: "warning" },
  leave: { label: "Leave", tone: "info" },
};

/** One child's days of the range the school is reading: the counts, and each day they were not Present with the reason that was given. */
export function StudentDaysDialog({ student, range, onClose }: { student: StudentRangeRow; range: { from: string; to: string }; onClose: () => void }) {
  const t = student.tally;
  const away = student.records.filter((r) => r.status !== "present");
  return (
    <AppModal
      title={student.name}
      icon={Backpack}
      onClose={onClose}
      footer={
        <HeroButton variant="primary" onPress={onClose}>
          Close
        </HeroButton>
      }
    >
      <p className="text-sm text-foreground-muted">
        {shortDay(range.from)} to {shortDay(range.to)}
      </p>
      <p className="text-sm font-semibold text-foreground">
        {t.present} present · {t.absent} absent · {t.late} late · {t.leave} on leave
      </p>
      {away.length === 0 ? (
        <p className="text-sm text-foreground-muted">{student.records.length === 0 ? "No attendance was taken in these days" : "Present on every day attendance was taken"}</p>
      ) : (
        <ul aria-label="Days they were not present" className="divide-y divide-border rounded-xl border border-border">
          {away.map((r) => (
            <li key={r.date} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-semibold text-foreground">{shortDay(r.date)}</span>
              <span className="flex items-center gap-2">
                <Badge tone={WORD[r.status].tone}>{WORD[r.status].label}</Badge>
                {r.reason && <span className="text-foreground">{r.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppModal>
  );
}
