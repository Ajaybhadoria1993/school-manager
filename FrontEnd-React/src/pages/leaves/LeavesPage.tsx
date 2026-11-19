import { useState } from "react";
import { Check, MailCheck, X } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useCan } from "../../hooks/useCan";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { useDecideLeaveMutation, useGetLeavesQuery } from "../../redux/api/classroomApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import type { Leave } from "../../types";
import { LeaveStatusBadge } from "../../components/leaves/LeaveBits";
import { answerLine, leaveDays } from "../../utils/leaves";
import { StudentAvatar } from "../../components/students/StudentAvatar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { AppModal } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { useResultModal } from "../../components/ui/ResultModal";
import { Skeleton } from "../../components/ui/Skeleton";

const TABS = [
  { value: "pending", label: "Waiting" },
  { value: "all", label: "All" },
] as const;

/**
 * Leave requests (`/leaves`, docs/parent-teacher-flow.md phase 2): what parents sent. A class teacher sees their classes', the people who
 * run the school every one. **Approve** answers in one click; **Decline** asks for a note to the parent first (it may stay empty). Each
 * answer ends in a window that says so. Waiting first; All shows the answered ones too.
 */
export default function LeavesPage() {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const res = useGetLeavesQuery(tab);
  const [decide, { isLoading: deciding }] = useDecideLeaveMutation();
  // A year that is over is only looked at: a leave is not answered from there (the server refuses it too).
  const readOnly = useReadOnlyYear();
  const can = useCan();
  const [declining, setDeclining] = useState<Leave | null>(null);
  const [note, setNote] = useState("");
  const result = useResultModal();
  const leaves = res.data?.data.items;

  async function answer(leave: Leave, status: "approved" | "declined", withNote?: string) {
    try {
      await decide({ id: leave.id, status, ...(status === "declined" ? { note: withNote?.trim() || null } : {}) }).unwrap();
      result.done(status === "approved" ? "Leave approved" : "Leave declined", `${leave.student.name}'s parent sees the answer.`);
    } catch (err) {
      result.failed("Could not answer", getApiError(err)?.message ?? "Please try again.");
    }
    setDeclining(null);
    setNote("");
  }

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Leave requests" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />

      <div role="tablist" aria-label="Which leaves" className="inline-flex gap-1 rounded-xl bg-surface-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "inline-flex h-9 items-center rounded-lg px-5 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
              tab === t.value ? "bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.45)]" : "text-foreground-muted hover:bg-surface hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {res.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !leaves ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the leaves."}</Card>
      ) : leaves.length === 0 ? (
        <StudentsNotice icon={MailCheck} tone="success" title={tab === "pending" ? "No leave is waiting" : "No leave yet"} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {leaves.map((l) => (
            <article key={l.id} aria-label={l.student.name} className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start gap-3">
                <StudentAvatar name={l.student.name} seed={l.student.admissionNumber || l.student.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-foreground">{l.student.name}</p>
                  <p className="text-xs text-foreground-muted">
                    {l.label} · {l.appliedBy}
                  </p>
                </div>
                <LeaveStatusBadge status={l.status} />
              </div>
              <p className="text-sm font-semibold text-foreground">{leaveDays(l)}</p>
              <p className="rounded-lg bg-background px-3 py-2 text-sm text-foreground">{l.reason}</p>
              {answerLine(l) && <p className="text-xs font-semibold text-foreground-muted">{answerLine(l)}</p>}
              {l.status === "pending" && !readOnly && can("leaves.decide") && (
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
            </article>
          ))}
        </div>
      )}

      {declining && (
        <AppModal
          title={`Decline the leave of ${declining.student.name}?`}
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
          <Field id="decline-note" label="Note to the parent" optional>
            <Input id="decline-note" value={note} maxLength={300} placeholder="Exams that day..." onChange={(e) => setNote(e.target.value)} />
          </Field>
        </AppModal>
      )}
      {result.modal}
    </div>
  );
}
