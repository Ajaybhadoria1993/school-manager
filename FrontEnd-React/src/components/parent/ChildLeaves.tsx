import { useState } from "react";
import { CalendarMinus, Undo2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useApplyLeaveMutation, useCancelLeaveMutation, useGetChildLeavesQuery } from "../../redux/api/parentApi";
import { addDays } from "../../utils/calendar";
import { getApiError } from "../../utils/apiErrors";
import { todayInIndia } from "../../utils/students";
import type { Leave } from "../../types";
import { useSave } from "../classes/useSave";
import { LeaveStatusBadge } from "../leaves/LeaveBits";
import { answerLine, leaveDays } from "../../utils/leaves";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useResultModal } from "../ui/ResultModal";

/** Apply for leave: the first day (Today / Tomorrow in one click), the last day for a few days, the reason; Send. */
function LeaveDialog({ childId, childName, onClose, onSent }: { childId: string; childName: string; onClose: () => void; onSent: () => void }) {
  const [apply] = useApplyLeaveMutation();
  const today = todayInIndia();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const problems = {
    fromDate: fromDate === "" ? "Choose the first day" : undefined,
    toDate: toDate !== "" && toDate < fromDate ? "The last day cannot be before the first day" : undefined,
    reason: reason.trim() === "" ? "Write why the child will not come" : undefined,
  };
  const shown = (k: keyof typeof problems) => (tried ? problems[k] : undefined);

  function send() {
    setTried(true);
    if (problems.fromDate || problems.toDate || problems.reason) return;
    void run(async () => {
      await apply({ id: childId, fromDate, toDate: toDate || fromDate, reason: reason.trim() }).unwrap();
      onSent();
    });
  }

  return (
    <AppModal
      title={`Apply for leave for ${childName}`}
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
        <Field id="leave-from" label="From" error={shown("fromDate")}>
          <DateBox
            id="leave-from"
            label="From"
            value={fromDate}
            onChange={setFromDate}
            invalid={!!shown("fromDate")}
            shortcuts={[
              { label: "Today", value: today },
              { label: "Tomorrow", value: addDays(today, 1) },
            ]}
          />
        </Field>
        <Field id="leave-to" label="To" optional error={shown("toDate")}>
          <DateBox id="leave-to" label="To" value={toDate} onChange={setToDate} min={fromDate || undefined} invalid={!!shown("toDate")} />
        </Field>
      </div>
      <Field id="leave-reason" label="Reason" error={shown("reason")}>
        <Input id="leave-reason" value={reason} maxLength={300} placeholder="Fever, a family wedding..." aria-invalid={shown("reason") ? true : undefined} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}

/**
 * The child's leave, for their parent (docs/parent-teacher-flow.md phase 2): **Apply for leave** (a window; sent, a window says the class
 * teacher and the school will see it), then each leave with its answer; one still waiting can be taken back (after asking).
 */
export function ChildLeaves({ childId, childName }: { childId: string; childName: string }) {
  const res = useGetChildLeavesQuery(childId);
  const [cancel, { isLoading: cancelling }] = useCancelLeaveMutation();
  const [applying, setApplying] = useState(false);
  const [taking, setTaking] = useState<Leave | null>(null);
  const result = useResultModal();
  const leaves = res.data?.data.items ?? [];

  async function takeBack() {
    if (!taking) return;
    try {
      await cancel({ id: childId, leaveId: taking.id }).unwrap();
      result.done("Leave taken back", "The class teacher will not see it as waiting any more.");
    } catch (err) {
      result.failed("Could not take it back", getApiError(err)?.message ?? "Please try again.");
    }
    setTaking(null);
  }

  return (
    <section aria-label="Leave" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section-heading flex items-center gap-2">
          <CalendarMinus className="size-5 text-primary" aria-hidden />
          Leave
        </h2>
        <Button onClick={() => setApplying(true)}>Apply for leave</Button>
      </div>
      {leaves.length === 0 ? (
        <Card className="px-5 py-6 text-center text-sm text-foreground-muted">No leave yet</Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {leaves.map((l) => (
            <li key={l.id} className="space-y-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">{leaveDays(l)}</p>
                <LeaveStatusBadge status={l.status} />
              </div>
              <p className="text-sm text-foreground">{l.reason}</p>
              {answerLine(l) && <p className="text-xs font-semibold text-foreground-muted">{answerLine(l)}</p>}
              {l.status === "pending" && (
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
        <LeaveDialog
          childId={childId}
          childName={childName}
          onClose={() => setApplying(false)}
          onSent={() => {
            setApplying(false);
            result.done("Leave sent", `${childName}'s class teacher and the school will see it, and you will see their answer here.`);
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
          <p className="text-sm text-foreground">{leaveDays(taking)}: {taking.reason}</p>
        </AppModal>
      )}
      {result.modal}
    </section>
  );
}
