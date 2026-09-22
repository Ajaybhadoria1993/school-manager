"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { ApiResponse, FeeTransaction, InstallmentBreakdown } from "@/types";

export function CollectPaymentModal({
  open,
  onClose,
  studentId,
  installments,
  onCollected,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  installments: InstallmentBreakdown[];
  onCollected: () => void;
}) {
  const { push } = useToast();
  const due = installments.filter((i) => i.outstanding > 0);
  const [installmentName, setInstallmentName] = useState(due[0]?.name ?? "");
  const [amount, setAmount] = useState<string>(due[0] ? String(due[0].outstanding) : "");
  const [mode, setMode] = useState<"cash" | "cheque" | "dd">("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectInstallment(name: string) {
    setInstallmentName(name);
    const inst = due.find((i) => i.name === name);
    setAmount(inst ? String(inst.outstanding) : "");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<ApiResponse<FeeTransaction>>("/fees/collect", {
        studentId,
        installmentName,
        amount: Number(amount),
        mode,
        chequeNumber: mode !== "cash" ? chequeNumber : undefined,
        bankName: mode !== "cash" ? bankName : undefined,
      });
      push("success", `Payment collected — Receipt ${res.data.receiptNumber}`);
      onCollected();
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Collect Fee Payment">
      {due.length === 0 ? (
        <p className="text-sm text-foreground-muted">No outstanding installments for this student.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Installment">
            <Select value={installmentName} onChange={(e) => selectInstallment(e.target.value)}>
              {due.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name} &middot; Outstanding {formatCurrency(i.outstanding)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Amount (₹)" hint="Partial payments are allowed">
            <Input type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>

          <FormField label="Payment Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="dd">Demand Draft</option>
            </Select>
          </FormField>

          {mode !== "cash" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Cheque / DD No.">
                <Input required value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
              </FormField>
              <FormField label="Bank Name">
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </FormField>
            </div>
          )}

          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Collect &amp; Generate Receipt
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
