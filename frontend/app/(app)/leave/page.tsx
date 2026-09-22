"use client";

import { useEffect, useState } from "react";
import { Plus, Check, X, Users2 } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast-context";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { ApplyLeaveModal } from "@/components/leave/ApplyLeaveModal";
import { SubstitutionModal } from "@/components/leave/SubstitutionModal";
import { formatDate } from "@/lib/utils";
import type { ApiResponse, LeaveRequest, LeaveStatus, Staff } from "@/types";

const ADMIN_ROLES = ["super_admin", "school_admin", "principal"];

const STATUS_TONE: Record<LeaveStatus, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export default function LeavePage() {
  const { user } = useAuth();
  const { push } = useToast();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [subModalId, setSubModalId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiResponse<LeaveRequest[]>>("/leave");
    setRequests(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, status: "approved" | "rejected") {
    setDecidingId(id);
    try {
      await api.patch(`/leave/${id}/decide`, { status });
      push("success", `Leave request ${status}`);
      load();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to update request");
    } finally {
      setDecidingId(null);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Leave {isAdmin ? "Requests" : "& Attendance"}</h2>
          <p className="text-sm text-foreground-muted">
            {isAdmin
              ? "Review and approve staff leave applications, and assign substitutes."
              : "Apply for leave and track your request status."}
          </p>
        </div>
        <Button onClick={() => setApplyOpen(true)}>
          <Plus className="size-4" />
          Apply for Leave
        </Button>
      </div>

      {isAdmin && pending.length > 0 && (
        <Card className="border-warning/30 bg-warning-soft/40 p-4">
          <p className="text-sm font-medium text-foreground">
            {pending.length} request{pending.length > 1 ? "s" : ""} awaiting your approval
          </p>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-6 text-sm text-foreground-muted">Loading leave requests…</div>
        ) : requests.length === 0 ? (
          <EmptyState title="No leave requests" description="Apply for leave using the button above." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                {isAdmin && <Th>Staff</Th>}
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                {isAdmin && <Th></Th>}
              </Tr>
            </Thead>
            <tbody>
              {requests.map((r) => {
                const staff = r.staffId as Staff;
                return (
                  <Tr key={r._id}>
                    {isAdmin && (
                      <Td className="font-medium">
                        {staff?.name}
                        <p className="text-xs font-normal text-foreground-muted">{staff?.designation}</p>
                      </Td>
                    )}
                    <Td className="capitalize">{r.leaveType}</Td>
                    <Td>
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </Td>
                    <Td className="max-w-xs truncate text-foreground-muted">{r.reason}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status]} className="capitalize">
                        {r.status}
                      </Badge>
                    </Td>
                    {isAdmin && (
                      <Td>
                        <div className="flex items-center gap-1.5">
                          {r.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                loading={decidingId === r._id}
                                onClick={() => decide(r._id, "approved")}
                              >
                                <Check className="size-3.5 text-success" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                loading={decidingId === r._id}
                                onClick={() => decide(r._id, "rejected")}
                              >
                                <X className="size-3.5 text-danger" />
                                Reject
                              </Button>
                            </>
                          )}
                          {r.status === "approved" && staff?.category === "teaching" && (
                            <Button size="sm" variant="ghost" onClick={() => setSubModalId(r._id)}>
                              <Users2 className="size-3.5" />
                              Substitute
                            </Button>
                          )}
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ApplyLeaveModal open={applyOpen} onClose={() => setApplyOpen(false)} onCreated={() => load()} />
      <SubstitutionModal open={!!subModalId} onClose={() => setSubModalId(null)} leaveRequestId={subModalId} />
    </div>
  );
}
