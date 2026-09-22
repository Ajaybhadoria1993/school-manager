"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast-context";
import { Button } from "@/components/ui/Button";
import { CertificatePrintView } from "@/components/certificates/CertificatePrintView";
import type { ApiResponse, Certificate } from "@/types";

const ISSUER_ROLES = ["super_admin", "school_admin", "principal"];

export default function CertificateViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { push } = useToast();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [reissuing, setReissuing] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiResponse<Certificate>>(`/certificates/${params.id}`);
    setCertificate(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function reissue() {
    setReissuing(true);
    try {
      const res = await api.post<ApiResponse<Certificate>>(`/certificates/${params.id}/reissue`, {});
      push("success", `Re-issued with new serial ${res.data.serialNumber}`);
      router.push(`/certificates/view/${res.data._id}`);
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to re-issue");
    } finally {
      setReissuing(false);
    }
  }

  if (loading) return <p className="text-sm text-foreground-muted">Loading…</p>;
  if (!certificate) return <p className="text-sm text-foreground-muted">Certificate not found.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back
        </button>
        {user && ISSUER_ROLES.includes(user.role) && certificate.status === "issued" && (
          <Button variant="outline" size="sm" loading={reissuing} onClick={reissue}>
            <RefreshCcw className="size-3.5" />
            Re-issue (correction)
          </Button>
        )}
      </div>
      <CertificatePrintView certificate={certificate} branchName={certificate.branchName ?? ""} />
    </div>
  );
}
