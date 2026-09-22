"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import type { ApiResponse, Guardian, Student } from "@/types";

export function StudentFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (student: Student) => void;
}) {
  const { classes, sectionsForClass, activeAcademicYear } = useAcademicSetup();
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    gender: "male",
    classId: "",
    sectionId: "",
    rollNumber: "",
    category: "",
    house: "",
  });

  // Guardian: either link an existing one (sibling admission) or create new.
  const [guardianMode, setGuardianMode] = useState<"new" | "existing">("new");
  const [guardianQuery, setGuardianQuery] = useState("");
  const [guardianResults, setGuardianResults] = useState<Guardian[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<Guardian | null>(null);
  const [guardianForm, setGuardianForm] = useState({ name: "", relation: "Father", phone: "", email: "" });

  // Optional: provision the parent portal login in the same step.
  const [createLogin, setCreateLogin] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setGuardianMode("new");
    setGuardianQuery("");
    setGuardianResults([]);
    setSelectedGuardian(null);
    setGuardianForm({ name: "", relation: "Father", phone: "", email: "" });
    setCreateLogin(true);
    setLoginEmail("");
    setLoginPassword("");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!guardianQuery) return setGuardianResults([]);
    const t = setTimeout(() => {
      api.get<ApiResponse<Guardian[]>>("/guardians", { q: guardianQuery }).then((res) => setGuardianResults(res.data));
    }, 250);
    return () => clearTimeout(t);
  }, [guardianQuery]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value, ...(key === "classId" ? { sectionId: "" } : {}) }));
  }

  const showLoginFields = createLogin && (guardianMode === "new" || (selectedGuardian && !selectedGuardian.userId));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAcademicYear) {
      setError("No active academic year configured. Set one up under School Setup first.");
      return;
    }
    if (guardianMode === "existing" && !selectedGuardian) {
      setError("Search and select an existing guardian, or switch to \"New Guardian\".");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<ApiResponse<Student>>("/students", {
        branchId: activeAcademicYear.branchId,
        academicYearId: activeAcademicYear._id,
        classId: form.classId,
        sectionId: form.sectionId,
        firstName: form.firstName,
        lastName: form.lastName,
        dob: form.dob,
        gender: form.gender,
        rollNumber: form.rollNumber || undefined,
        category: form.category || undefined,
        house: form.house || undefined,
        guardians: [
          guardianMode === "existing"
            ? { existingGuardianId: selectedGuardian!._id, relation: selectedGuardian!.relation }
            : {
                name: guardianForm.name,
                relation: guardianForm.relation,
                phone: guardianForm.phone,
                email: guardianForm.email || undefined,
              },
        ],
      });

      if (showLoginFields && loginEmail && loginPassword) {
        const guardianId = res.data.guardians?.[0]?.guardianId;
        try {
          await api.post("/users", {
            name: guardianMode === "existing" ? selectedGuardian!.name : guardianForm.name,
            email: loginEmail,
            phone: guardianMode === "existing" ? selectedGuardian!.phone : guardianForm.phone,
            password: loginPassword,
            role: "parent",
            guardianProfileId: guardianId,
          });
        } catch (loginErr) {
          push(
            "error",
            loginErr instanceof ApiRequestError
              ? `Student admitted, but parent login failed: ${loginErr.message}`
              : "Student admitted, but parent login could not be created"
          );
        }
      }

      push("success", `${res.data.firstName} ${res.data.lastName} admitted — Admission No. ${res.data.admissionNumber}`);
      onCreated(res.data);
      onClose();
      setForm({ firstName: "", lastName: "", dob: "", gender: "male", classId: "", sectionId: "", rollNumber: "", category: "", house: "" });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to admit student");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Admit New Student" widthClass="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Student Details
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="First Name">
              <Input required value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
            </FormField>
            <FormField label="Last Name">
              <Input required value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </FormField>
            <FormField label="Date of Birth">
              <Input type="date" required value={form.dob} onChange={(e) => update("dob", e.target.value)} />
            </FormField>
            <FormField label="Gender">
              <Select value={form.gender} onChange={(e) => update("gender", e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </FormField>
            <FormField label="Class">
              <Select required value={form.classId} onChange={(e) => update("classId", e.target.value)}>
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Section">
              <Select
                required
                value={form.sectionId}
                onChange={(e) => update("sectionId", e.target.value)}
                disabled={!form.classId}
              >
                <option value="">Select section</option>
                {sectionsForClass(form.classId).map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Roll Number" hint="Optional">
              <Input value={form.rollNumber} onChange={(e) => update("rollNumber", e.target.value)} />
            </FormField>
            <FormField label="House" hint="Optional">
              <Input value={form.house} onChange={(e) => update("house", e.target.value)} />
            </FormField>
            <FormField label="Category" hint="For statutory reporting, optional">
              <Input value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="General / OBC / SC / ST / EWS" />
            </FormField>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Guardian</p>
            <div className="flex rounded-lg border border-border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setGuardianMode("new")}
                className={`rounded-md px-2.5 py-1 ${guardianMode === "new" ? "bg-primary text-primary-foreground" : "text-foreground-muted"}`}
              >
                New Guardian
              </button>
              <button
                type="button"
                onClick={() => setGuardianMode("existing")}
                className={`rounded-md px-2.5 py-1 ${guardianMode === "existing" ? "bg-primary text-primary-foreground" : "text-foreground-muted"}`}
              >
                Existing Guardian (sibling)
              </button>
            </div>
          </div>

          {guardianMode === "new" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Guardian Name">
                <Input required value={guardianForm.name} onChange={(e) => setGuardianForm((g) => ({ ...g, name: e.target.value }))} />
              </FormField>
              <FormField label="Relation">
                <Select value={guardianForm.relation} onChange={(e) => setGuardianForm((g) => ({ ...g, relation: e.target.value }))}>
                  <option>Father</option>
                  <option>Mother</option>
                  <option>Legal Guardian</option>
                </Select>
              </FormField>
              <FormField label="Phone">
                <Input required value={guardianForm.phone} onChange={(e) => setGuardianForm((g) => ({ ...g, phone: e.target.value }))} placeholder="10-digit mobile" />
              </FormField>
              <FormField label="Email" hint="Optional">
                <Input type="email" value={guardianForm.email} onChange={(e) => setGuardianForm((g) => ({ ...g, email: e.target.value }))} />
              </FormField>
            </div>
          ) : (
            <FormField label="Search Guardian" hint="Search by phone or name to link this student to an existing family">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
                <Input
                  className="pl-9"
                  placeholder="Search guardian…"
                  value={selectedGuardian ? `${selectedGuardian.name} (${selectedGuardian.phone})` : guardianQuery}
                  onChange={(e) => {
                    setGuardianQuery(e.target.value);
                    setSelectedGuardian(null);
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
                          setGuardianResults([]);
                        }}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-surface-muted"
                      >
                        <span className="font-medium text-foreground">
                          {g.name} <span className="font-normal text-foreground-muted">({g.phone})</span>
                        </span>
                        {g.studentIds && g.studentIds.length > 0 && (
                          <span className="text-xs text-foreground-muted">
                            Children: {g.studentIds.map((s) => s.firstName).join(", ")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </FormField>
          )}
        </div>

        <div className="rounded-xl border border-border p-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
            Create parent portal login now
          </label>
          {guardianMode === "existing" && selectedGuardian?.userId && (
            <p className="mt-1 text-xs text-foreground-muted">This guardian already has a login — nothing new will be created.</p>
          )}
          {showLoginFields && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Parent Email">
                <Input type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              </FormField>
              <FormField label="Temporary Password">
                <Input type="text" required minLength={6} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
              </FormField>
            </div>
          )}
        </div>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Admit Student
          </Button>
        </div>
      </form>
    </Modal>
  );
}
