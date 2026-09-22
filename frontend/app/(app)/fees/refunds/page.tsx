"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, X, Banknote } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast-context";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, FormField, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ApiResponse, FeeRefund, RefundMode, RefundStatus, Student } from "@/types";

const STATUS_TONE: Record<RefundStatus, "warning" | "success" | "danger" | "primary"> = {
  pending: "warning",
  approved: "primary",
  rejected: "danger",
  processed: "success",
};

const APPROVE_ROLES = ["super_admin", "school_admin", "principal"];
const PROCESS_ROLES = ["super_admin", "school_admin", "accountant"];

export default function RefundsPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const router = useRouter();
  const [refunds, setRefunds] = useState<FeeRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [processTarget, setProcessTarget] = useState<FeeRefund | null>(null);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiResponse<FeeRefund[]>>("/fees/refunds");
    setRefunds(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    try {
      await api.patch(`/fees/refunds/${id}/decide`, { status });
      push("success", `Refund ${status}`);
      load();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to update refund");
    } finally {
      setBusyId(null);
    }
  }

  const canApprove = !!user && APPROVE_ROLES.includes(user.role);
  const canProcess = !!user && PROCESS_ROLES.includes(user.role);

  return (
    <div className="space-y-5">
      <button onClick={() => router.push("/fees")} className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to Fees
      </button>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Fee Refunds</h2>
        <p className="text-sm text-foreground-muted">Request → Approve (Principal/Admin) → Process (Accountant).</p>
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-6 text-sm text-foreground-muted">Loading…</div>
        ) : refunds.length === 0 ? (
          <EmptyState title="No refund requests" description="Request a refund from a student's Fee Summary page." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Student</Th>
                <Th>Amount</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th>Requested</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <tbody>
              {refunds.map((r) => {
                const student = r.studentId as Student;
                return (
                  <Tr key={r._id}>
                    <Td className="font-medium">
                      {student?.firstName} {student?.lastName}
                    </Td>
                    <Td>{formatCurrency(r.amount)}</Td>
                    <Td className="max-w-xs truncate text-foreground-muted">{r.reason}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status]} className="capitalize">
                        {r.status}
                      </Badge>
                      {r.status === "processed" && r.refundMode && (
                        <span className="ml-1.5 text-xs text-foreground-muted">via {r.refundMode.replace("_", " ")}</span>
                      )}
                    </Td>
                    <Td>{formatDate(r.createdAt)}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {r.status === "pending" && canApprove && (
                          <>
                            <Button size="sm" variant="outline" loading={busyId === r._id} onClick={() => decide(r._id, "approved")}>
                              <Check className="size-3.5 text-success" />
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" loading={busyId === r._id} onClick={() => decide(r._id, "rejected")}>
                              <X className="size-3.5 text-danger" />
                              Reject
                            </Button>
                          </>
                        )}
                        {r.status === "approved" && canProcess && (
                          <Button size="sm" onClick={() => setProcessTarget(r)}>
                            <Banknote className="size-3.5" />
                            Process
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ProcessRefundModal refund={processTarget} onClose={() => setProcessTarget(null)} onProcessed={load} />
    </div>
  );
}

function ProcessRefundModal({
  refund,
  onClose,
  onProcessed,
}: {
  refund: FeeRefund | null;
  onClose: () => void;
  onProcessed: () => void;
}) {
  const { push } = useToast();
  const [mode, setMode] = useState<RefundMode>("bank_transfer");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!refund) return;
    setSaving(true);
    try {
      await api.patch(`/fees/refunds/${refund._id}/process`, { refundMode: mode, referenceNote: note });
      push("success", "Refund marked as processed");
      onProcessed();
      onClose();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to process refund");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!refund} onClose={onClose} title="Process Refund">
      <div className="space-y-4">
        <p className="text-sm text-foreground-muted">
          Mark {formatCurrency(refund?.amount ?? 0)} as refunded to the guardian. This is recorded for audit — actually
          transfer the money via your bank/UPI app separately.
        </p>
        <FormField label="Refund Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value as RefundMode)}>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
          </Select>
        </FormField>
        <FormField label="Reference Note" hint="UTR number, cheque number, etc.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={submit}>
            Confirm Processed
          </Button>
        </div>
      </div>
    </Modal>
  );
}
