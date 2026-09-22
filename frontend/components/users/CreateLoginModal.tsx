"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import type { ApiResponse, Guardian, Staff, UserAccount, UserRole } from "@/types";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "school_admin", label: "School Admin" },
  { value: "principal", label: "Principal" },
  { value: "accountant", label: "Accountant" },
  { value: "teacher", label: "Teacher" },
  { value: "parent", label: "Parent" },
];

export function CreateLoginModal({
  open,
  onClose,
  onCreated,
  presetRole,
  presetStaffId,
  presetGuardianId,
  presetName,
  presetPhone,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  presetRole?: UserRole;
  presetStaffId?: string;
  presetGuardianId?: string;
  presetName?: string;
  presetPhone?: string;
}) {
  const { push } = useToast();
  const [role, setRole] = useState<UserRole>(presetRole ?? "teacher");
  const [name, setName] = useState(presetName ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(presetPhone ?? "");
  const [password, setPassword] = useState("");
  const [staffId, setStaffId] = useState(presetStaffId ?? "");
  const [guardianId, setGuardianId] = useState(presetGuardianId ?? "");
  const [guardianQuery, setGuardianQuery] = useState("");
  const [guardianResults, setGuardianResults] = useState<Guardian[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<Guardian | null>(null);
  const [availableStaff, setAvailableStaff] = useState<Staff[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRole(presetRole ?? "teacher");
    setName(presetName ?? "");
    setPhone(presetPhone ?? "");
    setStaffId(presetStaffId ?? "");
    setGuardianId(presetGuardianId ?? "");
    setEmail("");
    setPassword("");
    setError(null);
    setSelectedGuardian(null);
    setGuardianQuery("");
  }, [open, presetRole, presetStaffId, presetGuardianId, presetName, presetPhone]);

  // For "teacher": only offer staff who don't already have a login.
  useEffect(() => {
    if (!open || role !== "teacher" || presetStaffId) return;
    Promise.all([
      api.get<ApiResponse<Staff[]>>("/staff", { category: "teaching" }),
      api.get<ApiResponse<UserAccount[]>>("/users", { role: "teacher" }),
    ]).then(([staffRes, usersRes]) => {
      const linkedStaffIds = new Set(
        usersRes.data.map((u) => (typeof u.staffProfileId === "string" ? u.staffProfileId : u.staffProfileId?._id))
      );
      setAvailableStaff(staffRes.data.filter((s) => !linkedStaffIds.has(s._id)));
    });
  }, [open, role, presetStaffId]);

  useEffect(() => {
    if (!guardianQuery || presetGuardianId) return;
    const t = setTimeout(() => {
      api.get<ApiResponse<Guardian[]>>("/guardians", { q: guardianQuery }).then((res) => setGuardianResults(res.data));
    }, 250);
    return () => clearTimeout(t);
  }, [guardianQuery, presetGuardianId]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post("/users", {
        name,
        email,
        phone: phone || undefined,
        password,
        role,
        staffProfileId: role === "teacher" ? staffId || undefined : undefined,
        guardianProfileId: role === "parent" ? guardianId || undefined : undefined,
      });
      push("success", `Login created for ${name}`);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to create login");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    name &&
    email &&
    password.length >= 6 &&
    (role !== "teacher" || staffId) &&
    (role !== "parent" || guardianId);

  return (
    <Modal open={open} onClose={onClose} title="Create Login">
      <div className="space-y-4">
        <FormField label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={!!presetRole}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </FormField>

        {role === "teacher" && !presetStaffId && (
          <FormField label="Link to Staff Member" hint={availableStaff.length === 0 ? "All teaching staff already have logins" : undefined}>
            <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Select staff member</option>
              {availableStaff.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} — {s.designation}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {role === "parent" && !presetGuardianId && (
          <FormField label="Link to Guardian" hint="Search by phone or name — must be an existing guardian record">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                className="pl-9"
                placeholder="Search guardian…"
                value={selectedGuardian ? selectedGuardian.name : guardianQuery}
                onChange={(e) => {
                  setGuardianQuery(e.target.value);
                  setSelectedGuardian(null);
                  setGuardianId("");
                }}
              />
              {guardianResults.length > 0 && !selectedGuardian && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
                  {guardianResults.map((g) => (
                    <button
                      key={g._id}
                      type="button"
                      onClick={() => {
                        setSelectedGuardian(g);
                        setGuardianId(g._id);
                        setGuardianResults([]);
                        if (!name) setName(g.name);
                        if (!phone) setPhone(g.phone);
                        if (g.userId) setError("This guardian already has a login account.");
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted"
                    >
                      <span className="text-foreground">{g.name}</span>
                      <span className="text-xs text-foreground-muted">{g.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FormField>
        )}

        <FormField label="Full Name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Phone" hint="Optional">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
        <FormField label="Temporary Password" hint="Min. 6 characters — share this with the user directly">
          <Input type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!canSubmit} onClick={submit}>
            Create Login
          </Button>
        </div>
      </div>
    </Modal>
  );
}
