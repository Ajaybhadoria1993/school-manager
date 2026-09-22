"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import type { ApiResponse, ClassMaster, LeaveRequest, Section, Staff, Subject, Substitution, TeacherAllocation } from "@/types";

interface CandidatesResponse {
  leaveRequest: LeaveRequest;
  allocations: TeacherAllocation[];
  existingSubstitutions: Substitution[];
  availableTeachers: Staff[];
}

export function SubstitutionModal({
  open,
  onClose,
  leaveRequestId,
}: {
  open: boolean;
  onClose: () => void;
  leaveRequestId: string | null;
}) {
  const { push } = useToast();
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !leaveRequestId) return;
    setLoading(true);
    api
      .get<ApiResponse<CandidatesResponse>>(`/leave/${leaveRequestId}/substitution-candidates`)
      .then((res) => {
        setData(res.data);
        const initial: Record<string, string> = {};
        for (const sub of res.data.existingSubstitutions) {
          const allocId = typeof sub.allocationId === "string" ? sub.allocationId : sub.allocationId._id;
          const subId = typeof sub.substituteStaffId === "string" ? sub.substituteStaffId : sub.substituteStaffId._id;
          initial[allocId] = subId;
        }
        setSelections(initial);
      })
      .finally(() => setLoading(false));
  }, [open, leaveRequestId]);

  async function assign(allocationId: string) {
    if (!leaveRequestId || !selections[allocationId]) return;
    setSavingId(allocationId);
    try {
      await api.post(`/leave/${leaveRequestId}/substitution`, {
        allocationId,
        substituteStaffId: selections[allocationId],
      });
      push("success", "Substitute assigned");
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to assign substitute");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign Substitute Teacher" widthClass="max-w-xl">
      {loading || !data ? (
        <p className="text-sm text-foreground-muted">Loading allocations…</p>
      ) : data.allocations.length === 0 ? (
        <p className="text-sm text-foreground-muted">This staff member has no class/subject allocations.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted">
            Pick a substitute for each class/subject this teacher covers during their leave. The substitute only gets
            access to that specific slot.
          </p>
          {data.allocations.map((alloc) => (
            <div key={alloc._id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {(alloc.classId as ClassMaster)?.name} - {(alloc.sectionId as Section)?.name}
                </p>
                <p className="text-xs text-foreground-muted">{(alloc.subjectId as Subject)?.name}</p>
                {alloc.isClassTeacher && (
                  <Badge tone="primary" className="mt-1">
                    Class Teacher
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  className="w-44"
                  value={selections[alloc._id] ?? ""}
                  onChange={(e) => setSelections((s) => ({ ...s, [alloc._id]: e.target.value }))}
                >
                  <option value="">Select substitute</option>
                  {data.availableTeachers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selections[alloc._id]}
                  loading={savingId === alloc._id}
                  onClick={() => assign(alloc._id)}
                >
                  Save
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
