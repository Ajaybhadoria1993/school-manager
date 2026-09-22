"use client";

import { useEffect, useState } from "react";
import { Wallet, Undo2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { Badge, feeStatusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { CollectPaymentModal } from "./CollectPaymentModal";
import { RequestRefundModal } from "./RequestRefundModal";
import type { ApiResponse, StudentFeeSummary } from "@/types";

const CAN_COLLECT = ["super_admin", "school_admin", "accountant"];

export function FeeSummaryCard({ studentId }: { studentId: string }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<StudentFeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiResponse<StudentFeeSummary>>(`/fees/students/${studentId}/summary`);
    setSummary(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee Summary</CardTitle>
        {user && CAN_COLLECT.includes(user.role) && summary && (
          <div className="flex gap-2">
            {summary.totals.paid > 0 && (
              <Button size="sm" variant="outline" onClick={() => setRefundModalOpen(true)}>
                <Undo2 className="size-4" />
                Request Refund
              </Button>
            )}
            {summary.totals.outstanding > 0 && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Wallet className="size-4" />
                Collect Payment
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {loading ? (
          <p className="px-5 pb-5 text-sm text-foreground-muted">Loading…</p>
        ) : !summary || !summary.feeStructureId ? (
          <EmptyState
            title="No fee structure configured"
            description="Set up a fee structure for this class under Fees → Structures."
          />
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>Installment</Th>
                  <Th>Due Date</Th>
                  <Th>Net Amount</Th>
                  <Th>Paid</Th>
                  <Th>Outstanding</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <tbody>
                {summary.installments.map((inst) => (
                  <Tr key={inst.name}>
                    <Td className="font-medium">{inst.name}</Td>
                    <Td className={inst.isOverdue ? "text-danger" : ""}>{formatDate(inst.dueDate)}</Td>
                    <Td>{formatCurrency(inst.netAmount)}</Td>
                    <Td>{formatCurrency(inst.paidAmount)}</Td>
                    <Td className="font-medium">{formatCurrency(inst.outstanding)}</Td>
                    <Td>
                      <Badge tone={feeStatusTone[inst.status]} className="capitalize">
                        {inst.isOverdue ? "Overdue" : inst.status}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-end gap-6 border-t border-border px-5 py-3 text-sm">
              <span className="text-foreground-muted">
                Total: <span className="font-medium text-foreground">{formatCurrency(summary.totals.net)}</span>
              </span>
              <span className="text-foreground-muted">
                Paid: <span className="font-medium text-success">{formatCurrency(summary.totals.paid)}</span>
              </span>
              <span className="text-foreground-muted">
                Outstanding:{" "}
                <span className="font-medium text-danger">{formatCurrency(summary.totals.outstanding)}</span>
              </span>
            </div>
          </>
        )}
      </CardContent>

      {summary && (
        <CollectPaymentModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          studentId={studentId}
          installments={summary.installments}
          onCollected={load}
        />
      )}
      <RequestRefundModal
        open={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        studentId={studentId}
        onCreated={() => {}}
      />
    </Card>
  );
}
