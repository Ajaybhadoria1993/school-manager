import { useState } from "react";
import { CheckCheck, Undo2 } from "lucide-react";
import { Button } from "@heroui/react";
import { useApprovePromotionMutation, useRejectPromotionMutation } from "../../../redux/api/studentsApi";
import type { Promotion } from "../../../types";
import { useSave } from "../../classes/useSave";
import { AppModal, ModalError } from "../../ui/AppModal";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { useToast } from "../../ui/toast-context";

/**
 * The school admin approves the list. Approval gives every student who goes on a place in the next year (the running year is not
 * touched). A section that would have more students than seats is said by the server and can be gone over only with "Approve anyway".
 */
export function ApproveDialog({ promotion, onClose }: { promotion: Promotion; onClose: () => void }) {
  const [approve] = useApprovePromotionMutation();
  const { push } = useToast();
  const { busy, error, run } = useSave(onClose);
  const send = (allowOverCapacity: boolean) =>
    run(async () => {
      const res = await approve({ id: promotion.id, allowOverCapacity }).unwrap();
      push("success", res.message ?? "Approved");
    });

  return (
    <AppModal
      title="Approve the promotion?"
      icon={CheckCheck}
      tone="primary"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          {error?.code === "SECTION_FULL" && (
            <Button variant="secondary" isPending={busy} onPress={() => void send(true)}>
              Approve anyway
            </Button>
          )}
          <Button variant="primary" isPending={busy} onPress={() => void send(false)}>
            Approve
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-foreground-muted">
        <p>
          {promotion.summary.promote + promotion.summary.retain} students get a place in {promotion.toYear.name}, in the class and section on the list. {promotion.summary.leave > 0 ? `${promotion.summary.leave} students who leave become inactive when ${promotion.toYear.name} is switched on. ` : ""}
          {promotion.fromYear.name} is not changed.
        </p>
        <p>You can still cancel the list until {promotion.toYear.name} is switched on.</p>
      </div>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}

/** The school admin sends the list back to whoever made it, with a note. It becomes a draft again, and can be changed and sent again. */
export function RejectDialog({ promotion, onClose }: { promotion: Promotion; onClose: () => void }) {
  const [reject] = useRejectPromotionMutation();
  const { push } = useToast();
  const { busy, error, run } = useSave(onClose);
  const [note, setNote] = useState("");

  return (
    <AppModal
      title="Send the list back?"
      icon={Undo2}
      tone="primary"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isPending={busy}
            onPress={() =>
              void run(async () => {
                const res = await reject({ id: promotion.id, ...(note.trim() ? { note: note.trim() } : {}) }).unwrap();
                push("success", res.message ?? "Sent back");
              })
            }
          >
            Send back
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground-muted">The list goes back to {promotion.createdBy.name} as a draft, to be changed and sent again. Nothing has been given to any student yet.</p>
      <Field id="reject-note" label="Note" optional hint="What to change, for the person who made the list.">
        <Input id="reject-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}
