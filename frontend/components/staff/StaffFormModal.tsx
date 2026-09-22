"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import type { ApiResponse, Staff } from "@/types";

export function StaffFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (staff: Staff) => void;
}) {
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "teaching",
    designation: "",
    phone: "",
    email: "",
    qualification: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<ApiResponse<Staff>>("/staff", form);
      push("success", `${res.data.name} added — Employee ID ${res.data.employeeId}`);
      onCreated(res.data);
      onClose();
      setForm({ name: "", category: "teaching", designation: "", phone: "", email: "", qualification: "" });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to add staff member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Staff Member">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Full Name">
          <Input required value={form.name} onChange={(e) => update("name", e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Category">
            <Select value={form.category} onChange={(e) => update("category", e.target.value)}>
              <option value="teaching">Teaching</option>
              <option value="admin">Admin</option>
              <option value="transport">Transport</option>
              <option value="support">Support</option>
            </Select>
          </FormField>
          <FormField label="Designation">
            <Input required value={form.designation} onChange={(e) => update("designation", e.target.value)} placeholder="TGT - Mathematics" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Phone">
            <Input required value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </FormField>
          <FormField label="Email" hint="Optional">
            <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </FormField>
        </div>
        <FormField label="Qualification" hint="Optional">
          <Input value={form.qualification} onChange={(e) => update("qualification", e.target.value)} placeholder="M.Sc, B.Ed" />
        </FormField>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add Staff
          </Button>
        </div>
      </form>
    </Modal>
  );
}
