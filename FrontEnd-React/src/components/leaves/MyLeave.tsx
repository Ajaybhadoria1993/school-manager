import { useState } from "react";
import { CalendarMinus, Undo2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useApplyMyLeaveMutation, useCancelMyLeaveMutation, useGetMyLeavesQuery } from "../../redux/api/attendanceApi";
import { addDays } from "../../utils/calendar";
import { getApiError } from "../../utils/apiErrors";
import { todayInIndia } from "../../utils/students";
import { answerLine, leaveDays } from "../../utils/leaves";
import type { StaffLeave } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useResultModal } from "../ui/ResultModal";
import { Skeleton } from "../ui/Skeleton";
import { LeaveStatusBadge } from "./LeaveBits";

/** Apply for leave: the first day (Today / Tomorrow in one click), the last day for a few days, the reason; Send. A day that is over cannot be asked for. */
function ApplyDialog({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [apply] = useApplyMyLeaveMutation();
  const today = todayInIndia();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const problems = {
    fromDate: fromDate === "" ? "Choose the first day" : fromDate < today ? "Choose today or a day to come" : undefined,
    toDate: toDate !== "" && toDate < fromDate ? "The last day cannot be before the first day" : undefined,
    reason: reason.trim() === "" ? "Write why you will not come" : undefined,
  };
  const shown = (k: keyof typeof problems) => (tried ? problems[k] : undefined);

  function send() {
    setTried(true);
    if (problems.fromDate || problems.toDate || problems.reason) return;
    void run(async () => {
      await apply({ fromDate, toDate: toDate || fromDate, reason: reason.trim() }).unwrap();
      onSent();
    });
  }

  return (
    <AppModal
      title="Apply for leave"
      icon={CalendarMinus}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton variant="primary" isPending={busy} onPress={send}>
            Send
          </HeroButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="my-leave-from" label="From" error={shown("fromDate")}>
          <DateBox
            id="my-leave-from"
            label="From"
            value={fromDate}
            onChange={setFromDate}
            min={today}
            invalid={!!shown("fromDate")}
            shortcuts={[
              { label: "Today", value: today },
              { label: "Tomorrow", value: addDays(today, 1) },
            ]}
          />
        </Field>
        <Field id="my-leave-to" label="To" optional error={shown("toDate")}>
          <DateBox id="my-leave-to" label="To" value={toDate} onChange={setToDate} min={fromDate || undefined} invalid={!!shown("toDate")} />
        </Field>
      </div>
      <Field id="my-leave-reason" label="Reason" error={shown("reason")}>
        <Input id="my-leave-reason" value={reason} maxLength={300} placeholder="Fever, a family wedding..." aria-invalid={shown("reason") ? true : undefined} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}

/**
 * My leave (`/my-leave`, 2026-11-24): a teacher or a staff member asks the school for leave from their own login: **Apply for leave** (a window), then
 * each application with its answer. A waiting one, or an approved one that has not begun, can be taken back (after asking); an approved leave is Leave
 * in the attendance (not Absent), and a teacher's periods of those days are arranged by the school ahead.
 */
export function MyLeave() {
  const res = useGetMyLeavesQuery();
  const [cancel, { isLoading: cancelling }] = useCancelMyLeaveMutation();
  const [applying, setApplying] = useState(false);
  const [taking, setTaking] = useState<StaffLeave | null>(null);
  const result = useResultModal();
  const leaves = res.currentData?.data.items;

  async function takeBack() {
    if (!taking) return;
    try {
      await cancel(taking.id).unwrap();
      result.done("Leave taken back", taking.status === "approved" ? "The school is told, and the arrangement made for you is taken off." : "The school will not see it as waiting any more.");
    } catch (err) {
      result.failed("Could not take it back", getApiError(err)?.message ?? "Please try again.");
    }
    setTaking(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setApplying(true)}>Apply for leave</Button>
      </div>

      {res.error && !leaves ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load your leave."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>
            Try again
          </Button>
        </Card>
      ) : !leaves ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : leaves.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-foreground-muted">No leave yet</Card>
      ) : (
        <ul aria-label="My leave" className="grid gap-3 md:grid-cols-2">
          {leaves.map((l) => (
            <li key={l.id} className="space-y-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">{leaveDays(l)}</p>
                <LeaveStatusBadge status={l.status} />
              </div>
              <p className="text-sm text-foreground">{l.reason}</p>
              {answerLine(l) && <p className="text-xs font-semibold text-foreground-muted">{answerLine(l)}</p>}
              {l.canCancel && (
                <Button variant="outline" size="sm" onClick={() => setTaking(l)}>
                  <Undo2 className="size-4" aria-hidden />
                  Take back
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {applying && (
        <ApplyDialog
          onClose={() => setApplying(false)}
          onSent={() => {
            setApplying(false);
            result.done("Leave sent", "The school will see it, and you will see its answer here.");
          }}
        />
      )}
      {taking && (
        <AppModal
          title="Take back this leave?"
          icon={Undo2}
          size="sm"
          busy={cancelling}
          onClose={() => setTaking(null)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setTaking(null)} isDisabled={cancelling}>
                Cancel
              </HeroButton>
              <HeroButton variant="primary" isPending={cancelling} onPress={() => void takeBack()}>
                Take back
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">
            {leaveDays(taking)}: {taking.reason}
          </p>
        </AppModal>
      )}
      {result.modal}
    </div>
  );
}
