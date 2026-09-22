"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import type { ApiResponse, Certificate, CertificateType } from "@/types";

export function IssueCertificateModal({
  open,
  onClose,
  type,
  studentId,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  type: CertificateType;
  studentId: string;
  onIssued: (cert: Certificate) => void;
}) {
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [lastDate, setLastDate] = useState("");
  const [conduct, setConduct] = useState("Good");
  const [purpose, setPurpose] = useState("");
  const [financialYear, setFinancialYear] = useState("2026-27");

  const titles: Record<CertificateType, string> = {
    transfer: "Issue Transfer Certificate",
    bonafide: "Issue Bonafide Certificate",
    fee_paid: "Issue Fee Paid Certificate",
  };

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      let res: ApiResponse<Certificate>;
      if (type === "transfer") {
        res = await api.post<ApiResponse<Certificate>>("/certificates/transfer", {
          studentId,
          reasonForLeaving: reason,
          lastAttendanceDate: lastDate,
          conduct,
        });
      } else if (type === "bonafide") {
        res = await api.post<ApiResponse<Certificate>>("/certificates/bonafide", { studentId, purpose });
      } else {
        res = await api.post<ApiResponse<Certificate>>("/certificates/fee-paid", { studentId, financialYear });
      }
      push("success", `Certificate issued — Serial ${res.data.serialNumber}`);
      onIssued(res.data);
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to issue certificate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={titles[type]}>
      <div className="space-y-4">
        {type === "transfer" && (
          <>
            <FormField label="Reason for Leaving">
              <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
            <FormField label="Last Date of Attendance">
              <Input type="date" required value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
            </FormField>
            <FormField label="Conduct">
              <Select value={conduct} onChange={(e) => setConduct(e.target.value)}>
                <option>Excellent</option>
                <option>Good</option>
                <option>Satisfactory</option>
              </Select>
            </FormField>
          </>
        )}
        {type === "bonafide" && (
          <FormField label="Purpose" hint="e.g. Passport application, bank account opening">
            <Textarea required rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </FormField>
        )}
        {type === "fee_paid" && (
          <FormField label="Financial Year">
            <Input required placeholder="2026-27" value={financialYear} onChange={(e) => setFinancialYear(e.target.value)} />
          </FormField>
        )}

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={submit}>
            Issue Certificate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
