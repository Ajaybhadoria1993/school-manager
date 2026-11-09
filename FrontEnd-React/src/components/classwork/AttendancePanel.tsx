import { useEffect, useState } from "react";
import { CalendarOff, Save } from "lucide-react";
import { useGetAttendanceQuery, useSaveAttendanceMutation } from "../../redux/api/classroomApi";
import { addDays, shortDay } from "../../utils/calendar";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import type { AttendanceStatus } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { useResultModal } from "../ui/ResultModal";
import { Skeleton } from "../ui/Skeleton";

const MARKS: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: "present", label: "Present", on: "border-success-line bg-success-soft text-success" },
  { value: "absent", label: "Absent", on: "border-danger-line bg-danger-soft text-danger" },
  { value: "late", label: "Late", on: "border-warning-line bg-warning-soft text-warning" },
  { value: "leave", label: "Leave", on: "border-info-line bg-info-soft text-info" },
];

/**
 * A class's (or section's) attendance for a day (docs/parent-teacher-flow.md phase 3): the day (Today / Yesterday in one click), every
 * child with Present / Absent / Late / Leave (Present to start with, an approved leave already Leave), one **Save attendance**; a window
 * then says how many were present, absent, late and on leave. A child marked Absent or Late can be given a **reason** (optional, 2026-11-06:
 * "Fever"): the school and the parent see it. A holiday says so and has nothing to save.
 */
export function AttendancePanel({ classId, sectionId }: { classId: string; sectionId: string | null }) {
  const today = todayInIndia();
  const [date, setDate] = useState(today);
  const res = useGetAttendanceQuery({ classId, sectionId, date: date || today });
  const [save, { isLoading: saving }] = useSaveAttendanceMutation();
  const sheet = res.currentData?.data;
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const result = useResultModal();
  useEffect(() => {
    if (sheet) {
      setMarks(Object.fromEntries(sheet.students.map((s) => [s.id, s.status])));
      setReasons(Object.fromEntries(sheet.students.map((s) => [s.id, s.reason ?? ""])));
    }
  }, [sheet]);

  /** A child's line of the save: a reason goes only with an absence or a late coming, and only when one was given. */
  const markOf = (studentId: string, status: AttendanceStatus) => {
    const reason = (reasons[studentId] ?? "").trim();
    return { studentId, status, ...((status === "absent" || status === "late") && reason ? { reason } : {}) };
  };

  async function send() {
    if (!sheet) return;
    try {
      const saved = (await save({ classId, sectionId, date: sheet.date, marks: sheet.students.map((s) => markOf(s.id, marks[s.id] ?? s.status)) }).unwrap()).data;
      const c = saved.counts;
      result.done("Attendance saved", `${saved.label}, ${shortDay(saved.date)}: ${c.present} present, ${c.absent} absent, ${c.late} late, ${c.leave} on leave.`);
    } catch (err) {
      result.failed("Attendance not saved", getApiError(err)?.message ?? "Please try again.");
    }
  }

  const count = (status: AttendanceStatus) => Object.values(marks).filter((m) => m === status).length;

  return (
    <section aria-label="Attendance of the day" className="space-y-4">
      <div className="max-w-sm">
        <Field id="attendance-day" label="Day">
          <DateBox
            id="attendance-day"
            label="Day"
            value={date}
            onChange={setDate}
            max={today}
            shortcuts={[
              { label: "Today", value: today },
              { label: "Yesterday", value: addDays(today, -1) },
            ]}
          />
        </Field>
      </div>

      {res.isFetching && !sheet ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !sheet ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the attendance."}</Card>
      ) : sheet.holiday ? (
        <Card className="flex items-center gap-3 border-danger-line bg-danger-soft/50 px-5 py-4 text-sm font-semibold text-danger">
          <CalendarOff className="size-5" aria-hidden />
          Holiday: {sheet.holiday.title}
        </Card>
      ) : sheet.students.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-foreground-muted">No child is in this class yet</Card>
      ) : (
        <>
          <p className="text-sm font-semibold text-foreground-muted">
            {count("present")} present · {count("absent")} absent · {count("late")} late · {count("leave")} on leave
            {sheet.saved && sheet.markedBy && <span className="font-normal"> · saved by {sheet.markedBy.name}</span>}
          </p>
          <ul aria-label="Attendance" className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
            {sheet.students.map((s) => (
              <li key={s.id} aria-label={s.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{s.name}</span>
                  <span className="text-xs text-foreground-muted">{s.rollNumber != null ? `Roll ${s.rollNumber}` : s.admissionNumber}</span>
                </span>
                {(marks[s.id] ?? s.status) === "absent" || (marks[s.id] ?? s.status) === "late" ? (
                  <input
                    aria-label={`Reason for ${s.name}`}
                    placeholder="Reason (optional)"
                    maxLength={200}
                    value={reasons[s.id] ?? ""}
                    onChange={(e) => setReasons((all) => ({ ...all, [s.id]: e.target.value }))}
                    className="h-8 min-w-0 flex-1 basis-40 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground placeholder:text-foreground-muted/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 sm:max-w-xs"
                  />
                ) : null}
                <span role="radiogroup" aria-label={`Mark of ${s.name}`} className="flex gap-1">
                  {MARKS.map((m) => (
                    <label
                      key={m.value}
                      className={cn(
                        "inline-flex h-8 cursor-pointer items-center rounded-lg border px-2.5 text-xs font-bold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20",
                        (marks[s.id] ?? s.status) === m.value ? m.on : "border-border bg-surface text-foreground-muted hover:text-foreground"
                      )}
                    >
                      <input type="radio" className="sr-only" name={`mark-${s.id}`} checked={(marks[s.id] ?? s.status) === m.value} onChange={() => setMarks((all) => ({ ...all, [s.id]: m.value }))} />
                      {m.label}
                    </label>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <Button size="lg" loading={saving} onClick={() => void send()}>
            {!saving && <Save className="size-4" aria-hidden />}
            Save attendance
          </Button>
        </>
      )}
      {result.modal}
    </section>
  );
}
