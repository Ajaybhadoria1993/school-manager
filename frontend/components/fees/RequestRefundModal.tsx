"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import type { ApiResponse, FeeRefund } from "@/types";

export function RequestRefundModal({
  open,
  onClose,
  studentId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  onCreated: (refund: FeeRefund) => void;
}) {
  const { push } = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<ApiResponse<FeeRefund>>("/fees/refunds", {
        studentId,
        amount: Number(amount),
        reason,
      });
      push("success", "Refund request submitted for approval");
      onCreated(res.data);
      onClose();
      setAmount("");
      setReason("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to submit refund request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request Fee Refund">
      <div className="space-y-4">
        <FormField label="Amount (₹)" hint="Capped at what this student has actually paid">
          <Input type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label="Reason">
          <Textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Student withdrawing mid-year, sibling discount applied late…" />
        </FormField>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!amount || !reason} onClick={submit}>
            Submit Request
          </Button>
        </div>
      </div>
    </Modal>
  );
}
