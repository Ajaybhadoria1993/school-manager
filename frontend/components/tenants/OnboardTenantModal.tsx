"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import type { ApiResponse, Tenant } from "@/types";

const emptyForm = {
  tenantName: "",
  subscriptionTier: "basic",
  contactEmail: "",
  contactPhone: "",
  branchName: "",
  branchCode: "",
  board: "CBSE",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  adminPassword: "",
};

export function OnboardTenantModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (tenant: Tenant) => void;
}) {
  const { push } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<ApiResponse<{ tenant: Tenant }>>("/tenants/onboard", {
        tenantName: form.tenantName,
        subscriptionTier: form.subscriptionTier,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        branch: { name: form.branchName, code: form.branchCode, board: form.board },
        admin: {
          name: form.adminName,
          email: form.adminEmail,
          phone: form.adminPhone,
          password: form.adminPassword,
        },
      });
      push("success", `${res.data.tenant.name} onboarded successfully`);
      onCreated(res.data.tenant);
      onClose();
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to onboard school");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Onboard New School" widthClass="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Trust / School</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="School / Trust Name">
              <Input required value={form.tenantName} onChange={(e) => update("tenantName", e.target.value)} />
            </FormField>
            <FormField label="Subscription Tier">
              <Select value={form.subscriptionTier} onChange={(e) => update("subscriptionTier", e.target.value)}>
                <option value="basic">Basic</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </Select>
            </FormField>
            <FormField label="Contact Email">
              <Input type="email" required value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} />
            </FormField>
            <FormField label="Contact Phone">
              <Input required value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
            </FormField>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">First Branch</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Branch Name">
              <Input required value={form.branchName} onChange={(e) => update("branchName", e.target.value)} />
            </FormField>
            <FormField label="Branch Code">
              <Input required value={form.branchCode} onChange={(e) => update("branchCode", e.target.value.toUpperCase())} />
            </FormField>
            <FormField label="Board">
              <Select value={form.board} onChange={(e) => update("board", e.target.value)}>
                <option>CBSE</option>
                <option>ICSE</option>
                <option>State Board</option>
                <option>IB</option>
                <option>Other</option>
              </Select>
            </FormField>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">School Admin Login</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Admin Name">
              <Input required value={form.adminName} onChange={(e) => update("adminName", e.target.value)} />
            </FormField>
            <FormField label="Admin Email">
              <Input type="email" required value={form.adminEmail} onChange={(e) => update("adminEmail", e.target.value)} />
            </FormField>
            <FormField label="Admin Phone">
              <Input required value={form.adminPhone} onChange={(e) => update("adminPhone", e.target.value)} />
            </FormField>
            <FormField label="Temporary Password">
              <Input type="text" required minLength={6} value={form.adminPassword} onChange={(e) => update("adminPassword", e.target.value)} />
            </FormField>
          </div>
        </div>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Onboard School
          </Button>
        </div>
      </form>
    </Modal>
  );
}
