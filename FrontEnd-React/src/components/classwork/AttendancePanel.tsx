import { useEffect, useState } from "react";
import { CalendarOff, CheckCheck, RotateCcw, Save, Search } from "lucide-react";
import { useGetAttendanceQuery, useSaveAttendanceMutation } from "../../redux/api/classroomApi";
import { addDays, shortDay } from "../../utils/calendar";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import type { AttendanceStatus } from "../../types";
import { AttendanceDonut } from "../attendance/AttendanceDonut";
import { MARKS, SUMMARY_LINES as SUMMARY, isSunday } from "../attendance/marks";
import { StudentAvatar } from "../students/StudentAvatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useResultModal } from "../ui/ResultModal";
import { Skeleton } from "../ui/Skeleton";

/**
 * A class's (or section's) attendance for a day (docs/parent-teacher-flow.md phase 3), in the look of the reference pictures (2026-11-22,
 * rebuilt as one card 2026-11-23): the day (Today / Yesterday in one click, unless the page gives it: `date`), a card with the class, its
 * number of children and its class teacher, a search, and (the class teacher) **Mark all present** and **Reset**; every child with the roll
 * number, a photo, name and admission number, four short buttons P / A / L / Lv (Present to start with, an approved leave already Leave) and
 * a note; at the side **Today's summary**: a ring, the four counts and (the class teacher) the one orange **Save attendance**, after which a
 * window says how many were present, absent, late and on leave. The note (optional, 2026-11-06: "Fever") is seen by the school and the parent.
 * A holiday says so and has nothing to save. Everything here is of the whole class: the search only decides which children are on screen.
 *
 * The school only LOOKS (`canMark` false): the marks are fixed, and a day nobody took is NOT shown as everyone Present (the server's
 * Present is only where a day starts): no mark is lit, the ring and the counts say "Not taken" (a Sunday says there is no school). A child
 * on leave has Leave lit and the words "On leave" in the note; an absence with no reason says "Not informed".
 *
 * `date` makes the page the one that picks the day (Attendance > Student has its own Date box), so the panel has no heading and no Day box;
 * `title` is what the class is called there ("Class 5A": a class with one section is just "Class 6"). (Attendance > Student, the school's page,
 * shows every class through `StudentDayList` since 2026-11-22; this panel is the class teacher's, in their class page.)
 */
