import { useState } from "react";
import { Pencil, UserRoundCheck } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { useSetTeacherDayMutation } from "../../redux/api/attendanceApi";
import { getApiError } from "../../utils/apiErrors";
import { lateText, teacherLook } from "../../utils/attendance";
import { shortDay } from "../../utils/calendar";
import { clock12 } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import type { LogLine, TeacherRecord, TeacherSheetRow } from "../../types";
import { AppModal } from "../ui/AppModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { useResultModal } from "../ui/ResultModal";

const TONE = { present: "success", late: "warning", absent: "danger", leave: "info", off: "neutral", holiday: "info", no_login: "neutral", pending: "neutral", upcoming: "neutral", before: "neutral" } as const;
type Mark = "present" | "absent" | "leave";
const MARKS: { value: Mark; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
];
const markOf = (r: TeacherRecord): Mark => (r.status === "absent" ? "absent" : r.status === "leave" ? "leave" : "present");

/** One line of a day's log in words: the teacher's own mark, or the school's. */
function logText(l: LogLine): string {
  if (l.action === "checked_in") return `Marked present at ${clock12(l.time)} by ${l.by.name}`;
  return `${clock12(l.time)} · Marked by ${l.by.name} (school)${l.note ? `: ${l.note}` : ""}`;
}

/** The school changes one day of a teacher: Present (and the time they came), Absent or Leave, and why. */
function ChangeDayForm({ teacher, record, onDone, onCancel }: { teacher: TeacherSheetRow; record: TeacherRecord; onDone: (title: string, message: string) => void; onCancel: () => void }) {
  const [save, { isLoading }] = useSetTeacherDayMutation();
  const [status, setStatus] = useState<Mark>(markOf(record));
  const [time, setTime] = useState(record.checkedInTime ?? "");
  const [note, setNote] = useState(record.note ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const day = shortDay(record.date);

  async function send() {
    setProblem(null);
    try {
      await save({ teacherId: teacher.id, date: record.date, status, ...(status === "present" && time ? { time } : {}), ...(note.trim() ? { note: note.trim() } : {}) }).unwrap();
      const word = MARKS.find((m) => m.value === status)!.label;
      onDone("Attendance saved", `${teacher.name} is marked ${word} on ${day}${status === "present" && time ? ` at ${clock12(time)}` : ""}.`);
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Please try again.");
    }
  }

  return (
    <div role="group" aria-label={`Change ${day}`} className="mt-2 space-y-3 rounded-xl border border-border bg-surface-muted/50 p-3">
      <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-2">
        {MARKS.map((m) => (
          <label key={m.value} className="relative block">
            <input type="radio" className="peer sr-only" name={`status-${record.date}`} checked={status === m.value} onChange={() => setStatus(m.value)} />
            <span
              className={cn(
                "inline-flex h-9 cursor-pointer select-none items-center rounded-lg border px-3 text-sm font-semibold transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20",
                status === m.value ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/40" : "border-border bg-surface text-foreground hover:border-primary/50"
              )}
            >
              {m.label}
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
        {status === "present" && (
          <input type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
        )}
        <input
          aria-label="Note"
          placeholder="Note (optional)"
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={cn("h-9 min-w-0 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground placeholder:text-foreground-muted/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15", status !== "present" && "sm:col-span-2")}
        />
      </div>
      {problem && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" loading={isLoading} onClick={() => void send()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * One teacher's days of the range the school is reading (2026-11-06): each day that counts with what it was, the time they marked
 * themselves present, how late that was, and the log of the day (when it was marked and by whom): the time matters, not only
 * Present or Absent. Days off, holidays and days before they joined are left out. The school can **change** a day (Present with the time,
 * Absent, Leave, and why: a teacher forgot, the phone was dead, they have no login, they are on leave); the teacher's own view of their
 * month (`canChange` off) is only to read.
 */
export function TeacherDaysDialog({ teacher, title, canChange = false, onClose }: { teacher: TeacherSheetRow; title?: string; canChange?: boolean; onClose: () => void }) {
  const t = teacher.tally;
  const days = teacher.records.filter((r) => ["present", "late", "absent", "leave", "no_login", "pending"].includes(r.status));
  const [changing, setChanging] = useState<string | null>(null);
  const result = useResultModal();
  // A year that is over is only looked at: no day of a teacher is changed from there.
  const readOnly = useReadOnlyYear();
  const mayChange = canChange && !readOnly;
  return (
    <AppModal
      title={title ?? teacher.name}
      icon={UserRoundCheck}
      onClose={onClose}
      footer={
        <HeroButton variant="primary" onPress={onClose}>
          Close
        </HeroButton>
      }
    >
      <p className="text-sm font-semibold text-foreground">
        {t.present} present · {t.late} late · {t.absent} absent{t.leave > 0 ? ` · ${t.leave} on leave` : ""}
      </p>
      {days.length === 0 ? (
        <p className="text-sm text-foreground-muted">No working day in these days</p>
      ) : (
        <ul aria-label="Days" className="divide-y divide-border rounded-xl border border-border">
          {days.map((r) => (
            <li key={r.date} className="space-y-1 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{shortDay(r.date)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[r.status]}>{teacherLook(r.status).label}</Badge>
                  {r.checkedInTime && <span className="font-semibold text-foreground">{clock12(r.checkedInTime)}</span>}
                  {r.status === "late" && <span className="text-warning">{lateText(r.lateByMinutes)}</span>}
                  {mayChange && (
                    <Button size="sm" variant="ghost" aria-label={`Change ${shortDay(r.date)}`} onClick={() => setChanging(changing === r.date ? null : r.date)}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  )}
                </span>
              </div>
              {r.log.map((l) => (
                <p key={`${l.at}-${l.action}`} className="text-xs text-foreground-muted">
                  {logText(l)}
                </p>
              ))}
              {mayChange && changing === r.date && (
                <ChangeDayForm
                  teacher={teacher}
                  record={r}
                  onCancel={() => setChanging(null)}
                  onDone={(done, message) => {
                    setChanging(null);
                    result.done(done, message);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {result.modal}
    </AppModal>
  );
}
