import { useState } from "react";
import { Ban, FileBadge, Plus } from "lucide-react";
import { useCan } from "../../hooks/useCan";
import { useGetCertificatesQuery } from "../../redux/api/documentsApi";
import type { Certificate, CertificateType } from "../../types";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { StudentsNotice } from "../students/StudentsNotice";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { CancelCertificateDialog, CERTIFICATE_LABEL, CertificateDialog, IssueCertificateDialog } from "./CertificateDialogs";

const FILTERS: { value: CertificateType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bonafide", label: "Bonafide" },
  { value: "character", label: "Character" },
  { value: "transfer", label: "Transfer (TC)" },
];

/** Documents > Certificates: the register of what the school has issued (newest first, by kind), each to open and print again; issue one, cancel one. */
export function CertificatesPanel() {
  const can = useCan();
  const mayManage = can("documents.manage");
  const [kind, setKind] = useState<CertificateType | "all">("all");
  const [issuing, setIssuing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Pick<Certificate, "id" | "number"> | null>(null);
  const res = useGetCertificatesQuery(kind === "all" ? {} : { type: kind });
  const items = res.data?.data.items;

  return (
    <section aria-label="Certificates" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Kind" className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
          {FILTERS.map((f) => (
            <label key={f.value} className="relative">
              <input type="radio" name="certificate-kind" className="peer sr-only" checked={kind === f.value} onChange={() => setKind(f.value)} />
              <span className="inline-flex h-9 cursor-pointer items-center rounded-lg px-3.5 text-sm font-semibold text-foreground-muted transition-colors peer-checked:bg-primary-soft peer-checked:text-primary-deep peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20">{f.label}</span>
            </label>
          ))}
        </div>
        {mayManage && (
          <Button onClick={() => setIssuing(true)}>
            <Plus className="size-4" aria-hidden />
            Issue a certificate
          </Button>
        )}
      </div>

      {!items ? (
        res.error ? (
          <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the certificates."}</Card>
        ) : (
          <Skeleton className="h-48 rounded-2xl" />
        )
      ) : items.length === 0 ? (
        <StudentsNotice icon={FileBadge} tone="primary" title="No certificate issued yet" />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Certificates issued</caption>
            <thead className="border-b border-border bg-background text-left text-[11px] font-bold uppercase tracking-wider text-foreground-muted">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Number
                </th>
                <th scope="col" className="px-3 py-3">
                  Student
                </th>
                <th scope="col" className="px-3 py-3">
                  Kind
                </th>
                <th scope="col" className="px-3 py-3">
                  Date
                </th>
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-surface-muted">
                  <th scope="row" className="px-3 py-3 text-left">
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setOpenId(c.id)}>
                      {c.number}
                    </button>
                  </th>
                  <td className="px-3 py-3">
                    {c.facts.studentName}
                    <span className="block text-xs text-foreground-muted">{[c.facts.classLabel, c.facts.admissionNumber].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="px-3 py-3 text-foreground-secondary">
                    {CERTIFICATE_LABEL[c.type]}
                    {c.purpose && <span className="block text-xs text-foreground-muted">{c.purpose}</span>}
                  </td>
                  <td className="px-3 py-3 text-foreground-secondary">{formatDay(c.issuedOn)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {c.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Valid</Badge>}
                      {c.status === "valid" && mayManage && (
                        <Button variant="ghost" size="sm" aria-label={`Cancel ${c.number}`} onClick={() => setCancelling({ id: c.id, number: c.number })}>
                          <Ban className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {res.data && res.data.data.items.length >= res.data.data.limit && <p className="text-xs text-foreground-muted">Showing the latest {res.data.data.limit} certificates.</p>}

      {issuing && (
        <IssueCertificateDialog
          onClose={() => setIssuing(false)}
          onIssued={(c) => {
            setIssuing(false);
            setOpenId(c.id);
          }}
        />
      )}
      {openId && <CertificateDialog id={openId} onClose={() => setOpenId(null)} />}
      {cancelling && <CancelCertificateDialog certificate={cancelling} onClose={() => setCancelling(null)} />}
    </section>
  );
}