export function AttendancePanel({ classId, sectionId, canMark = false, date: given, title }: { classId: string; sectionId: string | null; canMark?: boolean; date?: string; title?: string }) {
  const today = todayInIndia();
  // Only the class teacher takes the day (2026-11-17); the school, and anyone else who may see it, gets the marks without the buttons.
  const [own, setOwn] = useState(today);
  const date = given ?? own;
  const res = useGetAttendanceQuery({ classId, sectionId, date: date || today });
  const [save, { isLoading: saving }] = useSaveAttendanceMutation();
  const sheet = res.currentData?.data;
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [find, setFind] = useState("");
  const result = useResultModal();
  useEffect(() => {
    if (sheet) {
      setMarks(Object.fromEntries(sheet.students.map((s) => [s.id, s.status])));
      setReasons(Object.fromEntries(sheet.students.map((s) => [s.id, s.reason ?? ""])));
    }
  }, [sheet]);

  // The class teacher has the marks to change (a day not saved starts as Present); the school sees only a day that was taken.
  const taken = canMark || !!sheet?.saved;
  const statusOf = (studentId: string, saved: AttendanceStatus) => marks[studentId] ?? saved;

  /** A child's line of the save: a reason goes only with an absence or a late coming, and only when one was given. */
  const markOf = (studentId: string, status: AttendanceStatus) => {
    const reason = (reasons[studentId] ?? "").trim();
    return { studentId, status, ...((status === "absent" || status === "late") && reason ? { reason } : {}) };
  };

  async function send() {
    if (!sheet) return;
    try {
      const saved = (await save({ classId, sectionId, date: sheet.date, marks: sheet.students.map((s) => markOf(s.id, statusOf(s.id, s.status))) }).unwrap()).data;
      const c = saved.counts;
      result.done("Attendance saved", `${saved.label}, ${shortDay(saved.date)}: ${c.present} present, ${c.absent} absent, ${c.late} late, ${c.leave} on leave.`);
    } catch (err) {
      result.failed("Attendance not saved", getApiError(err)?.message ?? "Please try again.");
    }
  }

  /** Everyone Present, except a child on an approved leave (that is not an absence to undo); the notes go with the absences. */
  function markAllPresent() {
    if (!sheet) return;
    setMarks(Object.fromEntries(sheet.students.map((s) => [s.id, statusOf(s.id, s.status) === "leave" ? "leave" : "present"])));
    setReasons(Object.fromEntries(sheet.students.map((s) => [s.id, ""])));
  }

  /** Back to what the day was when it was opened: the saved marks and notes, or Present with an approved leave as Leave. */
  function reset() {
    if (!sheet) return;
    setMarks(Object.fromEntries(sheet.students.map((s) => [s.id, s.status])));
    setReasons(Object.fromEntries(sheet.students.map((s) => [s.id, s.reason ?? ""])));
  }

  const counts: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, leave: 0 };
  if (taken) for (const s of sheet?.students ?? []) counts[statusOf(s.id, s.status)] += 1;
  const word = find.trim().toLowerCase();
  const everyone = sheet?.students ?? [];
  const shown = everyone.filter((s) => !word || s.name.toLowerCase().includes(word) || s.admissionNumber.toLowerCase().includes(word) || String(s.rollNumber ?? "").includes(word));
  // How many children the class has: not what a search left.
  const total = sheet?.total ?? everyone.length;
  const Title = given === undefined ? "h3" : "h2";

  return (
    <section aria-label="Attendance of the day" className="space-y-4">
      {given === undefined && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="pt-1 text-section-heading">{canMark ? "Mark attendance" : "Attendance of the day"}</h2>
          <div className="w-full sm:w-72">
            <Field id="attendance-day" label="Day">
              <DateBox
                id="attendance-day"
                label="Day"
                value={own}
                onChange={setOwn}
                max={today}
                shortcuts={[
                  { label: "Today", value: today },
                  { label: "Yesterday", value: addDays(today, -1) },
                ]}
              />
            </Field>
          </div>
        </div>
      )}

      {res.isFetching && !sheet ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !sheet ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the attendance."}</Card>
      ) : sheet.holiday ? (
        <Card className="flex items-center gap-3 border-danger-line bg-danger-soft/50 px-5 py-4 text-sm font-semibold text-danger">
          <CalendarOff className="size-5" aria-hidden />
          Holiday: {sheet.holiday.title}
        </Card>
      ) : !taken && isSunday(sheet.date) ? (
        <Card className="flex items-center gap-3 px-5 py-4 text-sm font-semibold text-foreground-muted">
          <CalendarOff className="size-5" aria-hidden />
          Sunday: no school
        </Card>
      ) : total === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-foreground-muted">No child is in this class yet</Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
              <div className="min-w-0">
                <Title className="truncate text-base font-bold text-foreground">
                  {title ?? sheet.label} · {total} {total === 1 ? "student" : "students"}
                </Title>
                {sheet.classTeacher && <p className="mt-0.5 text-xs text-foreground-muted">Class teacher: {sheet.classTeacher.name}</p>}
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="w-full min-w-[12rem] sm:w-56">
                  <Input aria-label="Search the children" icon={Search} placeholder="Search student" maxLength={60} value={find} onChange={(e) => setFind(e.target.value)} />
                </div>
                {canMark && (
                  <>
                    <Button variant="outline" onClick={markAllPresent}>
                      <CheckCheck className="size-4" aria-hidden />
                      Mark all present
                    </Button>
                    <Button variant="outline" onClick={reset}>
                      <RotateCcw className="size-4" aria-hidden />
                      Reset
                    </Button>
                  </>
                )}
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-foreground-muted">Nobody matches</p>
            ) : (
              <ul aria-label="Attendance" className="divide-y divide-border">
                {shown.map((s) => {
                  // What is lit: the class teacher's marks; for the school only a day that was taken (null: nothing).
                  const status = taken ? statusOf(s.id, s.status) : null;
                  // A child with no roll number is shown under the place in the CLASS (the server says it): a search's short list never renumbers them.
                  const roll = s.rollNumber ?? s.position ?? everyone.indexOf(s) + 1;
                  // The note, in a column of its own: the class teacher writes it for an absence or a late coming; the school reads it.
                  const note = canMark ? (
                    status === "absent" || status === "late" ? (
                      <input
                        aria-label={`Reason for ${s.name}`}
                        placeholder="Reason (optional)"
                        maxLength={200}
                        value={reasons[s.id] ?? ""}
                        onChange={(e) => setReasons((all) => ({ ...all, [s.id]: e.target.value }))}
                        className="h-9 w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground placeholder:text-foreground-muted/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
                      />
                    ) : null
                  ) : status === "leave" ? (
                    <span className="inline-flex items-center gap-2 text-sm text-foreground">
                      <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-bold text-info">On leave</span>
                      {s.reason && <span className="min-w-0 truncate">{s.reason}</span>}
                    </span>
                  ) : status === "absent" || status === "late" ? (
                    <span className={cn("min-w-0 truncate text-sm", s.reason ? "text-foreground" : "text-foreground-muted")}>{s.reason || "Not informed"}</span>
                  ) : null;
                  return (
                    <li key={s.id} aria-label={s.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
                      <span className="w-7 shrink-0 text-sm font-semibold text-foreground-muted">{String(roll).padStart(2, "0")}</span>
                      <StudentAvatar name={s.name} seed={s.admissionNumber} size="sm" />
                      <span className="min-w-0 flex-1 basis-36 sm:w-52 sm:flex-none">
                        <span className="block truncate font-semibold text-foreground">{s.name}</span>
                        <span className="text-xs text-foreground-muted">{s.admissionNumber}</span>
                      </span>
                      <span role="radiogroup" aria-label={`Mark of ${s.name}`} className="flex gap-1.5">
                        {MARKS.map((m) => (
                          <label
                            key={m.value}
                            title={m.label}
                            className={cn(
                              "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-bold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20",
                              canMark ? "cursor-pointer" : "cursor-default",
                              status === m.value ? m.on : cn("border-border bg-surface text-foreground-muted", canMark && "hover:bg-surface-muted hover:text-foreground")
                            )}
                          >
                            <input type="radio" className="sr-only" name={`mark-${s.id}`} disabled={!canMark} checked={status === m.value} onChange={() => setMarks((all) => ({ ...all, [s.id]: m.value }))} />
                            <span aria-hidden>{m.letter}</span>
                            <span className="sr-only">{m.label}</span>
                          </label>
                        ))}
                      </span>
                      {/* On a phone a line with no note has no empty space for one; on a wide screen the column stays, so the notes line up. */}
                      <span className={cn("min-w-0 basis-full items-center sm:flex sm:min-h-9 sm:flex-1 sm:basis-40", note ? "flex" : "hidden")}>{note}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {word && shown.length > 0 && (
              <p className="border-t border-border bg-surface-muted/50 px-4 py-2.5 text-xs text-foreground-muted">
                Showing {shown.length} of {total}
              </p>
            )}
          </div>

          <section aria-label="Summary of the day" className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-card lg:sticky lg:top-20">
            <h3 className="text-base font-semibold text-foreground">{sheet.date === today ? "Today's summary" : `Summary of ${shortDay(sheet.date)}`}</h3>
            <div className="mt-4">
              <AttendanceDonut counts={counts} taken={taken} />
            </div>
            <dl className="mt-5 space-y-2.5">
              {SUMMARY.map((line) => (
                <div key={line.value} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="flex items-center gap-2 text-foreground-muted">
                    <span aria-hidden className={cn("size-2.5 rounded-full", MARKS.find((m) => m.value === line.value)?.dot)} />
                    {line.label}
                  </dt>
                  <dd className="font-bold text-foreground">{taken ? counts[line.value] : "–"}</dd>
                </div>
              ))}
            </dl>
            {sheet.saved && sheet.markedBy && <p className="mt-4 text-xs text-foreground-muted">Saved by {sheet.markedBy.name}</p>}
            {canMark && (
              <Button variant="accent" size="lg" className="mt-5 w-full" loading={saving} onClick={() => void send()}>
                {!saving && <Save className="size-4" aria-hidden />}
                Save attendance
              </Button>
            )}
          </section>
        </div>
      )}
      {result.modal}
    </section>
  );
}
