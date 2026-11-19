import { CalendarCheck2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { daySplit, type DayMark } from "../../utils/attendance";
import { shortDay } from "../../utils/calendar";
import type { StudentRangeRow } from "../../types";
import { AppModal } from "../ui/AppModal";
import { Badge } from "../ui/Badge";

const WEEKDAY_NAME = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One side of the day: its heading with the count, and the children (roll and name; the reason or the Late / Leave tag beside). */
function Side({ title, tone, marks, none }: { title: string; tone: "success" | "danger"; marks: DayMark[]; none: string }) {
  return (
    <section className="min-w-0 space-y-2">
      <h3 className={tone === "success" ? "text-sm font-bold text-success" : "text-sm font-bold text-danger"}>
        {title} ({marks.length})
      </h3>
      {marks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-foreground-muted">{none}</p>
      ) : (
        <ul aria-label={title} className={tone === "success" ? "divide-y divide-border rounded-xl border border-success-line bg-success-soft/30" : "divide-y divide-border rounded-xl border border-danger-line bg-danger-soft/30"}>
          {marks.map((m) => (
            <li key={m.student.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
              <span className="w-6 shrink-0 text-foreground-muted">{m.student.rollNumber ?? ""}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{m.student.name}</span>
              {m.status === "late" && <Badge tone="warning">Late</Badge>}
              {m.status === "leave" && <Badge tone="info">Leave</Badge>}
              {m.reason && <span className="basis-full pl-8 text-xs text-foreground-muted">{m.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A day of the class in two sides (2026-11-16): the children who were there on one, the ones who were not on the other, from the click on
 * the day's heading in the register. It is worked out from the sheet already read: it asks the server nothing.
 */
export function DaySplitDialog({ date, weekday, label, students, onClose }: { date: string; weekday: number; label: string; students: readonly StudentRangeRow[]; onClose: () => void }) {
  const split = daySplit(students, date);
  return (
    <AppModal
      title={`${WEEKDAY_NAME[weekday]} ${shortDay(date)}`}
      icon={CalendarCheck2}
      size="lg"
      onClose={onClose}
      footer={
        <HeroButton variant="primary" onPress={onClose}>
          Close
        </HeroButton>
      }
    >
      <p className="text-sm text-foreground-muted">{label}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Side title="Present" tone="success" marks={split.present} none="Nobody was present" />
        <Side title="Absent" tone="danger" marks={split.absent} none="Nobody was absent" />
      </div>
    </AppModal>
  );
}
