import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeftRight, Check, MailCheck, X } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useCan } from "../../hooks/useCan";
import { useDecideStaffLeaveMutation, useGetStaffLeavesQuery } from "../../redux/api/attendanceApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import { answerLine, leaveDays } from "../../utils/leaves";
import type { StaffLeave, StaffLeaveWho } from "../../types";
import { StudentAvatar } from "../students/StudentAvatar";
import { StudentsNotice } from "../students/StudentsNotice";
import { AppModal } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useResultModal } from "../ui/ResultModal";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { LeaveStatusBadge } from "./LeaveBits";

const STATUS_PILLS = [
  { value: "pending", label: "Waiting" },
  { value: "all", label: "All" },
] as const;

const WHO: { value: StaffLeaveWho; label: string }[] = [
  { value: "all", label: "Teachers & staff" },
  { value: "teacher", label: "Teachers" },
  { value: "staff", label: "Staff" },
];

/** What the tab shows when nothing is there, for each filter. */
const emptyTitle = (status: "pending" | "all", who: StaffLeaveWho) =>
  status === "pending" ? "No leave is waiting" : who === "all" ? "No leave yet" : who === "teacher" ? "No teacher has applied for leave yet" : "No staff member has applied for leave yet";

/**
 * Leave & arrangements > Leave requests (2026-11-24, user: "teacher ya staff login karke leave dalega, yahan admin side par reason ke saath application
 * jaisi aa jaye, aur status"): what the teachers and the staff sent from their own login. **Approve** answers in one click; **Decline** asks for a
 * note first (it may stay empty). Waiting first (the oldest day first, so the leave nearest to today is answered first); All shows the answered too.
 * An approved leave of a teacher that has not ended has **Arrange periods**: it opens the Arrangements tab on the first day still to come.
 */
export function StaffLeaveRequests() {
  const [status, setStatus] = useState<"pending" | "all">("pending");
  const [who, setWho] = useState<StaffLeaveWho>("all");
  // Seeing the leave is staffleaves.view; Approve and Decline are staffleaves.decide (2026-11-26).
  const can = useCan();
  const mayDecide = can("staffleaves.decide");
  // Arrange periods opens the Arrangements tab, which is timetable.edit.
  const mayArrange = can("timetable.edit");
  const res = useGetStaffLeavesQuery({ status, who });
  const [decide, { isLoading: deciding }] = useDecideStaffLeaveMutation();
  const [declining, setDeclining] = useState<StaffLeave | null>(null);
  const [note, setNote] = useState("");
  const result = useResultModal();
  const leaves = res.currentData?.data.items;
  const today = todayInIndia();

  async function answer(leave: StaffLeave, next: "approved" | "declined", withNote?: string) {
    try {
      await decide({ id: leave.id, status: next, ...(next === "declined" ? { note: withNote?.trim() || null } : {}) }).unwrap();
      result.done(next === "approved" ? "Leave approved" : "Leave declined", `${leave.name} sees the answer${next === "approved" ? `, and the days are Leave in the attendance.` : "."}`);
    } catch (err) {
      result.failed("Could not answer", getApiError(err)?.message ?? "Please try again.");
    }
    setDeclining(null);
    setNote("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Which leaves" className="inline-flex gap-1 rounded-xl bg-surface-muted p-1">
          {STATUS_PILLS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={status === t.value}
              onClick={() => setStatus(t.value)}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center rounded-lg px-5 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                status === t.value ? "bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.45)]" : "text-foreground-muted hover:bg-surface hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Field id="leave-who" label="Who" quiet hideLabel className="w-full sm:w-56">
          <Select id="leave-who" aria-label="Who" value={who} onChange={(v) => setWho(v as StaffLeaveWho)} options={WHO} />
        </Field>
      </div>

      {res.error && !leaves ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the leaves."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>
            Try again
          </Button>
        </Card>
      ) : !leaves ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : leaves.length === 0 ? (
        <StudentsNotice icon={MailCheck} tone="success" title={emptyTitle(status, who)} />
      ) : (
        <ul aria-label="Leave applications" className="grid gap-4 lg:grid-cols-2">
          {leaves.map((l) => (
            <li key={l.id}>
              <article aria-label={l.name} className="h-full space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <StudentAvatar name={l.name} seed={l.personId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground">{l.name}</p>
                    <p className="text-xs text-foreground-muted">{l.roleLabel}</p>
                  </div>
                  <LeaveStatusBadge status={l.status} />
                </div>
                <p className="text-sm font-semibold text-foreground">{leaveDays(l)}</p>
                <p className="rounded-lg bg-background px-3 py-2 text-sm text-foreground">{l.reason}</p>
                {answerLine(l) && <p className="text-xs font-semibold text-foreground-muted">{answerLine(l)}</p>}
                {l.status === "pending" && mayDecide && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={deciding} onClick={() => void answer(l, "approved")}>
                      <Check className="size-4" aria-hidden />
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={deciding} onClick={() => setDeclining(l)}>
                      <X className="size-4" aria-hidden />
                      Decline
                    </Button>
                  </div>
                )}
                {mayArrange && l.status === "approved" && l.kind === "teacher" && l.toDate >= today && (
                  <Link
                    to={`/school/arrangements?date=${l.fromDate > today ? l.fromDate : today}`}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                  >
                    <ArrowLeftRight className="size-4" aria-hidden />
                    Arrange periods
                  </Link>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}

      {declining && (
        <AppModal
          title={`Decline the leave of ${declining.name}?`}
          icon={X}
          tone="danger"
          busy={deciding}
          onClose={() => setDeclining(null)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setDeclining(null)} isDisabled={deciding}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={deciding} onPress={() => void answer(declining, "declined", note)}>
                Decline
              </HeroButton>
            </>
          }
        >
          <Field id="decline-leave-note" label={`Note to ${declining.name}`} optional>
            <Input id="decline-leave-note" value={note} maxLength={300} placeholder="Exams that week..." onChange={(e) => setNote(e.target.value)} />
          </Field>
        </AppModal>
      )}
      {result.modal}
    </div>
  );
}
