"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ApiResponse, LeaveRequest, Staff } from "@/types";

export function ApplyLeaveModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (req: LeaveRequest) => void;
}) {
  const { user } = useAuth();
  const { push } = useToast();
  const isSelfService = user?.role === "teacher";

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [form, setForm] = useState({
    staffId: "",
    leaveType: "casual",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || isSelfService) return;
    api.get<ApiResponse<Staff[]>>("/staff").then((res) => setStaffList(res.data));
  }, [open, isSelfService]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<ApiResponse<LeaveRequest>>("/leave", {
        staffId: isSelfService ? undefined : form.staffId,
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
      });
      push("success", "Leave request submitted");
      onCreated(res.data);
      onClose();
      setForm({ staffId: "", leaveType: "casual", startDate: "", endDate: "", reason: "" });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to submit leave request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Apply for Leave">
      <form onSubmit={onSubmit} className="space-y-4">
        {!isSelfService && (
          <FormField label="Staff Member">
            <Select required value={form.staffId} onChange={(e) => update("staffId", e.target.value)}>
              <option value="">Select staff</option>
              {staffList.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} &middot; {s.designation}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Leave Type">
          <Select value={form.leaveType} onChange={(e) => update("leaveType", e.target.value)}>
            <option value="casual">Casual</option>
            <option value="sick">Sick</option>
            <option value="earned">Earned</option>
            <option value="other">Other</option>
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Date">
            <Input type="date" required value={form.startDate} onChange={(e) => update("startDate", e.target.value)} />
          </FormField>
          <FormField label="End Date">
            <Input type="date" required value={form.endDate} onChange={(e) => update("endDate", e.target.value)} />
          </FormField>
        </div>
        <FormField label="Reason">
          <Textarea required rows={3} value={form.reason} onChange={(e) => update("reason", e.target.value)} />
        </FormField>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Submit Request
          </Button>
        </div>
      </form>
    </Modal>
  );
}
