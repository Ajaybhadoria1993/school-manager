import { useState } from "react";
import { BadgePercent, Ban } from "lucide-react";
import { useCancelReceiptMutation, useGetConcessionsQuery, useGiveStudentConcessionMutation } from "../../redux/api/feesApi";
import type { FeeAccount, Receipt } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { offWords } from "../../utils/fees";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Textarea } from "../ui/Input";
import { Select } from "../ui/Select";
import { useToast } from "../ui/toast-context";

/**
 * Give a student one of the school's concessions for this session. One that needs approval waits for the school admin or the principal (a person
 * who runs the school gives it at once); it takes nothing off until it is approved. A concession the student already has is not offered again.
 */
export function GiveConcessionDialog({ account, onClose }: { account: FeeAccount; onClose: () => void }) {
  const [concessionId, setConcessionId] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const list = useGetConcessionsQuery("active");
  const [give, giving] = useGiveStudentConcessionMutation();
  const { push } = useToast();
  const have = new Set(account.concessions.map((c) => c.name));
  const options = (list.data?.data.items ?? []).filter((c) => !have.has(c.name));
  const chosen = options.find((c) => c.id === concessionId);

  async function submit() {
    if (!concessionId) return setProblem("Choose the concession");
    setProblem(null);
    try {
      const res = await give({ studentId: account.student.id, concessionId, note: note.trim() }).unwrap();
      const waiting = res.data.concessions.find((c) => c.name === chosen?.name)?.status === "pending";
      push("success", waiting ? "Concession noted: it waits for the principal's approval" : "Concession given");
      onClose();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not give the concession. Please try again.");
    }
  }

  return (
    <AppModal
      title={`Give a concession to ${account.student.name}`}
      icon={BadgePercent}
      busy={giving.isLoading}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={giving.isLoading}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={giving.isLoading} disabled={options.length === 0}>
            Give
          </Button>
        </>
      }
    >
      {options.length === 0 && !list.isLoading ? (
        <p className="text-sm text-foreground-secondary">The school has no other concession to give. Add one in Concessions first.</p>
      ) : (
        <>
          <Field id="give-concession" label="Concession">
            <Select id="give-concession" options={options.map((c) => ({ value: c.id, label: `${c.name} (${offWords(c)})` }))} value={concessionId} onChange={setConcessionId} placeholder="Choose the concession" />
          </Field>
          {chosen?.needsApproval && <p className="text-xs text-foreground-muted">This concession needs the principal&apos;s or the school admin&apos;s approval. Until then it takes nothing off.</p>}
          <Field id="give-note" label="Why this student gets it" optional hint="For example: brother is in Class 8. Keep the proof (a certificate) in the school office.">
            <Textarea id="give-note" value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
      <ModalError message={problem} />
    </AppModal>
  );
}

/** Cancel a receipt: the money goes back to the instalments it settled and the number stays on record. A reason is needed. */
export function CancelReceiptDialog({ receipt, onClose }: { receipt: Pick<Receipt, "id" | "number" | "studentName" | "total">; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [cancel, cancelling] = useCancelReceiptMutation();
  const { push } = useToast();

  async function submit() {
    if (reason.trim() === "") return setProblem("Write why it is cancelled");
    setProblem(null);
    try {
      await cancel({ id: receipt.id, reason: reason.trim() }).unwrap();
      push("success", `Receipt ${receipt.number} cancelled`);
      onClose();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not cancel the receipt. Please try again.");
    }
  }

  return (
    <AppModal
      title={`Cancel receipt ${receipt.number}`}
      icon={Ban}
      tone="danger"
      busy={cancelling.isLoading}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={cancelling.isLoading}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={cancelling.isLoading}>
            Cancel the receipt
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground-secondary">
        The money taken from {receipt.studentName} goes back to the instalments it paid, so they show as owed again. The receipt number stays on record, marked cancelled.
      </p>
      <Field id="cancel-reason" label="Why is it cancelled?">
        <Textarea id="cancel-reason" value={reason} maxLength={200} rows={2} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ModalError message={problem} />
    </AppModal>
  );
}
